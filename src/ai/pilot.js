// Stream-level control: the discrete action vocabulary shared with the JEV
// streams, an offline policy that picks the same actions locally, and the
// servo layer that turns actions into motion, aiming and trigger pulls.
import * as THREE from 'three';
import { angleDelta } from '../engine/mech.js';
import { knownEnemies } from './perception.js';

export const ACTIONS = {
  navigation: ['follow_route', 'advance', 'retreat', 'strafe_left', 'strafe_right', 'turn_left', 'turn_right', 'hold'],
  turret: ['track_target', 'scan_left', 'scan_right', 'watch_last_known', 'watch_route', 'hold'],
  weapon: ['fire_arms', 'fire_support', 'fire_all', 'hold_fire'],
};

const TORSO_LIMIT = THREE.MathUtils.degToRad(150);
const QUIET_LIMIT = 10;

// Seconds since this unit (or a teammate) last actually saw an enemy.
export function quietFor(me, time) {
  let last = -Infinity;
  for (const k of Object.values(me.known || {})) if (!k.intel) last = Math.max(last, k.at);
  return time - Math.max(last, 0);
}

// ---------------------------------------------------------------- targets & goals
export function resolveTarget(me, ctx) {
  const enemies = ctx.enemies.filter(e => e.alive);
  if (!enemies.length) return null;
  const known = knownEnemies(me, ctx.enemies, ctx.time);
  const knownIds = new Set(known.map(k => k.id));
  const visible = me.visible || [];
  const pool = visible.length ? visible : enemies.filter(e => knownIds.has(e.id));
  const candidates = pool.length ? pool : enemies;
  // Answering a call for help: go after whoever is hurting the teammate.
  if (me.assist && ctx.time < me.assist.until && me.assist.target?.alive) return me.assist.target;
  const want = me.orders?.target || 'nearest';
  const named = candidates.find(e => e.name === want) || enemies.find(e => e.name === want && (visible.includes(e) || knownIds.has(e.id)));
  if (named) return named;
  if (want === 'weakest') return [...candidates].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (want === 'focus' && ctx.focus?.alive) return ctx.focus;
  return [...candidates].sort((a, b) => me.distanceTo(a.position) - me.distanceTo(b.position))[0];
}

function targetPoint(me, ctx) {
  const t = me.target;
  if (!t) return null;
  if ((me.visible || []).includes(t)) return { x: t.position.x, z: t.position.z, fresh: true };
  const k = me.known?.[t.id];
  if (k) return { x: k.x, z: k.z, fresh: false, age: ctx.time - k.at };
  return null;
}

function findCover(me, ctx, threat, range) {
  const { arena } = ctx;
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2, r = 8 + (i % 4) * 6;
    const x = me.position.x + Math.sin(a) * r, z = me.position.z + Math.cos(a) * r;
    if (arena.blocked(x, z, me.radius + .5)) continue;
    const exposed = arena.lineOfSight({ x, y: 6, z }, { x: threat.x, y: 6, z: threat.z });
    const dist = Math.hypot(x - threat.x, z - threat.z);
    // Prefer hidden spots near the ideal range, close to where we stand now.
    const score = (exposed ? 0 : 30) - Math.abs(dist - range) * .6 - r * .4 + (dist < 10 ? -40 : 0);
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  }
  return best;
}

