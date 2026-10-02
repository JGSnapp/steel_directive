"""Record gameplay videos of STEEL//DIRECTIVE.

Renders the game frame by frame in headless Chromium (smooth 30 fps), renders
the arena soundtrack offline in the page, adds title cards and encodes an
H.264/AAC MP4 with ffmpeg. LLM and JEV calls in the footage are live.

    python tools/record/record.py --scenario trailer --lang en --out docs/media/trailer.mp4
    python tools/record/record.py --scenario match --battle chess-squad --lang en --cinema --out docs/media/final.mp4

Requires: pip install playwright pillow && playwright install chromium; ffmpeg on
PATH; the game server running (python server.py).
"""
import argparse
import base64
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ALL_DONE = {
    "done": {b: True for b in ["ram-duel", "ram-squad", "ghost-duel", "ghost-squad", "volt-duel", "volt-squad", "chess-duel"]},
    "weapons": ["autocannon", "rotary", "missile", "scatter", "railgun", "mortar", "arc", "plasma"],
    "chassis": ["pathfinder", "hound", "vector", "spark"],
    "seenPrologue": True,
    "loadouts": {},
}

# Loadouts that suit each rival's armor, so recorded fights look like real play.
MATCH_LOADOUTS = {
    "chess-squad": {"note": {"en": "Stay together. Everyone focuses the nearest target. Plasma burns their ceramics.", "ru": "Держитесь вместе. Все бьют ближайшую цель. Плазма прожигает их керамику.", "zh": "保持队形，集火最近的目标。等离子能烧穿他们的陶瓷装甲。"},
                    "units": [{"chassis": "hound", "weapons": ["plasma", "plasma", "missile"], "strategy": {"en": "Push the nearest enemy, hold 20–25 m and keep the plasma on it.", "ru": "Атакуй ближайшего, держи 20–25 м и жги плазмой.", "zh": "攻击最近的敌人，保持 20–25 米，用等离子持续灼烧。"}},
                              {"chassis": "hound", "weapons": ["plasma", "arc", "missile"], "strategy": {"en": "Move with ATLAS, hold 20 m, hit his target.", "ru": "Атакуй вместе с ATLAS, держи 20 м, бей его цель.", "zh": "和 ATLAS 一起推进，保持 20 米，打他的目标。"}},
                              {"chassis": "spark", "weapons": ["plasma", "arc", "missile"], "strategy": {"en": "Flank with ATLAS at 18–22 m and stun his target with the arc.", "ru": "Атакуй вместе с ATLAS на 18–22 м, дугой оглушай его цель.", "zh": "和 ATLAS 一起在 18–22 米侧击，用电弧瘫痪他的目标。"}}]},
    "ghost-duel": {"units": [{"chassis": "hound", "weapons": ["scatter", "scatter", "missile"], "strategy": {"en": "Close to 15 m through cover and shred him with the shotguns. Rockets on contact.", "ru": "Сближайся до 15 м через укрытия и дави дробовиками. Ракеты сразу при контакте.", "zh": "借掩体接近到 15 米，用霰弹枪撕碎他。接敌立即发射火箭。"}}]},
    "volt-squad": {"note": {"en": "Rails overload their shields. Keep 30–40 m and focus one target.", "ru": "Рельса перегружает их щиты. Держите 30–40 м и бейте одну цель.", "zh": "电磁炮能让他们的护盾过载。保持 30–40 米，集火一个目标。"},
                   "units": [{"chassis": "hound", "weapons": ["railgun", "railgun", "missile"], "strategy": {"en": "Hold 30–40 m, hit the nearest. Back off facing them if they get within 20 m.", "ru": "Держи 30–40 м, бей ближайшего. Если ближе 20 м — отходи лицом к нему.", "zh": "保持 30–40 米，打最近的敌人。距离小于 20 米就面向敌人后撤。"}},
                             {"chassis": "hound", "weapons": ["railgun", "autocannon", "missile"], "strategy": {"en": "Stay near ATLAS and hit his target.", "ru": "Держись рядом с ATLAS и бей его цель.", "zh": "跟在 ATLAS 附近，打他的目标。"}},
                             {"chassis": "vector", "weapons": ["railgun", "railgun", "mortar"], "strategy": {"en": "Snipe from 45 m behind the team. Mortar their last known position.", "ru": "Снайпер: 45 м за командой, миномётом по последней позиции.", "zh": "在队伍后方 45 米狙击，用迫击炮打敌人最后已知位置。"}}]},
}
MAP_OF = {"ram": "foundry", "ghost": "whiteout", "volt": "neon", "chess": "citadel"}
FONT = "C:/Windows/Fonts/arialbd.ttf" if os.name == "nt" else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_ZH = "C:/Windows/Fonts/msyhbd.ttc" if os.name == "nt" else FONT


def pick(v, lang):
    return v.get(lang, v["en"]) if isinstance(v, dict) else v


