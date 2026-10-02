"""STEEL//DIRECTIVE game server.

Serves the static game and two AI endpoints:
  POST /api/plan    LLM commander: turns coach strategy + battlefield state into
                    per-unit orders with an instruction for every JEV stream.
  POST /api/decide  Three parallel TypeSafe JEV streams (navigation, turret,
                    weapon) choose one action each from a fixed vocabulary.
Both are optional: without keys the browser falls back to its local planner
and local stream policy that use the same action vocabulary.
"""
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent
LOG_FILE = ROOT / "logs" / "combat.jsonl"


def load_env():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        if "=" not in raw or raw.lstrip().startswith("#"):
            continue
        key, value = raw.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
TRUST_ENV = os.getenv("USE_SYSTEM_PROXY", "0").lower() in {"1", "true", "yes"}
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "127.0.0.1")
pool = ThreadPoolExecutor(max_workers=48)
log_lock = threading.Lock()

# ---------------------------------------------------------------- clients
jev_client = None
JEV_KEY = os.getenv("TYPESAFE_API_KEY") or os.getenv("KEY")
if JEV_KEY:
    try:
        import httpx2
        from typesafe_sdk import Choice, RetryPolicy, TypeSafeClient

        # Direct keep-alive connections: fresh TLS handshakes (and some system
        # proxies) were the source of multi-second stalls, so connect fast,
        # retry fast and keep a warm pool.
        _http = httpx2.Client(trust_env=TRUST_ENV, timeout=httpx2.Timeout(8, connect=1.5),
                              limits=httpx2.Limits(max_connections=64, max_keepalive_connections=48, keepalive_expiry=120))
        jev_client = TypeSafeClient(api_key=JEV_KEY, http_client=_http,
                                    retry=RetryPolicy(max_retries=3, backoff_initial=0.05, backoff_max=0.4, timeout=10))
        JEV_BASE = os.getenv("TYPESAFE_BASE_URL", "https://api.typesafe.ai")

        def warm_pool(n=18):
            """Open n pooled TLS connections up front (a cheap GET per socket)."""
            def touch(_):
                try:
                    _http.get(JEV_BASE + "/", timeout=4)
                except Exception:
                    pass
            list(ThreadPoolExecutor(n).map(touch, range(n)))

        def keep_warm():
            while True:
                warm_pool()
                time.sleep(60)

        threading.Thread(target=keep_warm, daemon=True).start()
    except ImportError as exc:  # SDK missing: run without JEV
        print(f"[jev] disabled: {exc}")

llm_client = None
LLM_MODEL = os.getenv("AI_MODEL", "deepseek/deepseek-v3.2")
LLM_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "1500"))  # raise for reasoning models
# Extra request fields. DeepSeek v4 "flash" models think by default; the commander
# needs speed and few tokens, so thinking is switched off unless overridden.
LLM_EXTRA = json.loads(os.getenv("AI_EXTRA_BODY") or "null")
if LLM_EXTRA is None and "deepseek-v4" in LLM_MODEL:
    LLM_EXTRA = {"thinking": {"type": "disabled"}}
if os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY"):
    try:
        import httpx
        from openai import OpenAI

        llm_client = OpenAI(
            api_key=os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("AI_BASE_URL") or None,
            timeout=60,
            # AI_PROXY routes only the commander through a proxy (JEV stays direct).
            http_client=httpx.Client(proxy=os.getenv("AI_PROXY") or None, trust_env=TRUST_ENV, timeout=60),
        )
    except ImportError as exc:
        print(f"[llm] disabled: {exc}")


class Breaker:
    """Stop hammering an unreachable backend; retry after a cool-down."""

    def __init__(self, threshold=4, cooldown=20):
        self.failures, self.until, self.threshold, self.cooldown = 0, 0.0, threshold, cooldown

    def open(self):
        return time.time() < self.until

    def ok(self):
        self.failures = 0

    def fail(self):
        self.failures += 1
        if self.failures >= self.threshold:
            self.until, self.failures = time.time() + self.cooldown, 0