export function resolveGoal(me, ctx) {
  const o = me.orders || {};
  const tp = targetPoint(me, ctx);
  const range = o.engage_range ?? 25;
  const center = { x: 0, z: 0 };
  const allies = ctx.allies.filter(a => a.alive && a !== me);
  if (me.assist && ctx.time < me.assist.until) {
    const tp2 = targetPoint(me, ctx);
    const base = tp2 || me.assist;
    const a = Math.atan2(me.position.x - base.x, me.position.z - base.z);
    const r = Math.max(14, (o.engage_range ?? 25) * .8);
    me.goal = { x: base.x + Math.sin(a) * r, z: base.z + Math.cos(a) * r };
    me.path = ctx.arena.nav.path(me.position, me.goal);
    return;
  }
  let goal = null;
  const quiet = quietFor(me, ctx.time) > QUIET_LIMIT;
  // Flanking or hiding relative to stale intel makes no sense: search instead.
  // An explicit ambush (stance hold + move_to hold) is respected: no search.
  const ambush = o.stance === 'hold' && o.move_to === 'hold';
  switch (quiet && !ambush && ['hold', 'cover', 'flank_left', 'flank_right'].includes(o.move_to) ? 'search' : o.move_to) {
    case 'search': goal = null; break;
    case 'hold': goal = null; break;
    case 'center': goal = center; break;
    case 'regroup':
    case 'ally': {
      if (!allies.length) { goal = tp || center; break; }
      const c = allies.reduce((s, a) => ({ x: s.x + a.position.x / allies.length, z: s.z + a.position.z / allies.length }), { x: 0, z: 0 });
      // Formation slot around the allies instead of one shared point.
      const slot = (ctx.allies.indexOf(me) + 1) * 2.1;
      goal = { x: c.x + Math.sin(slot) * 9, z: c.z + Math.cos(slot) * 9 };
      break;
    }
    case 'cover': {
      // Keep the chosen cover while it still hides us; re-pick only when it fails.
      const c = me.cover;
      const stillGood = c && tp && ctx.time - c.at < 6 && !ctx.arena.lineOfSight({ x: c.x, y: 6, z: c.z }, { x: tp.x, y: 6, z: tp.z }) && Math.hypot(c.x - tp.x, c.z - tp.z) > 10;
      if (!stillGood) me.cover = tp ? { ...(findCover(me, ctx, tp, range) || { x: me.position.x, z: me.position.z }), at: ctx.time } : null;
      goal = me.cover ? { x: me.cover.x, z: me.cover.z } : null;
      break;
    }
    case 'flank_left':
    case 'flank_right': {
      if (!tp) { goal = center; break; }
      const side = o.move_to === 'flank_left' ? -1 : 1;
      const base = Math.atan2(me.position.x - tp.x, me.position.z - tp.z) + side * 1.25;
      goal = { x: tp.x + Math.sin(base) * Math.max(14, range), z: tp.z + Math.cos(base) * Math.max(14, range) };
      break;
    }
    case 'last_known':
    case 'enemy':
    default:
      goal = tp || null;
  }
  if (!goal && (o.move_to !== 'hold' || (quiet && !ambush))) {
    // Search points closest to the last intel first, so both sides converge.
    // Nothing known: sweep the map's search points, nearest-unvisited first.
    me.searchIndex = me.searchIndex ?? Math.floor(Math.random() * ctx.arena.map.search.length);
    const s = ctx.arena.map.search[me.searchIndex % ctx.arena.map.search.length];
    goal = { x: s[0], z: s[1] };
    if (Math.hypot(goal.x - me.position.x, goal.z - me.position.z) < 8) me.searchIndex++;
  }
  if (goal) {
    goal.x = THREE.MathUtils.clamp(goal.x, -ctx.arena.half + 4, ctx.arena.half - 4);
    goal.z = THREE.MathUtils.clamp(goal.z, -ctx.arena.half + 4, ctx.arena.half - 4);
  }
  me.goal = goal;
  me.path = goal ? ctx.arena.nav.path(me.position, goal) : [];
}