def card(path, title, subtitle, accent="#3fe0f5"):
    """A title card in the game's style."""
    img = Image.new("RGB", (1920, 1080), (5, 9, 10))
    d = ImageDraw.Draw(img)
    for y in range(0, 1080, 3):
        d.line([(0, y), (1920, y)], fill=(7, 12, 14))
    font_path = FONT_ZH if any("\u4e00" <= ch <= "\u9fff" for ch in title + subtitle) and Path(FONT_ZH).exists() else FONT
    big, small = ImageFont.truetype(font_path, 132), ImageFont.truetype(font_path, 40)
    d.rectangle([160, 430, 172, 640], fill=accent)
    d.text((210, 410), title, font=big, fill=(226, 236, 238))
    d.text((214, 590), subtitle, font=small, fill=accent)
    img.save(path)


class Recorder:
    """Steps the game clock by exactly 1/fps per frame and screenshots it."""

    def __init__(self, page, fps):
        self.page, self.fps, self.n, self.width = page, fps, 0, 1280
        self.dir = Path(tempfile.mkdtemp(prefix="sd_rec_"))

    def frame(self):
        self.page.evaluate(f"() => window.SD.step({1 / self.fps})")
        self.page.screenshot(path=str(self.dir / f"{self.n:06d}.jpg"), type="jpeg", quality=93)
        self.n += 1

    def hold(self, seconds):
        for _ in range(int(seconds * self.fps)):
            self.frame()

    def type(self, selector, text, cps=45):
        """Type while the camera keeps rolling (a few characters per frame)."""
        self.page.focus(selector)
        self.page.fill(selector, "")
        per = max(1, round(cps / self.fps))
        for i in range(0, len(text), per):
            self.page.keyboard.insert_text(text[i:i + per])
            self.frame()

    def until(self, js, limit):
        for _ in range(int(limit * self.fps)):
            if self.page.evaluate(js):
                return True
            self.frame()
        return False

    def encode(self, out, theme, intro, outro):
        seconds = self.n / self.fps
        tmp = self.dir
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(self.fps), "-i", str(tmp / "%06d.jpg"),
                        "-vf", f"scale={self.width}:-2:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "27",
                        str(tmp / "game.mp4")], check=True)
        parts = []
        for name, (title, sub) in (("intro", intro), ("outro", outro)):
            card(tmp / f"{name}.png", title, sub)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", "2.5", "-framerate", str(self.fps), "-i", str(tmp / f"{name}.png"),
                            "-vf", f"scale={self.width}:-2,fade=in:0:12,fade=out:st=2:d=0.5,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                            str(tmp / f"{name}.mp4")], check=True)
            parts.append(tmp / f"{name}.mp4")
        listing = tmp / "parts.txt"
        listing.write_text("\n".join(f"file '{p.as_posix()}'" for p in (parts[0], tmp / "game.mp4", parts[1])), encoding="utf-8")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(tmp / "joined.mp4")], check=True)
        # Soundtrack rendered offline in the page, intensity rising into the fight.
        total = seconds + 5
        wav64 = self.page.evaluate("""async ([theme, seconds]) => {
            const m = await import('/src/engine/music.js');
            return m.renderThemeWav(theme, seconds, (t) => Math.min(.95, .15 + Math.max(0, t - 6) / 40));
        }""", [theme, total])
        (tmp / "music.wav").write_bytes(base64.b64decode(wav64))
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp / "joined.mp4"), "-i", str(tmp / "music.wav"),
                        "-filter_complex", f"[1:a]loudnorm=I=-16:TP=-1.5,afade=t=in:d=1.5,afade=t=out:st={total - 2.5:.2f}:d=2.5[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
        print(f"{out}: {self.n} frames, {seconds:.1f}s gameplay")
        shutil.rmtree(tmp, ignore_errors=True)


TEXT = {
    "trailer_intro": {"en": ("STEEL//DIRECTIVE", "You write the strategy. An LLM commands the mechs."), "ru": ("STEEL//DIRECTIVE", "Вы пишете стратегию. LLM командует мехами."), "zh": ("STEEL//DIRECTIVE", "你写下战略，LLM 指挥机甲。")},
    "outro": {"en": ("PLAY IT", "github.com/JGSnapp/autolock_bots"), "ru": ("ИГРАТЬ", "github.com/JGSnapp/autolock_bots"), "zh": ("开始游戏", "github.com/JGSnapp/autolock_bots")},
    "directive": {"en": "Everyone on QUEEN, she's exposed!", "ru": "Все на QUEEN, она открыта!", "zh": "全员集火 QUEEN，她暴露了！"},
}
MATCH_TITLES = {
    "chess-squad": {"en": "SEASON FINAL · 3V3", "ru": "ФИНАЛ СЕЗОНА · 3V3", "zh": "赛季决赛 · 3V3"},
    "ghost-duel": {"en": "DUEL IN THE BLIZZARD", "ru": "ДУЭЛЬ В МЕТЕЛИ", "zh": "暴风雪中的单挑"},
    "volt-squad": {"en": "NEON YARD · 3V3", "ru": "НЕОНОВЫЙ ДВОР · 3V3", "zh": "霓虹场 · 3V3"},
}