jev_breaker, llm_breaker = Breaker(), Breaker(3, 30)

# ---------------------------------------------------------------- spend tracking
# Prices per 1M tokens. Known defaults are list prices; override in .env for your provider.
KNOWN_PRICES = {"deepseek/deepseek-v3.2": (0.28, 0.42), "deepseek-v4.1-flash": (0.14, 0.28), "openai/gpt-4.1-mini": (0.4, 1.6), "gpt-4.1-mini": (0.4, 1.6)}
usage = {"llm": {"calls": 0, "input": 0, "output": 0}, "jev": {"calls": 0, "input": 0, "output": 0}}
usage_lock = threading.Lock()
_balance_cache = {"at": 0.0, "value": None}


def price(kind):
    if kind == "llm":
        default = KNOWN_PRICES.get(LLM_MODEL, (None, None))
        return (float(os.getenv("AI_PRICE_IN", default[0] or 0)) or None, float(os.getenv("AI_PRICE_OUT", default[1] or 0)) or None)
    return (float(os.getenv("JEV_PRICE_IN", 0)) or None, float(os.getenv("JEV_PRICE_OUT", 0)) or None)


def record_usage(kind, used):
    if not used:
        return
    with usage_lock:
        usage[kind]["calls"] += 1
        usage[kind]["input"] += used.get("input_tokens") or 0
        usage[kind]["output"] += used.get("output_tokens") or 0


def provider_balance():
    """ProxyAPI exposes the balance if the key has that permission; cached for 20 s."""
    if llm_client is None or "proxyapi" not in (os.getenv("AI_BASE_URL") or ""):
        return None
    if time.time() - _balance_cache["at"] < 20:
        return _balance_cache["value"]
    _balance_cache["at"] = time.time()
    try:
        root = os.getenv("AI_BASE_URL").split("/v1")[0].rstrip("/")
        r = llm_client._client.get(f"{root}/proxyapi/balance", headers={"Authorization": f"Bearer {llm_client.api_key}"}, timeout=8)
        _balance_cache["value"] = r.json().get("balance") if r.status_code == 200 else None
    except Exception:
        _balance_cache["value"] = None
    return _balance_cache["value"]


def usage_report():
    with usage_lock:
        snap = {k: dict(v) for k, v in usage.items()}
    for kind, row in snap.items():
        pin, pout = price(kind)
        row["cost"] = round(row["input"] / 1e6 * pin + row["output"] / 1e6 * pout, 6) if pin and pout else None
    return {**snap, "prices": {"llm": price("llm"), "jev": price("jev")}, "currency": os.getenv("PRICE_CURRENCY", "$"),
            "balance": provider_balance(), "llmModel": LLM_MODEL}


def append_log(kind, data):
    LOG_FILE.parent.mkdir(exist_ok=True)
    entry = {"serverTime": round(time.time(), 3), "kind": kind, **data}
    with log_lock, LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")


# ---------------------------------------------------------------- LLM commander
STANCES = ["assault", "skirmish", "hold", "flank", "retreat", "hunt", "bait"]
MOVES = ["enemy", "last_known", "cover", "flank_left", "flank_right", "center", "hold", "regroup"]