// ---------------------------------------------------------------- offline policy
// Same choices a JEV stream would return, picked by rules from the orders.
export function localPolicy(me, ctx) {
  const o = me.orders || {};
  const t = me.target;
  const seen = t && (me.visible || []).includes(t);
  const dist = t ? me.distanceTo(t.position) : Infinity;
  const range = o.engage_range ?? 25;
  let navigation = 'follow_route';
  if (o.stance === 'hold' && !seen) navigation = me.goal && Math.hypot(me.goal.x - me.position.x, me.goal.z - me.position.z) > 4 ? 'follow_route' : 'hold';
  if (seen) {
    if (!me.noRetreat && (o.stance === 'retreat' || me.hp / me.maxHp < .18 && o.stance !== 'assault')) navigation = 'retreat';
    else if (dist > range + 5) navigation = o.move_to === 'flank_left' || o.move_to === 'flank_right' || o.move_to === 'cover' ? 'follow_route' : 'advance';
    else if (dist < range - 6) navigation = 'retreat';
    else {
      // Inside the band: dodge with sidesteps that flip every few seconds.
      const phase = Math.floor((ctx.time + me.position.x) / (o.stance === 'assault' ? 2.2 : 3.2)) % 3;
      navigation = phase === 0 ? 'strafe_left' : phase === 1 ? 'strafe_right' : (o.stance === 'hold' || o.stance === 'skirmish' ? 'hold' : 'advance');
    }
  }
  if (me.blocked && navigation === 'advance') navigation = 'follow_route';

  let turret = 'track_target';
  if (!seen) {
    const k = t && me.known?.[t.id];
    turret = k && ctx.time - k.at < 6 ? 'watch_last_known' : Math.sin(ctx.time * .5 + me.position.z) > 0 ? 'scan_left' : 'scan_right';
  }

  let weapon = 'hold_fire';
  const support = me.weapons[2];
  const supportReady = support && support.ammo > 0;
  if (seen) {
    weapon = o.fire_discipline === 'conserve' ? 'fire_arms' : 'fire_all';
    if (supportReady && o.use_support === 'never') weapon = 'fire_arms';
    if (supportReady && o.use_support === 'finisher' && t.hp / t.maxHp > .4) weapon = 'fire_arms';
  } else if (supportReady && support.def.kind === 'mortar' && o.use_support !== 'never') {
    const k = t && me.known?.[t.id];
    if (k && ctx.time - k.at < 8) weapon = 'fire_support';
  }
  return { navigation, turret, weapon };
}

// ---------------------------------------------------------------- servo
const lead = (shooter, target, speed) => {
  const d = shooter.distanceTo(target.position);
  const t = speed ? d / speed : 0;
  return { x: target.position.x + target.velocity.x * t * .85, z: target.position.z + target.velocity.z * t * .85 };
};

