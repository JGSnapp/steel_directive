"""Static server and TypeSafe/JEV decision gateway for Steel Directive."""
import json
import math
import threading
import time
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

from typesafe_sdk import Choice, TypeSafeClient


def load_env():
    env_file = Path(__file__).with_name(".env")
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        if "=" not in raw or raw.lstrip().startswith("#"):
            continue
        key, value = raw.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
API_KEY = os.getenv("TYPESAFE_API_KEY") or os.getenv("KEY")
client = TypeSafeClient(api_key=API_KEY, timeout=15) if API_KEY else None
LOG_DIR = Path(__file__).with_name("logs")
LOG_FILE = LOG_DIR / "combat.jsonl"
log_lock = threading.Lock()


def append_log(kind, data):
    LOG_DIR.mkdir(exist_ok=True)
    entry = {"serverTime": round(time.time(), 3), "kind": kind, **data}
    with log_lock:
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")


def jev_decision(payload):
    """Run navigation, turret and weapon as three truly independent JEV streams."""
    state = payload.get("snapshot", {})
    mode = payload.get("mode", "duel")
    shared_state = {
        "mission": "Find and destroy the hostile obstacle" if mode == "training" else "Coordinate with allies and destroy all hostile mechs" if mode == "squad" else "Find and destroy the enemy mech",
        "rules": "Only visibleEnemy may be fired upon. Memory is stale. In squad mode teamContact is a shared ally report usable for navigation but not blind firing. Each controller may only operate its own subsystem. The broadcast field is shared simultaneously with navigation, turret, and weapon controllers.",
        **state,
    }
    visible = state.get("visibleEnemy")
    if visible:
        sensor_heading = state.get("self", {}).get("heading", 0) + state.get("self", {}).get("torsoYaw", 0)
        bearing = visible.get("bearing", sensor_heading)
        angle = math.atan2(math.sin(bearing - sensor_heading), math.cos(bearing - sensor_heading))
        shared_state["target_angle_from_turret"] = round(angle, 3)
        shared_state["turret_alignment"] = "turn_left" if angle < -0.1 else "turn_right" if angle > 0.1 else "hold"
        shared_state["angle_rule"] = "negative means target is left; positive means target is right; near zero means aimed"
        chassis_angle = math.atan2(math.sin(bearing - state.get("self", {}).get("heading", 0)), math.cos(bearing - state.get("self", {}).get("heading", 0)))
        shared_state["target_angle_from_legs_deg"] = round(math.degrees(chassis_angle), 1)
        shared_state["required_leg_alignment"] = "turn_left" if chassis_angle < -0.25 else "turn_right" if chassis_angle > 0.25 else "aligned"
    specs = {
        "navigation": Choice(
            instructions="You control ONLY legs and lower chassis. If required_leg_alignment is turn_left or turn_right, select that turn before moving forward. When aligned, use mobility and obstacleAnglesDeg: 0 degrees is ahead, negative left, positive right. Arena boundaries are included in mobility. Never choose forward when front clearance is short or blocked is true. A CONTACT_ACQUIRED broadcast means all controllers know the target. You never control the turret.",
            criteria={
                "forward": "Walk forward relative to chassis",
                "backward": "Walk backward relative to chassis",
                "turn_left": "Turn legs and lower chassis left without moving forward",
                "turn_right": "Turn legs and lower chassis right without moving forward",
                "hold": "Do not move",
            },
        ),
        "turret": Choice(
            instructions="You control ONLY turret rotation. CONTACT_ACQUIRED is a shared notification. If turret_alignment is present, select that exact matching action. Without a visible target rotate to search.",
            criteria={"turn_left": "Rotate left; required when turret_alignment is turn_left", "turn_right": "Rotate right; required when turret_alignment is turn_right", "hold": "Do not rotate; only when turret_alignment is hold or intentionally stationary"},
        ),
        "weapon": Choice(
            instructions="You control ONLY firing. CONTACT_ACQUIRED is a shared notification, but never fire unless visibleEnemy is present and the turret can aim.",
            criteria={"autocannon": "Fire primary autocannon", "missiles": "Fire limited missiles", "none": "Do not fire"},
        ),
    }

    def run_stream(item):
        name, question = item
        response = client.system_one(state={**shared_state, "active_controller": name}, questions={name: question})
        return name, response

    with ThreadPoolExecutor(max_workers=3) as pool:
        streams = dict(pool.map(run_stream, specs.items()))
    answers = {name: response.answers[name] for name, response in streams.items()}
    return {
        "navigation": answers["navigation"].choice,
        "turret": answers["turret"].choice,
        "weapon": answers["weapon"].choice,
        "confidence": {name: round(answer.confidence, 3) for name, answer in answers.items()},
        "model": streams["navigation"].model,
        "usage": {
            "input_tokens": sum(response.usage.input_tokens for response in streams.values()),
            "output_tokens": sum(response.usage.output_tokens for response in streams.values()),
        },
    }


class NoCacheHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/logs":
            lines = LOG_FILE.read_text(encoding="utf-8").splitlines()[-250:] if LOG_FILE.exists() else []
            body = ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        if self.path not in {"/api/decide", "/api/telemetry"}:
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(size) or b"{}")
            if self.path == "/api/telemetry":
                append_log("client_telemetry", payload)
                body = b'{"ok":true}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if client is None:
                raise RuntimeError("KEY or TYPESAFE_API_KEY is not configured")
            started = time.perf_counter()
            response = jev_decision(payload)
            append_log("jev_decision", {"latencyMs": round((time.perf_counter() - started) * 1000, 1), "request": payload, "response": response})
            body = json.dumps(response).encode("utf-8")
            self.send_response(200)
        except Exception as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(502)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print(f"STEEL//DIRECTIVE ready at http://localhost:8000 (TypeSafe: {'connected' if API_KEY else 'missing key'})")
    ThreadingHTTPServer(("127.0.0.1", 8000), NoCacheHandler).serve_forever()
