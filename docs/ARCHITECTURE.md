# Architecture

STEEL//DIRECTIVE splits autonomy into three layers that run at very different speeds.

| Layer | Where | Rate | Decides |
|---|---|---|---|
| **Commander** | `server.py → /api/plan` (LLM) · fallback `src/ai/brain.js` | every 8–16 s + on events | per-unit orders and an instruction for each stream |
| **Streams** | `server.py → /api/decide` (3 × TypeSafe JEV) · fallback `src/ai/pilot.js` | ~1 Hz per mech | one discrete action per stream |
| **Servo** | `src/ai/pilot.js → servo()` | 60 Hz | route following, turning, aim lead, trigger checks, heat |

All three layers share one vocabulary, so any layer can be swapped for its offline equivalent without the rest noticing.

## 1. Commander (LLM)

One request per **team**, so units can be coordinated (bait/flank/focus fire). Input (`TeamCommander.requestLLM`):

- coach: doctrine (rival coaches) or the player's per-mech strategy + team note,
- map name/description/sight multiplier, match time,
- every unit: chassis, HP, position, weapons + ammo, what it sees, current orders, **live order** if the player sent one,
- enemies: last known position/HP/action and age of that info,
- the last 8 battlefield events and the previous team plan.

Output (validated in `server.py` and `sanitizeOrders`):

```json
{
  "team_plan": "Converge on ATLAS from both flanks, opening with missile barrages.",
  "replan_after_s": 8,
  "units": {
    "BULLDOZER": {
      "intent": "Close the gap before ATLAS reaches cover",
      "stance": "assault", "target": "ATLAS", "move_to": "enemy", "engage_range": 14,
      "fire_discipline": "free", "use_support": "on_contact",
      "instructions": {
        "navigation": "If ATLAS is visible and farther than 18 m, advance; otherwise follow_route.",
        "turret": "Track ATLAS; when hidden, watch its last known position.",
        "weapon": "Open with missiles, then fire_all inside 24 m."
      },
      "callout": "Дави его, Бульдозер! Не давай уйти в укрытие!"
    }
  }
}
```

Re-planning triggers: the timer (`replan_after_s`, 8–16 s), first contact, heavy damage (>22 % HP since the last report), any kill, and coach live orders (rate-limited to one per 4 s). The offline planner answers instantly at match start and whenever the LLM fails, so mechs never wait.

## 2. Streams (JEV)

For every mech, three independent `system_one` calls run in parallel. Each receives the same state JSON (`perception.snapshot`) plus the commander plan, but its own question:

| Stream | Choices |
|---|---|
| navigation | `follow_route` `advance` `retreat` `strafe_left` `strafe_right` `turn_left` `turn_right` `hold` |
| turret | `track_target` `scan_left` `scan_right` `watch_last_known` `watch_route` `hold` |
| weapon | `fire_arms` `fire_support` `fire_all` `hold_fire` |

The commander's per-stream instruction is injected into the question text as `COMMANDER_INSTRUCTION`. The answer is held until the next decision; if JEV is slower than 2.5 s or unreachable, `localPolicy()` fills in with the same choices.

Latency notes: the server keeps a warm pool of direct keep-alive TLS connections to TypeSafe (fresh handshakes and some system proxies caused multi-second stalls). Typical numbers in a 3v3: median ≈ 0.3 s, p90 ≈ 0.5 s, ~4–5 decisions/s overall.

### Token budget

- Commander: compact JSON (no empty fields, positions as `[x,z]`, events as one-line strings), a static system prompt first so provider-side prefix caching applies, hard word limits on every output field, `max_tokens` 900. Typical plan: ~1k tokens in, ~0.5k out, ~6 s with `deepseek/deepseek-v3.2`.
- Streams: each controller receives only its own slice of the state (`stream_state` in `server.py`) — legs see mobility/route/distances, the torso sees bearings, the trigger stream sees heat/ammo/range. ~2k input tokens per three-stream decision (down from ~3.8k), one decision per mech every ~1.1 s.

## 3. Servo

Turns actions into physics every frame:

- **Routes**: a 1.5 m nav grid inflated by the largest mech radius, A* with octile moves and string pulling. `move_to` goals resolve to points: enemy/last known position, the best hidden cover spot near the engagement range, a flank point ±72° around the target, the team centroid, etc.
- **Turning**: legs and torso turn at chassis-specific rates; the torso keeps its world aim while the legs turn (±115° limit).
- **Firing**: a weapon only fires if the stream asked for it, it is cooled down, has ammo, is in range, the torso error is inside the weapon tolerance and (except the mortar) the target is visible.
- **Reflexes** (act before the next JEV answer): the torso always holds a visible enemy and follows one that just broke line of sight along its predicted path for 4 s; a hit swings the torso toward the shooter; a ranged unit whose enemy gets inside its engagement band backs off immediately; a unit that has seen nothing for 10 s stops holding/flanking stale intel and searches.
- **Movement**: in contact a mech walks its route sideways or backwards with the legs facing the threat (never its back); it steers around live mechs (wrecks are walkable), keeps a sticky cover point, never walks the route into a visible enemy, and backs out of corners for ~1 s when stuck.

## Team radio

Every message has a channel: `team` (heard by teammates and their commander) or `all` (the open channel, heard by both sides; each commander sees the other side's open lines as events and may answer). The commander's `chat` array may contain at most one `"to":"all"` line per plan; the server enforces it. Commander text is written in the player's UI language (`language` in the plan payload); JSON keys and enums stay English. In the HUD, conversation (`talk`, `taunt`, `help`, `callout`) is always visible and shown above heads; technical reports (contacts, losses, hits, heat) sit behind the REPORTS filter.

Two layers: templated callouts in each coach's voice (`src/data/chatter.js`) and free-form `chat` lines the LLM commander writes with every plan (who covers whom, focus calls, help requests). A unit below 45% HP calls for help; the nearest healthy ally answers and gets an `assist` order (goal near the teammate, target = the attacker) for 10 s.

Units report on a team channel: contacts with grid square and coordinates (`E2 (24, -34), 27 м`), lost contacts with the last position, hits with the shooter's position, kills, overheat and stuns. The HUD shows both teams' radio (filterable), and each team's last 8 radio lines go to its LLM commander as `radio`. Contacts are also shared as data, so every teammate's `last_known_enemies` includes them.

## Perception

`canSee()` = within sensor range × map sight multiplier, inside the torso FOV, and a clear line of sight (obstacles ≥ 4.5 m block it). Every 0.8 s a memory slice is stored (12 kept). In squad fights teammates share contacts. At match start both sides know the enemy spawn zone as stale intel.

## Assets

`tools/blender/build_assets.py` builds every model procedurally (bmesh + bevels) and exports GLB with named pivots (`hips`, `torso`, `thigh_L`, `shin_L`, `foot_L`, `mount_arm_L`, `mount_shoulder_R`, `sensor`, …) and materials named by role (`paint_primary`, `trim`, `glow`, …). At load time `src/engine/assets.js` merges static meshes per pivot and material (≈90 parts → a few dozen draw calls) and repaints chassis per team palette.

## Recording

`tools/record/record.py` puts the game on a manual clock (`window.SD.step(dt)`) and screenshots every frame, so videos are smooth 30 fps regardless of capture speed. Backend calls remain live and real-time, which means AI latency looks ~3× shorter in recorded footage than when playing.
