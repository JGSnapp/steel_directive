"""Build the README trailer: one 1080p montage of the best moments.

Plays a short slice of the Ring Incident cutscene, then each arena's squad
battle. For every battle the game fast-forwards (no capture) until the first
contact, then records ~11 s of the fight in cinema mode with an on-screen
caption. Clips, title cards and the soundtrack are joined into one MP4.

    python tools/record/montage.py --out docs/media/trailer.mp4 --lang en

Requires the game server running, playwright, pillow and ffmpeg (see record.py).
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

from playwright.sync_api import sync_playwright

from record import ALL_DONE, MATCH_LOADOUTS, card, pick

CLIPS = [
    ("ram-squad", {"en": "FOUNDRY-9 · vs IRON HOUNDS", "ru": "FOUNDRY-9 · против IRON HOUNDS", "zh": "FOUNDRY-9 · 对阵 IRON HOUNDS"}),
    ("ghost-squad", {"en": "WHITEOUT STATION · vs SILENT VECTOR", "ru": "WHITEOUT STATION · против SILENT VECTOR", "zh": "WHITEOUT STATION · 对阵 SILENT VECTOR"}),
    ("volt-squad", {"en": "NEON YARD · vs BLACK SPARK", "ru": "NEON YARD · против BLACK SPARK", "zh": "NEON YARD · 对阵 BLACK SPARK"}),
    ("chess-squad", {"en": "THE CITADEL · vs RED CASTLE", "ru": "THE CITADEL · против RED CASTLE", "zh": "THE CITADEL · 对阵 RED CASTLE"}),
]
OVERLAY_JS = """(text) => {
  let el = document.getElementById('montage-cap');
  if (!el) {
    el = document.createElement('div'); el.id = 'montage-cap';
    el.style.cssText = 'position:fixed;left:4vw;bottom:9vh;z-index:99;font:800 34px "Barlow Condensed",Arial;letter-spacing:.12em;color:#e2ecee;border-left:4px solid #3fe0f5;padding:6px 16px;background:rgba(0,0,0,.55)';
    const fade = document.createElement('div'); fade.id = 'montage-fade';
    fade.style.cssText = 'position:fixed;inset:0;z-index:98;background:#000;opacity:0;pointer-events:none';
    document.body.append(el, fade);
  }
  el.textContent = text; el.style.display = text ? 'block' : 'none';
}"""


class Clipper:
    def __init__(self, out_dir, fps):
        self.dir, self.fps, self.n = out_dir, fps, 0

    def shoot(self, page, seconds, fade=.35):
        frames = int(seconds * self.fps)
        for i in range(frames):
            # Short fade from/to black at each cut, rendered into the frame.
            edge = min(i, frames - 1 - i) / self.fps
            page.evaluate(f"() => {{ const f = document.getElementById('montage-fade'); if (f) f.style.opacity = {max(0.0, 1 - edge / fade):.3f}; window.SD.step({1 / self.fps}); }}")
            page.screenshot(path=str(self.dir / f"{self.n:06d}.png"))
            self.n += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/media/trailer.mp4")
    ap.add_argument("--lang", default="en", choices=["en", "ru", "zh"])
    ap.add_argument("--clip", type=float, default=11)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--url", default="http://localhost:8000/")
    ap.add_argument("--proxy", default=os.getenv("RECORD_PROXY"))
    ap.add_argument("--chromium", default=os.getenv("PW_CHROMIUM"))
    args = ap.parse_args()
    tmp = Path(tempfile.mkdtemp(prefix="sd_montage_"))
    clip = Clipper(tmp, args.fps)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=args.chromium or None,
                                    args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
                                    proxy={"server": args.proxy, "bypass": "localhost,127.0.0.1"} if args.proxy else None)
        init = f"localStorage.setItem('steel-directive.progress.v2', {json.dumps(json.dumps(ALL_DONE))}); localStorage.setItem('sd.lang', '{args.lang}'); sessionStorage.setItem('sd.prologue', '1');"

        # 1) The Ring Incident: the unpiloted walk and the blast.
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.add_init_script(init)
        page.goto(args.url, wait_until="domcontentloaded")
        page.wait_for_selector("#title:not(.hidden)", timeout=90000)
        page.evaluate(OVERLAY_JS, "")
        page.click("#title [data-go='prologue']")
        page.wait_for_function("() => window.SD.cutscene", timeout=60000)
        page.evaluate("() => { const c = SD.cutscene; while (c.time < 23.5) c.update(1/30); }")
        clip.shoot(page, 7.5)
        page.close()

        # 2) One clip per arena, starting at first contact.
        for battle, caption in CLIPS:
            page = browser.new_page(viewport={"width": 1920, "height": 1080})
            page.add_init_script(init)
            url = f"{args.url}?auto={battle}&lang={args.lang}&cinema=1"
            lo = MATCH_LOADOUTS.get(battle)
            if lo:
                units = [{**u, "strategy": pick(u["strategy"], args.lang)} for u in lo["units"]]
                url += f"&loadout={quote(json.dumps(units, ensure_ascii=False))}" + (f"&note={quote(pick(lo['note'], args.lang))}" if lo.get("note") else "")
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_selector("#hud:not(.hidden)", timeout=90000)
            page.evaluate(OVERLAY_JS, pick(caption, args.lang))
            # Fast-forward (uncaptured) to the first exchange of fire.
            for _ in range(60 * args.fps):
                if page.evaluate("() => { SD.step(1/30); const m = SD.match; return m && m.running && m.units.some(u => u.lastAction === 'FIRING'); }"):
                    break
            page.evaluate("() => { for (let i = 0; i < 45; i++) SD.step(1/30); }")
            clip.shoot(page, args.clip)
            page.close()

        # Soundtrack for the whole montage (neon theme, high intensity).
        total = clip.n / args.fps + 5
        page = browser.new_page()
        page.goto(args.url + "?noprologue=1", wait_until="domcontentloaded")
        wav = page.evaluate("async (s) => (await import('/src/engine/music.js')).renderThemeWav('neon', s, (t) => Math.min(.95, .4 + t / 30))", total)
        (tmp / "music.wav").write_bytes(base64.b64decode(wav))
        browser.close()

    # Encode at full 1080p with high quality.
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(args.fps), "-i", str(tmp / "%06d.png"),
                    "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-tune", "film", str(tmp / "game.mp4")], check=True)
    intro = ("STEEL//DIRECTIVE", pick({"en": "You write the strategy. An LLM commands the mechs.", "ru": "Вы пишете стратегию. LLM командует мехами.", "zh": "你写下战略，LLM 指挥机甲。"}, args.lang))
    outro = (pick({"en": "PLAY IT", "ru": "ИГРАТЬ", "zh": "开始游戏"}, args.lang), "github.com/JGSnapp/autolock_bots")
    parts = []
    for name, (title, sub) in (("intro", intro), ("outro", outro)):
        card(tmp / f"{name}.png", title, sub)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", "2.5", "-framerate", str(args.fps), "-i", str(tmp / f"{name}.png"),
                        "-vf", "fade=in:0:12,fade=out:st=2:d=0.5,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "17", str(tmp / f"{name}.mp4")], check=True)
        parts.append(tmp / f"{name}.mp4")
    (tmp / "parts.txt").write_text("\n".join(f"file '{x.as_posix()}'" for x in (parts[0], tmp / "game.mp4", parts[1])), encoding="utf-8")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "parts.txt"), "-c", "copy", str(tmp / "joined.mp4")], check=True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp / "joined.mp4"), "-i", str(tmp / "music.wav"),
                    "-filter_complex", f"[1:a]loudnorm=I=-16:TP=-1.5,afade=t=in:d=1.5,afade=t=out:st={total - 2.5:.2f}:d=2.5[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", args.out], check=True)
    print(f"{args.out}: {clip.n / args.fps:.1f}s of footage")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