COMMANDER_PROMPT = """You command a team of autonomous mechs. Turn the coach's strategy and the battle state into orders.
Each mech has 3 controllers that pick an action ~1/s and read only your per-controller instruction:
navigation: follow_route|advance|retreat|strafe_left|strafe_right|turn_left|turn_right|hold
turret: track_target|scan_left|scan_right|watch_last_known|watch_route|hold
weapon: fire_arms|fire_support|fire_all|hold_fire
A route planner walks the mech to move_to. Mechs see only in their camera cone with line of sight; other info is memory.
Arm weapons and missiles need sight; a mortar hits the last known position blind. Heat>100 forces a cooldown.
`radio` is your team's chatter: unit reports with grid squares and (x, z) of enemies. A COACH LIVE ORDER there overrides older strategy. Keep the previous plan unless events justify a change.
Reply with compact JSON only:
{"team_plan":"<=15 words","replan_after_s":8-16,"chat":[{"from":"<UNIT>","to":"team","text":"<=25 words"}],"units":{"<NAME>":{"intent":"<=12 words","stance":"assault|skirmish|hold|flank|retreat|hunt|bait","target":"<enemy>|nearest|weakest|focus","move_to":"enemy|last_known|cover|flank_left|flank_right|center|hold|regroup","engage_range":6-90,"fire_discipline":"free|confident|conserve","use_support":"on_contact|finisher|indirect|never|now","instructions":{"navigation":"<=20 words, conditional","turret":"<=15 words","weapon":"<=15 words"},"callout":"radio line in the coach's voice, <=10 words"}}}
"chat": 2-4 lines of natural radio talk between your mechs, in the coach's style: agree who covers whom, who flanks,
call targets by grid square/coordinates from radio, ask for or offer help, react to losses. Not robotic status reports. Default \"to\":\"team\". Use \"to\":\"all\" only for a line spoken TO THE ENEMY (trash talk, a bluff, a reply to their taunt), at most one per reply; tactics between teammates are always \"team\".
Write every unit name exactly as given in the input (Latin letters, never transliterated).
Include every alive mech. Use only names from the input."""


