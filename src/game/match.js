import * as THREE from 'three';
import { MAPS, SPAWNS } from '../data/maps.js';
import { Arena } from '../engine/arena.js';
import { Mech } from '../engine/mech.js';
import { Combat } from './combat.js';
import { observe, shareContacts } from '../ai/perception.js';
import { servo } from '../ai/pilot.js';
import { TeamCommander, UnitStreams } from '../ai/brain.js';
import { line } from '../data/chatter.js';

const rand = (a, b) => a + Math.random() * (b - a);
// Map grid for radio callouts: columns A-F west→east, rows 1-6 north→south, 20 m squares.
export const square = (p) => `${'ABCDEF'[Math.max(0, Math.min(5, Math.floor((p.x + 60) / 20)))]}${Math.max(1, Math.min(6, Math.floor((p.z + 60) / 20) + 1))} (${Math.round(p.x)}, ${Math.round(p.z)})`;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Match {
  // config: { map, mode, duration, blue:{coach, units:[spec]}, red:{coach, units:[spec]} }
  constructor(app, config) {
    this.app = app;
    this.world = app.world;
    this.fx = app.fx;
    this.audio = app.audio;
    this.config = config;
    this.duel = config.mode === 'duel';
    this.map = MAPS[config.map];
    this.world.applyMap(this.map);
    this.arena = new Arena(this.world.scene, this.map);
    this.combat = new Combat(this);
    this.time = 0;
    this.duration = config.duration || (this.duel ? 180 : 240);
    this.running = false;
    this.timeScale = 1;
    this.slowmo = 0;
    this.units = [];
    for (const side of ['blue', 'red']) {
      config[side].units.forEach((spec, i) => {
        const m = new Mech(this.world.scene, { ...spec, team: side });
        // Rival coaches field upgraded frames: +50% durability.
        if (side === 'red' && config.red.coach.kind === 'trainer') { m.maxHp *= config.enemyHp ?? 1.5; m.hp = m.maxHp; }
        const s = SPAWNS[side][i];
        m.place(s.x, s.z, side === 'blue' ? Math.PI : 0);
        this.units.push(m);
      });
    }
    this.blue = this.units.filter(u => u.team === 'blue');
    this.red = this.units.filter(u => u.team === 'red');
    // League rules: spawn zones are public, so both sides start with stale intel.
    for (const [team, foes] of [[this.blue, this.red], [this.red, this.blue]]) {
      for (const u of team) {
        u.known = {};
        for (const f of foes) u.known[f.id] = { id: f.id, name: f.name, x: f.position.x, z: f.position.z, hp: 1, at: -25, action: 'SPAWN', intel: true };
      }
    }
    this.commanders = {
      blue: new TeamCommander({ side: 'blue', units: this.blue, coach: config.blue.coach, onPlan: (u, o) => this.onPlan?.(u, o) }),
      red: new TeamCommander({ side: 'red', units: this.red, coach: config.red.coach, onPlan: (u, o) => this.onPlan?.(u, o) }),
    };
    this.streams = this.units.map(u => new UnitStreams(u, this));
    this.focus = { blue: null, red: null };
    this.camera = { mode: 'director', unit: this.blue[0], shot: 'chase', shotUntil: 0, pos: new THREE.Vector3(0, 30, 70), look: new THREE.Vector3(), orbit: 0 };
    this.cameraUnit = this.blue[0];
    this.world.camera.position.set(0, 26, 90);
    this.result = null;
    this.radioLog = [];
  }

  start() { this.running = true; this.priming = false; }

  // Ask both commanders for an opening plan before the clock starts.
  prime() {
    this.priming = true;
    for (const side of ['blue', 'red']) {
      const team = this[side], foes = side === 'blue' ? this.red : this.blue;
      for (const u of team) observe(u, foes, this.arena, 0);
      this.commanders[side].update({ ...this.ctxFor(team[0]), allies: team, enemies: foes });
    }
  }

  // Token spend of this match only (summed from backend responses).
  addSpend(kind, used) {
    if (!used) return;
    this.spend ||= { llm: { calls: 0, input: 0, output: 0 }, jev: { calls: 0, input: 0, output: 0 } };
    const row = this.spend[kind];
    row.calls++;
    row.input += used.input_tokens || 0;
    row.output += used.output_tokens || 0;
  }

  dispose() {
    this.running = false;
    this.combat.clear();
    this.fx.clear();
    this.units.forEach(u => u.dispose());
    this.arena.dispose();
  }

  ctxFor(u) {
    const allies = u.team === 'blue' ? this.blue : this.red;
    const enemies = u.team === 'blue' ? this.red : this.blue;
    return { arena: this.arena, allies, enemies, time: this.time, duel: this.duel, combat: this.combat, match: this, focus: this.focus[u.team] };
  }

  log(unit, text) { this.radio(unit, text, 'log'); }

  styleOf(unit) { return unit.team === 'blue' ? 'player' : this.config.red.coach.id || 'player'; }

  // Templated callout in the team's voice (see data/chatter.js).
  say(unit, kind, vars, key = kind, urgent = false, force = false, channel = 'team') {
    const allies = (unit.team === 'blue' ? this.blue : this.red).filter(a => a.alive && a !== unit);
    const ally = vars.ally || allies.sort((a, b) => unit.distanceTo(a.position) - unit.distanceTo(b.position))[0]?.name || 'ЭХО';
    const text = line(this.styleOf(unit), kind, { ...vars, me: unit.name, ally }, !allies.length);
    if (text) this.radio(unit, text, key, urgent, force, channel);
  }

  // A badly damaged unit asks for help; the nearest healthy ally answers and
  // actually goes there (see pilot.resolveGoal / resolveTarget).
  maybeCallForHelp(u, attacker) {
    if (this.duel || !u.alive || u.hp / u.maxHp > .45 || this.time - (u.helpAt ?? -99) < 14) return;
    const helper = (u.team === 'blue' ? this.blue : this.red)
      .filter(a => a.alive && a !== u && a.hp / a.maxHp > .4 && !(a.assist?.until > this.time))
      .sort((a, b) => u.distanceTo(a.position) - u.distanceTo(b.position))[0];
    if (!helper) return;
    u.helpAt = this.time;
    const sq = square(u.position), hp = Math.round(u.hp / u.maxHp * 100);
    this.say(u, 'help', { e: attacker.name, sq, hp, ally: helper.name }, 'help', true, true);
    helper.assist = { x: u.position.x, z: u.position.z, target: attacker, until: this.time + 10, for: u.name };
    helper.retargetAt = 0;
    setTimeout(() => helper.alive && this.say(helper, 'helpReply', { e: attacker.name, ally: u.name }, 'helpReply', false, true), 900);
  }

  // Team radio: every unit reports contacts (with grid squares and coordinates),
  // lost targets, hits and kills. Readable in the HUD for both teams and fed to
  // that team's LLM commander as events.
  radio(unit, text, kind, urgent = false, force = false, channel = 'team') {
    if (!unit) return;
    unit.radioAt ||= {};
    // Contacts flicker behind cover: report each enemy at most every 9 s.
    const gap = kind.startsWith('contact') || kind.startsWith('lost') ? 9 : 4;
    if (!force && this.time - (unit.radioAt[kind] ?? -99) < gap) return;
    unit.radioAt[kind] = this.time;
    const msg = { t: this.time, team: unit.team, from: unit.name, text, kind, channel };
    this.radioLog.push(msg);
    if (this.radioLog.length > 200) this.radioLog.shift();
    if (kind !== 'talk' && kind !== 'taunt') this.commanders[unit.team].event(`${unit.name}: ${text}`, this.time, urgent);
    // Open-channel lines reach the other team's commander too, so it can answer.
    if (channel === 'all') this.commanders[unit.team === 'blue' ? 'red' : 'blue'].event(`${unit.name} (enemy, open channel): ${text}`, this.time, false);
    this.onRadio?.(msg, unit);
  }

  update(rawDt) {
    if (this.slowmo > 0) { this.slowmo -= rawDt; this.timeScale = THREE.MathUtils.lerp(this.timeScale, .3, .2); }
    else this.timeScale = THREE.MathUtils.lerp(this.timeScale, 1, .08);
    const dt = rawDt * this.timeScale;
    if (this.running) {
      this.time += dt;
      for (const side of ['blue', 'red']) {
        const team = this[side], foes = side === 'blue' ? this.red : this.blue;
        for (const u of team) {
          if (!u.alive) continue;
          const before = new Set((u.visible || []).map(e => e.id));
          const ev = observe(u, foes, this.arena, this.time);
          const now = new Set(u.visible.map(e => e.id));
          for (const e of u.visible) {
            if (before.has(e.id)) continue;
            this.say(u, 'contact', { e: e.name, sq: square(e.position), d: Math.round(u.distanceTo(e.position)) }, `contact-${e.id}`, !this.firstContact?.[side]);
            if (Math.random() < .12 && this.time - (u.tauntAt ?? -99) > 25) { u.tauntAt = this.time; setTimeout(() => u.alive && this.say(u, 'taunt', { e: e.name }, 'taunt', false, true, 'all'), 1200); }
          }
          for (const id of before) {
            const e = foes.find(f => f.id === id);
            if (!now.has(id) && e?.alive) this.say(u, 'lost', { e: e.name, sq: square(e.position) }, `lost-${id}`);
          }
          if (ev.acquired) { this.firstContact = { ...this.firstContact, [side]: true }; this.onContact?.(u); }
        }
        if (!this.duel) shareContacts(team, this.time);
        // Team focus = the enemy most allies currently target (CHESS-style focus fire).
        const tally = {};
        for (const u of team) if (u.alive && u.target) tally[u.target.id] = (tally[u.target.id] || 0) + 1;
        const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        this.focus[side] = best ? foes.find(f => f.id === best[0]) : null;
        this.commanders[side].update({ ...this.ctxFor(team[0]), allies: team, enemies: foes });
      }
      for (const s of this.streams) s.update(this.ctxFor(s.unit));
      for (const u of this.units) servo(u, this.ctxFor(u), dt);
      for (const u of this.units) u.move(dt, this.arena, this.units);
      this.combat.update(dt);
      this.checkEnd();
    }
    for (const u of this.units) u.animate(dt, this.fx, this.time);
    this.arena.update(this.world.clock);
    this.fx.update(dt);
    this.updateCamera(rawDt);
  }

  onDamage(u, amount, attacker) {
    const cmd = this.commanders[u.team];
    u.recentDamage = (u.recentDamage || 0) + amount;
    if (u.recentDamage > u.maxHp * .22) {
      this.say(u, 'hit', { e: attacker.name, sq: square(attacker.position), hp: Math.round(u.hp / u.maxHp * 100) }, 'hit', true);
      u.recentDamage = 0;
    }
    this.maybeCallForHelp(u, attacker);
    if (u === this.cameraUnit) this.world.impact(Math.min(.5, amount / 40));
    this.app.hud?.damage(u, amount, attacker);
  }

  onKill(u, attacker) {
    this.audio?.boom(1.6);
    this.say(attacker, 'kill', { e: u.name }, 'kill', true, true);
    const foe = (u.team === 'blue' ? this.blue : this.red).find(a => a.alive);
    if (foe && Math.random() < .6) setTimeout(() => attacker.alive && this.say(attacker, 'taunt', { e: foe.name }, 'taunt', false, true, 'all'), 1500);
    const ally = (u.team === 'blue' ? this.blue : this.red).find(a => a.alive);
    if (ally) this.say(ally, 'loss', { e: u.name }, 'loss', true, true);
    this.app.hud?.kill(u, attacker);
    // Kill cam: cut to the wreck in slow motion.
    this.slowmo = 1.3;
    if (this.camera.mode === 'director') this.setShot(u, 'orbit', 3.2);
  }

  checkEnd() {
    if (this.result) return;
    const blueAlive = this.blue.some(u => u.alive), redAlive = this.red.some(u => u.alive);
    let result = null;
    if (!redAlive) result = 'victory';
    else if (!blueAlive) result = 'defeat';
    else if (this.time >= this.duration) {
      const pct = (team) => team.reduce((s, u) => s + u.hp / u.maxHp, 0) / team.length;
      // A draw (or a match where nobody engaged) is not a win.
      result = pct(this.blue) > pct(this.red) + .02 ? 'victory' : 'defeat';
    }
    if (result) {
      this.result = result;
      setTimeout(() => { this.running = false; this.onEnd?.(result); }, 2600);
    }
  }

  // ------------------------------------------------------------ camera
  setShot(unit, shot, hold) {
    this.camera.unit = unit;
    this.cameraUnit = unit;
    this.camera.shot = shot;
    this.camera.shotUntil = this.world.clock + hold;
    this.camera.orbit = unit.aimHeading() + Math.PI * .7;
    this.camera.flip = Math.random() < .5;
    this.camera.cut = true;
  }

  pickShot() {
    const alive = this.units.filter(u => u.alive);
    if (!alive.length) return;
    const score = (u) => (u.lastAction === 'FIRING' ? 3 : 0) + (u.visible?.length || 0) * 2 + (1 - u.hp / u.maxHp) * 2 + (this.time - u.lastHitAt < 2 ? 2 : 0) + (u.team === 'blue' ? 1 : 0) + (u === this.camera.unit ? -2.5 : 0) + Math.random() * 1.5;
    const unit = alive.sort((a, b) => score(b) - score(a))[0];
    // Mostly wide broadcast framing (unit + its target + the terrain between),
    // with short close-ups as accents.
    const r = Math.random();
    const shot = r < .62 ? 'duo' : r < .8 ? 'over' : r < .9 ? 'chase' : 'side';
    this.setShot(unit, shot, shot === 'duo' || shot === 'over' ? rand(6, 9) : rand(3, 4.5));
  }

  updateCamera(dt) {
    const cam = this.camera;
    const c = this.world.camera;
    if (cam.mode === 'director' && (this.world.clock > cam.shotUntil || (!cam.unit.alive && cam.shot !== 'orbit'))) this.pickShot();
    if (cam.mode === 'follow' && !cam.unit.alive) cam.unit = this.units.find(u => u.alive && u.team === 'blue') || cam.unit;
    const u = cam.unit;
    const focus = u.centerMass(_v);
    focus.y = 5.4 * u.scale;
    const aim = u.aimHeading();
    const fwd = new THREE.Vector3(Math.sin(aim), 0, Math.cos(aim));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let desired, look;
    const shot = cam.mode === 'tactical' ? 'tactical' : cam.mode === 'follow' ? 'chase' : cam.shot;
    switch (shot) {
      case 'duo': {
        // Frame the unit and whoever it is fighting from a high side angle.
        const other = u.target?.alive ? u.target.position : u.goal ? new THREE.Vector3(u.goal.x, 0, u.goal.z) : focus.clone().addScaledVector(fwd, 20);
        const mid = focus.clone().lerp(new THREE.Vector3(other.x, focus.y, other.z), .45);
        const sep = Math.min(70, focus.distanceTo(new THREE.Vector3(other.x, focus.y, other.z)));
        const axis = Math.atan2(other.x - focus.x, other.z - focus.z);
        cam.orbit += dt * .04;
        const side = axis + Math.PI / 2 + Math.sin(cam.orbit) * .5 + (cam.flip ? Math.PI : 0);
        const dist = 26 + sep * .75;
        desired = mid.clone().add(new THREE.Vector3(Math.sin(side) * dist, 0, Math.cos(side) * dist)).setY(14 + sep * .32);
        look = mid.setY(2.5);
        break;
      }
      case 'side': desired = focus.clone().addScaledVector(right, 15).addScaledVector(fwd, 4).setY(4.5); look = focus.clone().addScaledVector(fwd, 6); break;
      case 'hero': desired = focus.clone().addScaledVector(fwd, 11).addScaledVector(right, -5).setY(2.4); look = focus.clone().setY(6); break;
      case 'over': desired = focus.clone().addScaledVector(fwd, -24).addScaledVector(right, 8).setY(24); look = focus.clone().addScaledVector(fwd, 18).setY(0); break;
      case 'orbit':
        cam.orbit += dt * .35;
        desired = focus.clone().add(new THREE.Vector3(Math.sin(cam.orbit) * 22, 10, Math.cos(cam.orbit) * 22));
        look = focus.clone().setY(3.5);
        break;
      case 'tactical': {
        const alive = this.units.filter(x => x.alive);
        const mid = alive.reduce((s, x) => s.add(x.position), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, alive.length));
        const spread = Math.max(30, ...alive.map(x => x.position.distanceTo(mid)));
        desired = mid.clone().add(new THREE.Vector3(0, spread * 1.5 + 18, spread * .9 + 22));
        look = mid;
        break;
      }
      default: desired = focus.clone().addScaledVector(fwd, -21).addScaledVector(right, 4).setY(focus.y + 9); look = focus.clone().addScaledVector(fwd, 16).setY(1.5);
    }
    // Keep the camera out of walls: walk it toward the subject until clear.
    for (let t = 0; t < 1 && shot !== 'tactical'; t += .08) {
      const p = _w.lerpVectors(desired, focus, t);
      if (!this.arena.obstacleAt(p.x, p.y, p.z) && this.arena.inBounds(p.x, p.z, -2) && this.arena.lineOfSight(p, focus, 0)) { desired.copy(p); break; }
    }
    desired.y = Math.max(1.6, desired.y);
    if (cam.cut) { cam.pos.copy(desired); cam.look.copy(look); cam.cut = false; }
    const k = 1 - Math.pow(shot === 'tactical' ? .2 : .02, dt);
    cam.pos.lerp(desired, k);
    cam.look.lerp(look, 1 - Math.pow(.004, dt));
    c.position.copy(cam.pos);
    c.lookAt(cam.look);
  }
}
