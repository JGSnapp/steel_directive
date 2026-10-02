# Contributing

Thanks for wanting to make the mechs smarter!

- **Run it**: `pip install -r requirements.txt && python server.py`, open http://localhost:8000. No keys needed — the local AI is fully playable.
- **No build step**: plain ES modules in `src/`, Three.js from a CDN. Keep it that way.
- **Models**: never hand-edit the GLBs in `assets/models`; change `tools/blender/build_assets.py` and run
  `blender -b -P tools/blender/build_assets.py -- --out assets/models`.
- **AI contract**: the action vocabulary lives in `src/ai/pilot.js` (`ACTIONS`) and `server.py` (`STREAMS`). Change both together. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Content**: coaches, maps, weapons, the campaign and radio chatter are data files in `src/data/`. New arenas are a great first PR.
- **Text**: every player-facing string exists in English, Russian and Simplified Chinese (`src/i18n.js` for UI, `{ ru, en, zh }` objects in data files). Add all three, or open the PR with English and ask for help with the rest. Keep dialogue concrete and in character; no filler.
- **Quick test**: `http://localhost:8000/?auto=ram-duel&local=1` drops straight into a fight with the local AI.

Please keep PRs focused and include a screenshot or short clip for anything visual.