def parse_json(text):
    """Models sometimes wrap JSON in prose or code fences; take the outer object."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError(f"no JSON object in model reply: {text[:160]!r}")
    return json.loads(text[start:end + 1])


_token_param = "max_tokens"


def complete(messages):
    """Chat completion that adapts to providers using max_completion_tokens."""
    global _token_param
    kwargs = {"model": LLM_MODEL, "messages": messages, "response_format": {"type": "json_object"}, _token_param: LLM_MAX_TOKENS}
    if LLM_EXTRA:
        kwargs["extra_body"] = LLM_EXTRA
    try:
        return llm_client.chat.completions.create(temperature=0.55, **kwargs)
    except Exception as exc:
        text = str(exc)
        if _token_param == "max_tokens" and "max_completion_tokens" in text:
            _token_param = "max_completion_tokens"
            return complete(messages)
        if "temperature" in text:
            return llm_client.chat.completions.create(**kwargs)
        if "extra_body" in kwargs and ("thinking" in text or "unrecognized" in text.lower() or "unknown" in text.lower()):
            kwargs.pop("extra_body")
            return llm_client.chat.completions.create(temperature=0.55, **kwargs)
        raise


def compact(value):
    """Drop empty fields so the commander prompt stays small."""
    if isinstance(value, dict):
        return {k: compact(v) for k, v in value.items() if v not in (None, "", [], {})}
    if isinstance(value, list):
        return [compact(v) for v in value]
    return value


def llm_plan(payload):
    coach = payload.get("coach", {})
    who = "the player's team NULL SIGNAL (coach = the human player; radio voice = the team's command AI ECHO, calm and supportive)" \
        if coach.get("kind") == "player" else f"team {coach.get('team')} of coach {coach.get('name')}"
    doctrine = coach.get("doctrine") or "No fixed doctrine: follow the coach strategy written for each unit."
    if payload.get("mode") == "duel":
        doctrine += "\nDUEL: you command ONE mech with no teammates. Never ask for cover, help or backup and never address allies; chat lines are self-talk or aimed at the enemy."
    if coach.get("team_note"):
        doctrine += f"\nCOACH TEAM DIRECTIVE: {coach['team_note']}"
    messages = [
        {"role": "system", "content": COMMANDER_PROMPT},
        {"role": "system", "content": f"You command {who}.\nDOCTRINE: {doctrine}\nWrite callout and chat in {payload.get('language', 'Russian')}; keep JSON keys and enum values in English."},
        {"role": "user", "content": json.dumps(compact({k: v for k, v in payload.items() if k not in ("coach", "language")}), ensure_ascii=False, separators=(",", ":"))},
    ]
    response = complete(messages)
    plan = parse_json(response.choices[0].message.content or "")
    alive = {u["name"] for u in payload.get("units", []) if u.get("alive", True)}
    units = {}
    for name, order in (plan.get("units") or {}).items():
        if name not in alive or not isinstance(order, dict):
            continue
        order["stance"] = order.get("stance") if order.get("stance") in STANCES else "skirmish"
        order["move_to"] = order.get("move_to") if order.get("move_to") in MOVES else "enemy"
        units[name] = order
    chat, opened = [], False
    for c in (plan.get("chat") or [])[:4]:
        if not isinstance(c, dict) or c.get("from") not in alive:
            continue
        open_line = c.get("to") == "all" and not opened  # one open-channel line per plan
        opened = opened or open_line
        chat.append({"from": c.get("from"), "to": "all" if open_line else "team", "text": str(c.get("text", ""))[:220]})
    return {
        "chat": chat,
        "team_plan": str(plan.get("team_plan", ""))[:240],
        "replan_after_s": plan.get("replan_after_s", 8),
        "units": units,
        "model": response.model,
        "usage": {"input_tokens": response.usage.prompt_tokens, "output_tokens": response.usage.completion_tokens} if response.usage else None,
    }


# ---------------------------------------------------------------- JEV streams
STREAMS = {
    "navigation": (
        "You move ONLY this mech's legs. Follow COMMANDER_INSTRUCTION. Compare enemy distance with engage_range; "
        "mobility_m is free space. With no enemy visible for 8+ s never hold: follow_route.",
        {
            "follow_route": "walk the planned route to move_to",
            "advance": "walk toward the target",
            "retreat": "back away facing the target",
            "strafe_left": "sidestep left to dodge",
            "strafe_right": "sidestep right to dodge",
            "turn_left": "rotate legs left",
            "turn_right": "rotate legs right",
            "hold": "stand still",
        },
    ),
    "turret": (
        "You rotate ONLY the torso (camera + guns). Follow COMMANDER_INSTRUCTION. Track visible enemies; "
        "watch a last known position only if age_s < 6, else scan.",
        {
            "track_target": "aim at the target",
            "scan_left": "sweep left to search",
            "scan_right": "sweep right to search",
            "watch_last_known": "watch the last known enemy position",
            "watch_route": "look along the route",
            "hold": "do not rotate",
        },
    ),
    "weapon": (
        "You control ONLY triggers. Follow COMMANDER_INSTRUCTION. Arms and missiles need a visible enemy in range; "
        "a mortar can hit a last known position blind. Mind heat and ammo.",
        {"fire_arms": "fire arm weapons", "fire_support": "fire the shoulder weapon", "fire_all": "fire everything", "hold_fire": "do not fire"},
    ),
}


def stream_state(name, snap, orders):
    """Each controller only sees the fields it needs (keeps JEV prompts small)."""
    unit = snap.get("unit", {})
    plan = {k: orders.get(k) for k in ("stance", "move_to", "engage_range")}
    base = {"t": snap.get("t"), "since_contact_s": snap.get("seconds_since_contact"), "plan": plan, "target": snap.get("current_target")}
    seen = snap.get("visible_enemies") or []
    if name == "navigation":
        return {**base, "hp": unit.get("hp_pct"), "blocked": unit.get("blocked"), "mobility_m": unit.get("mobility_m"),
                "enemies": [{"n": e["name"], "d": e["distance"], "legs_deg": e["bearing_from_legs_deg"]} for e in seen],
                "route": snap.get("route"), "allies": [{"n": a["name"], "d": a["distance"]} for a in snap.get("allies", []) if a.get("alive")]}
    if name == "turret":
        return {**base, "torso_deg": unit.get("torso_offset_deg"),
                "enemies": [{"n": e["name"], "d": e["distance"], "turret_deg": e["bearing_from_turret_deg"]} for e in seen],
                "last_known": [{"n": k["name"], "age_s": k["age_s"]} for k in snap.get("last_known_enemies", [])]}
    return {**base, "heat": unit.get("heat"), "overheated": unit.get("overheated"), "weapons": unit.get("weapons"),
            "fire_discipline": orders.get("fire_discipline"), "use_support": orders.get("use_support"),
            "enemies": [{"n": e["name"], "d": e["distance"], "hp": e["hp_pct"], "turret_deg": e["bearing_from_turret_deg"]} for e in seen],
            "last_known": [{"n": k["name"], "age_s": k["age_s"]} for k in snap.get("last_known_enemies", [])]}


def jev_decide(payload):
    snapshot = payload.get("snapshot", {})
    orders = payload.get("orders") or {}
    instructions = orders.get("instructions") or {}

    def run(name):
        text, criteria = STREAMS[name]
        hint = instructions.get(name) or "act on the plan"
        question = Choice(instructions=f"{text}\nCOMMANDER_INSTRUCTION: {hint}", criteria=criteria)
        response = jev_client.system_one(state=compact(stream_state(name, snapshot, orders)), questions={name: question})
        return name, response

    streams = dict(pool.map(run, STREAMS))
    answers = {name: r.answers[name] for name, r in streams.items()}
    first = next(iter(streams.values()))
    return {
        **{name: a.choice for name, a in answers.items()},
        "confidence": {name: round(a.confidence, 3) for name, a in answers.items()},
        "model": first.model,
        "usage": {
            "input_tokens": sum(r.usage.input_tokens for r in streams.values()),
            "output_tokens": sum(r.usage.output_tokens for r in streams.values()),
        },
    }


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
            return
        super().log_message(fmt, *args)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = unquote(self.path.split("?", 1)[0])
        # Never serve secrets, sources of the server or runtime logs as static files.
        parts = [p for p in path.split("/") if p]
        if any(p.startswith(".") for p in parts) or path.endswith(".py") or (parts and parts[0] in {"logs", "tools"}):
            self.send_error(404)
            return
        if path == "/api/status":
            self.send_json(200, {"llm": llm_client is not None, "jev": jev_client is not None, "llmModel": LLM_MODEL if llm_client else None, "jevModel": "jev-latest" if jev_client else None})
            return
        if path == "/api/usage":
            self.send_json(200, usage_report())
            return
        if path == "/api/logs":
            lines = LOG_FILE.read_text(encoding="utf-8").splitlines()[-250:] if LOG_FILE.exists() else []
            body = ("\n".join(lines) + "\n").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        routes = {"/api/plan": (llm_client, llm_breaker, llm_plan), "/api/decide": (jev_client, jev_breaker, jev_decide)}
        if self.path not in routes:
            self.send_error(404)
            return
        client, breaker, handler = routes[self.path]
        try:
            payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        except ValueError:
            self.send_json(400, {"error": "invalid JSON"})
            return
        if client is None:
            self.send_json(503, {"error": "backend not configured"})
            return
        if breaker.open():
            self.send_json(503, {"error": "backend cooling down after failures"})
            return
        started = time.perf_counter()
        try:
            result = handler(payload)
        except Exception as exc:  # network, quota, malformed model output
            breaker.fail()
            append_log("error", {"route": self.path, "error": repr(exc)})
            self.send_json(502, {"error": str(exc)[:300]})
            return
        breaker.ok()
        record_usage("llm" if self.path == "/api/plan" else "jev", result.get("usage"))
        latency = round((time.perf_counter() - started) * 1000, 1)
        result["latencyMs"] = latency
        append_log(self.path.rsplit("/", 1)[-1], {"latencyMs": latency, "request": payload, "response": result})
        try:
            self.send_json(200, result)
        except OSError:
            pass  # the browser left (page closed or match ended)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print(f"STEEL//DIRECTIVE  ->  http://localhost:{PORT}")
    print(f"  LLM commander : {LLM_MODEL if llm_client else 'off (local planner)'}")
    print(f"  JEV streams   : {'TypeSafe' if jev_client else 'off (local policy)'}")
    # On Windows SO_REUSEADDR lets a second server silently share the port.
    ThreadingHTTPServer.allow_reuse_address = os.name != "nt"
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