def trailer(page, rec, args):
    page.wait_for_selector("#title:not(.hidden)", timeout=90000)
    rec.hold(2.5)
    for code in ("ru", "zh", args.lang):
        page.click(f"#lang-switch button[data-lang='{code}']")
        rec.hold(1.1)
    page.click("[data-go='campaign']")
    rec.hold(3)
    page.click(".battle-btn[data-b='chess-squad']")
    rec.hold(1.2)
    for _ in range(4):
        rec.hold(3.4)
        page.mouse.click(960, 540)
        rec.hold(0.2)
        page.mouse.click(960, 540)
    if page.evaluate("() => window.SD.screen === 'dialogue'"):
        page.click("#vn-skip")
    rec.hold(1.5)
    lo = MATCH_LOADOUTS["chess-squad"]
    for i, unit in enumerate(lo["units"]):
        page.click(f".unit-tab[data-tab='{i}']")
        rec.hold(0.5)
        for key, val in (("chassis", unit["chassis"]), ("w0", unit["weapons"][0]), ("w1", unit["weapons"][1]), ("w2", unit["weapons"][2])):
            page.select_option(f"#br-roster select[data-k='{key}']", val)
            rec.hold(0.45)
        rec.type("#br-roster textarea[data-k='strategy']", pick(unit["strategy"], args.lang), 70)
    rec.type("#br-team-note", pick(lo["note"], args.lang), 60)
    rec.hold(1)
    page.click("#br-start")
    rec.hold(30)
    page.select_option("#directive-target", "")
    rec.type("#directive-input", pick(TEXT["directive"], args.lang), 30)
    page.keyboard.press("Enter")
    if not rec.until("() => window.SD.screen === 'result'", args.seconds):
        print("time limit reached before the match ended")
    rec.hold(4)


def cutscene(page, rec, args):
    page.wait_for_selector("#title:not(.hidden)", timeout=90000)
    page.click("[data-go='prologue']")
    rec.until("() => !window.SD.cutscene", 45)
    rec.hold(1)


def match(page, rec, args):
    page.wait_for_selector("#hud:not(.hidden)", timeout=90000)
    if not rec.until("() => window.SD.screen === 'result'", args.seconds):
        print("time limit reached before the match ended")
    rec.hold(3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", choices=["trailer", "match", "cutscene"], default="match")
    ap.add_argument("--battle", default="chess-squad")
    ap.add_argument("--lang", default="en", choices=["en", "ru", "zh"])
    ap.add_argument("--seconds", type=float, default=150)
    ap.add_argument("--out", default="docs/media/match.mp4")
    ap.add_argument("--url", default="http://localhost:8000/")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--cinema", action="store_true")
    ap.add_argument("--proxy", default=os.getenv("RECORD_PROXY"))
    ap.add_argument("--chromium", default=os.getenv("PW_CHROMIUM"))
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True, executable_path=args.chromium or None,
            args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
            proxy={"server": args.proxy, "bypass": "localhost,127.0.0.1"} if args.proxy else None,
        )
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.add_init_script(f"localStorage.setItem('steel-directive.progress.v2', {json.dumps(json.dumps(ALL_DONE))}); localStorage.setItem('sd.lang', '{args.lang}'); sessionStorage.setItem('sd.prologue', '1');")
        url = args.url
        if args.scenario == "match":
            url += f"?auto={args.battle}&lang={args.lang}" + ("&cinema=1" if args.cinema else "")
            lo = MATCH_LOADOUTS.get(args.battle)
            if lo:
                units = [{**u, "strategy": pick(u["strategy"], args.lang)} for u in lo["units"]]
                url += f"&loadout={quote(json.dumps(units, ensure_ascii=False))}" + (f"&note={quote(pick(lo['note'], args.lang))}" if lo.get("note") else "")
        page.goto(url, wait_until="domcontentloaded")
        rec = Recorder(page, args.fps)
        {"trailer": trailer, "match": match, "cutscene": cutscene}[args.scenario](page, rec, args)
        if args.scenario == "cutscene":
            theme, intro = "ring", ("STEEL//DIRECTIVE", pick({"en": "THE RING INCIDENT · 2064", "ru": "ИНЦИДЕНТ НА КОЛЬЦЕ · 2064", "zh": "环形事件 · 2064"}, args.lang))
        elif args.scenario == "trailer":
            theme, intro = "citadel", pick(TEXT["trailer_intro"], args.lang)
        else:
            theme, intro = MAP_OF[args.battle.split("-")[0]], ("STEEL//DIRECTIVE", pick(MATCH_TITLES.get(args.battle, {"en": args.battle}), args.lang))
        rec.encode(args.out, theme, intro, pick(TEXT["outro"], args.lang))
        browser.close()


if __name__ == "__main__":
    main()