export function servo(me, ctx, dt) {
  if (!me.alive) return;
  me.stun = Math.max(0, me.stun - dt);
  me.heat = Math.max(0, me.heat - dt * 15);
  if (me.overheated && me.heat < 35) me.overheated = false;
  for (const w of me.weapons) if (w) w.cooldown = Math.max(0, w.cooldown - dt);
  const act = { ...(me.actions || { navigation: 'hold', turret: 'scan_left', weapon: 'hold_fire' }) };
  // Watchdog: nobody may camp blind. Without contact for a while, search instead.
  if (!(me.visible || []).length && quietFor(me, ctx.time) > QUIET_LIMIT) {
    const ambush = me.orders?.stance === 'hold' && me.orders?.move_to === 'hold';
    if (!ambush && (act.navigation === 'hold' || act.navigation.startsWith('turn'))) act.navigation = 'follow_route';
    if (act.turret === 'hold' || act.turret === 'watch_last_known') act.turret = Math.sin(ctx.time * .4) > 0 ? 'scan_left' : 'scan_right';
    me.watchdog = true;
  } else me.watchdog = false;
  const t = me.target;
  const seen = t && (me.visible || []).includes(t);
  const tp = t ? (seen ? t.position : me.known?.[t.id]) : null;

  if (me.stun > 0) {
    me.velocity.set(0, 0, 0);
    me.turnRate = 0;
    me.lastAction = 'STUNNED';
    return;
  }

  // ---- legs
  let moveDir = null, face = null, speed = 0;
  let nav = act.navigation;
  // Range reflex: a ranged unit whose enemy got inside its band backs off at
  // once instead of waiting for the next stream answer.
  const band = me.orders?.engage_range ?? 20;
  const reach = Math.max(...me.weapons.filter(w => w && w.def.mount === 'arm').map(w => w.def.range), 0);
  if (seen && !me.noRetreat && reach >= 30 && (nav === 'follow_route' || nav === 'hold' || nav === 'advance') && !['assault', 'bait'].includes(me.orders?.stance) && band >= 18 && me.distanceTo(t.position) < band - 6) nav = 'retreat';
  // Doctrine: units that may not retreat turn a stream's retreat into a push.
  if (me.noRetreat && nav === 'retreat') nav = seen ? 'advance' : 'follow_route';
  const bearingT = tp ? Math.atan2(tp.x - me.position.x, tp.z - me.position.z) : me.heading;
  const routeTo = (pt) => {
    if (!me.localPath || ctx.time - (me.localPathAt || 0) > .7 || me.localPathGoal !== pt.key) {
      me.localPath = ctx.arena.nav.path(me.position, pt);
      me.localPathAt = ctx.time;
      me.localPathGoal = pt.key;
    }
    return me.localPath;
  };
  const followPath = (path) => {
    while (path.length > 1 && Math.hypot(path[0].x - me.position.x, path[0].z - me.position.z) < 2.2) path.shift();
    if (!path.length) return null;
    const wp = path[0];
    if (Math.hypot(wp.x - me.position.x, wp.z - me.position.z) < 1.2) return null;
    return Math.atan2(wp.x - me.position.x, wp.z - me.position.z);
  };
  if (nav === 'follow_route' && me.path?.length) {
    moveDir = followPath(me.path);
    face = moveDir;
    speed = 1;
    // Don't walk the route into the enemy: inside engagement range, stop closing in.
    if (moveDir !== null && seen) {
      const close = Math.max(me.orders?.engage_range ?? 20, me.radius + t.radius + 6);
      if (me.distanceTo(t.position) < close && Math.abs(angleDelta(moveDir, bearingT)) < Math.PI / 3) moveDir = null;
    }
    // Arrived with a threat around: shuffle side to side instead of standing still.
    if (moveDir === null && tp) {
      const side = Math.floor(ctx.time / 1.8 + me.position.x) % 2 ? 1 : -1;
      const a = bearingT + side * Math.PI / 2;
      if (!ctx.arena.blocked(me.position.x + Math.sin(a) * 3, me.position.z + Math.cos(a) * 3, me.radius)) { moveDir = a; face = bearingT; speed = .45; }
    }
  } else if (nav === 'advance' && tp) {
    if (me.distanceTo(tp) > 7.5) {
      moveDir = followPath(routeTo({ x: tp.x, z: tp.z, key: 'adv' }));
      // No usable waypoint: head straight for the target if the next metres are clear.
      if (moveDir === null && !ctx.arena.blocked(me.position.x + Math.sin(bearingT) * 2, me.position.z + Math.cos(bearingT) * 2, me.radius)) moveDir = bearingT;
      face = moveDir; speed = 1;
    }
  } else if ((nav === 'retreat' || nav === 'strafe_left' || nav === 'strafe_right') && tp) {
    const off = nav === 'retreat' ? Math.PI : nav === 'strafe_left' ? -Math.PI / 2 : Math.PI / 2;
    let best = null;
    for (const tweak of [0, .5, -.5, 1, -1]) {
      const a = bearingT + off + tweak;
      const x = me.position.x + Math.sin(a) * 9, z = me.position.z + Math.cos(a) * 9;
      let clear = !ctx.arena.blocked(x, z, me.radius);
      for (let d = 1.5; clear && d < 9; d += 1.5) clear = !ctx.arena.blocked(me.position.x + Math.sin(a) * d, me.position.z + Math.cos(a) * d, me.radius + .3);
      if (clear) { best = a; break; }
    }
    if (best !== null) { moveDir = best; face = bearingT; speed = 1; }
  } else if (nav === 'turn_left' || nav === 'turn_right') {
    face = me.heading + (nav === 'turn_left' ? -1 : 1);
  }
  // In contact, never turn your back: walk the route sideways/backwards while
  // the legs keep facing the threat so the torso can stay on target.
  const k = t && me.known?.[t.id];
  const engaged = tp && (seen || (k && ctx.time - k.at < 3));
  if (engaged && moveDir !== null && face === moveDir && Math.abs(angleDelta(moveDir, bearingT)) > Math.PI * .4) face = bearingT;
  if (face !== null) {
    const err = angleDelta(me.heading, face);
    const turn = THREE.MathUtils.clamp(err, -me.chassis.turn * dt, me.chassis.turn * dt);
    me.heading += turn;
    me.torsoYaw -= turn; // the torso keeps its world aim while the legs turn
    me.turnRate = turn / dt;
  } else me.turnRate = 0;
  if (moveDir !== null && speed > 0) {
    const off = Math.abs(angleDelta(me.heading, moveDir));
    // Turning toward the route slows you down; deliberate strafing/backpedalling is .75/.65 speed.
    const facing = face === moveDir ? Math.max(.25, Math.cos(off)) : off > Math.PI * .65 ? .9 : off > Math.PI * .35 ? .9 : 1;
    const v = me.speed * speed * facing;
    me.velocity.set(Math.sin(moveDir) * v, 0, Math.cos(moveDir) * v);
  } else me.velocity.set(0, 0, 0);
  // Local avoidance: steer around allies and wrecks instead of pushing into them
  // (the nav grid only knows static obstacles).
  if (me.velocity.lengthSq() > .01) {
    const v = me.velocity, sp = v.length();
    let ax = 0, az = 0;
    for (const o of ctx.match.units) {
      if (o === me || !o.alive) continue;
      const dx = me.position.x - o.position.x, dz = me.position.z - o.position.z, d = Math.hypot(dx, dz);
      const R = me.radius + o.radius + 3.5;
      if (d >= R || d < .01) continue;
      if (dx * v.x + dz * v.z > 0) continue; // only units in front of us
      const w = (1 - d / R) * 1.6;
      // Slide past on the side we are already offset to.
      const side = Math.sign(dx * v.z - dz * v.x) || 1;
      ax += (dx / d) * w * .6 + (-dz / d) * side * w;
      az += (dz / d) * w * .6 + (dx / d) * side * w;
    }
    if (ax || az) {
      const nx = v.x / sp + ax, nz = v.z / sp + az, nl = Math.hypot(nx, nz) || 1;
      v.set(nx / nl * sp, 0, nz / nl * sp);
    }
  }

  // No-progress watchdog: the unit wants to travel but has not moved 1 m in
  // 3 s (and is not simply holding inside its engagement band) -> unstick.
  const wantsToTravel = ['follow_route', 'advance'].includes(nav) && !(seen && me.distanceTo(t.position) < (me.orders?.engage_range ?? 20) + 4);
  if (!me.progress || Math.hypot(me.position.x - me.progress.x, me.position.z - me.progress.z) > 1) me.progress = { x: me.position.x, z: me.position.z, at: ctx.time };
  else if (wantsToTravel && ctx.time - me.progress.at > 3 && !(me.unstickUntil > ctx.time)) {
    me.progress.at = ctx.time;
    me.stuckFor = 1;
    me.blocked = true;
  }

  // Stuck (corners, low barriers): back off for a moment in the freest direction,
  // then replan. One frame of sidestep was not enough to clear a barrier.
  me.stuckFor = me.blocked && speed > 0 ? (me.stuckFor || 0) + dt : 0;
  if (me.blocked && speed > 0) me.stuckTime = (me.stuckTime || 0) + dt; // diagnostics
  if ((me.stuckFor > .4 || me.stuckFor === 1) && !(me.unstickUntil > ctx.time)) {
    me.stuckFor = 0;
    let best = null, bestFree = -1;
    for (let i = 0; i < 12; i++) {
      const a = me.heading + Math.PI + (i / 12) * Math.PI * 2;
      let free = 0;
      for (let d = 1; d <= 8; d += 1) { if (ctx.arena.blocked(me.position.x + Math.sin(a) * d, me.position.z + Math.cos(a) * d, me.radius)) break; free = d; }
      if (free > bestFree) { bestFree = free; best = a; }
    }
    me.unstickDir = best;
    me.unstickUntil = ctx.time + .9;
  }
  if (me.unstickUntil > ctx.time && me.unstickDir != null) {
    me.velocity.set(Math.sin(me.unstickDir) * me.speed * .7, 0, Math.cos(me.unstickDir) * me.speed * .7);
    if (ctx.time > me.unstickUntil - .05) {
      me.localPath = null;
      if (me.goal) me.path = ctx.arena.nav.path(me.position, me.goal);
    }
  }

  // ---- torso
  let aim = null;
  const sweep = (dir) => { me.scanDir = me.scanDir ?? dir; if (Math.abs(me.torsoYaw) > TORSO_LIMIT * .92) me.scanDir = -Math.sign(me.torsoYaw); return me.aimHeading() + me.scanDir * .6; };
  const visibleAny = (me.visible || [])[0];
  switch (act.turret) {
    case 'track_target':
      if (seen) { const p = lead(me, t, me.weapons[0]?.def.speed); aim = Math.atan2(p.x - me.position.x, p.z - me.position.z); }
      else if (tp) aim = bearingT;
      else aim = sweep(1);
      break;
    case 'watch_last_known': aim = tp ? bearingT : sweep(1); break;
    case 'watch_route': aim = me.path?.length ? Math.atan2(me.path[0].x - me.position.x, me.path[0].z - me.position.z) : me.heading; break;
    case 'scan_left':
    case 'scan_right':
      // Searching stops as soon as something is in view: lock and track it.
      if (visibleAny) { const p = lead(me, visibleAny, me.weapons[0]?.def.speed); aim = Math.atan2(p.x - me.position.x, p.z - me.position.z); }
      else aim = sweep(act.turret === 'scan_left' ? -1 : 1);
      break;
    default: aim = null;
  }
  // Target lock: a visible enemy is always tracked, and one that just slipped out
  // of sight is followed along its predicted path for a few seconds. The JEV
  // turret choice only steers the camera when there is nothing to hold onto.
  const visibleTarget = seen ? t : visibleAny;
  if (visibleTarget && act.turret !== 'hold') {
    const p = lead(me, visibleTarget, me.weapons[0]?.def.speed);
    aim = Math.atan2(p.x - me.position.x, p.z - me.position.z);
    me.lockId = visibleTarget.id;
  } else if (me.lockId && me.known?.[me.lockId] && ctx.time - me.known[me.lockId].at < 4) {
    const k = me.known[me.lockId], age = ctx.time - k.at;
    aim = Math.atan2(k.x + (k.vx || 0) * age - me.position.x, k.z + (k.vz || 0) * age - me.position.z);
  }
  // Reflex: under fire from something unseen, swing the torso toward the shooter.
  const shooter = me.lastAttacker;
  if (shooter?.alive && ctx.time - me.lastHitAt < 1.6 && !(me.visible || []).includes(shooter) && me.known?.[shooter.id]) {
    const k = me.known[shooter.id];
    aim = Math.atan2(k.x - me.position.x, k.z - me.position.z);
    if (!seen) me.target = shooter;
  }
  if (aim !== null) {
    const desired = THREE.MathUtils.clamp(angleDelta(me.heading, aim), -TORSO_LIMIT, TORSO_LIMIT);
    const err = angleDelta(me.torsoYaw, desired);
    const rate = me.chassis.torsoTurn * Math.min(1, .35 + Math.abs(err) * 1.6);
    me.torsoYaw += THREE.MathUtils.clamp(err, -rate * dt, rate * dt);
  }
  me.torsoYaw = THREE.MathUtils.clamp(me.torsoYaw, -TORSO_LIMIT, TORSO_LIMIT);

  // ---- weapons
  const wantArms = act.weapon === 'fire_arms' || act.weapon === 'fire_all';
  const wantSupport = act.weapon === 'fire_support' || act.weapon === 'fire_all';
  let fired = false;
  const shooting = seen ? t : (visibleAny && (act.turret === 'scan_left' || act.turret === 'scan_right') ? visibleAny : null);
  for (const w of me.weapons) {
    if (!w) continue;
    const isSupport = w.def.mount === 'shoulder';
    if (isSupport ? !wantSupport : !wantArms) { if (w.def.kind === 'beam') w.firing = false; continue; }
    if (me.overheated || w.cooldown > 0 || w.ammo <= 0 || w.charging > 0) continue;
    if (w.def.kind === 'mortar') {
      const k = t && (seen ? { x: t.position.x, z: t.position.z } : me.known?.[t.id]);
      if (!k) continue;
      const d = me.distanceTo(k);
      if (d > w.def.range || d < w.def.minRange) continue;
      ctx.combat.fire(me, w, t, k);
      fired = true;
      continue;
    }
    if (!shooting) continue;
    const d = me.distanceTo(shooting.position);
    if (d > w.def.range) continue;
    const err = Math.abs(me.turretErrorTo(shooting.position));
    const allowance = w.def.tolerance + Math.atan2(shooting.radius * .8, d);
    if (err > allowance) continue;
    ctx.combat.fire(me, w, shooting);
    fired = true;
  }
  const moving = me.velocity.lengthSq() > .1;
  me.lastAction = fired ? 'FIRING' : nav === 'retreat' && moving ? 'RETREATING' : nav.startsWith('strafe') && moving ? 'STRAFING' : moving ? 'MOVING' : Math.abs(me.turnRate) > .05 ? 'TURNING' : 'HOLDING';
}
