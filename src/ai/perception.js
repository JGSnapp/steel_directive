// What a mech knows: its own camera (FOV + range + line of sight), shared team
// contacts and a short memory of timestamped observations.
import * as THREE from 'three';
import { angleDelta } from '../engine/mech.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const deg = (r) => Math.round(THREE.MathUtils.radToDeg(r));
const r1 = (v) => Math.round(v * 10) / 10;
export const MEMORY_SIZE = 12;

export function canSee(me, other, arena) {
  if (!other.alive && !other.wreckVisible) return false;
  const range = me.chassis.sensor * arena.map.sightMul;
  const d = me.distanceTo(other.position);
  if (d > range) return false;
  if (Math.abs(angleDelta(me.aimHeading(), me.bearingTo(other.position))) > me.chassis.fov / 2) return false;
  return arena.lineOfSight(me.sensorPosition(_a), other.centerMass(_b));
}

export function describeContact(me, e) {
  return {
    id: e.id, name: e.name, chassis: e.chassis.name, distance: r1(me.distanceTo(e.position)),
    bearing_from_turret_deg: deg(me.turretErrorTo(e.position)),
    bearing_from_legs_deg: deg(angleDelta(me.heading, me.bearingTo(e.position))),
    hp_pct: Math.round(e.hp / e.maxHp * 100), action: e.lastAction, stunned: e.stun > 0,
    position: { x: r1(e.position.x), z: r1(e.position.z) },
  };
}

// Called a few times per second per unit; stores a compact memory slice.
export function observe(me, enemies, arena, time) {
  const seen = enemies.filter(e => e.alive && canSee(me, e, arena));
  me.visible = seen;
  const wasVisible = me.hadVisual;
  me.hadVisual = seen.length > 0;
  for (const e of seen) {
    me.known = me.known || {};
    me.known[e.id] = { id: e.id, name: e.name, x: e.position.x, z: e.position.z, hp: e.hp / e.maxHp, at: time, action: e.lastAction, heading: e.heading, vx: e.velocity.x, vz: e.velocity.z };
  }
  if (!me.lastMemoryAt || time - me.lastMemoryAt > .8) {
    me.lastMemoryAt = time;
    me.memory.push({
      t: r1(time), hp: Math.round(me.hp / me.maxHp * 100),
      seen: seen.map(e => ({ name: e.name, x: r1(e.position.x), z: r1(e.position.z), hp: Math.round(e.hp / e.maxHp * 100), action: e.lastAction })),
    });
    if (me.memory.length > MEMORY_SIZE) me.memory.shift();
  }
  return { acquired: !wasVisible && me.hadVisual, lost: wasVisible && !me.hadVisual };
}

// Allies broadcast what they see; everyone on the team gets the newest report.
export function shareContacts(team, time) {
  const pool = {};
  for (const m of team) {
    if (!m.alive || !m.known) continue;
    for (const k of Object.values(m.known)) if (!pool[k.id] || pool[k.id].at < k.at) pool[k.id] = { ...k, reportedBy: m.name };
  }
  for (const m of team) {
    m.known = m.known || {};
    for (const k of Object.values(pool)) if (!m.known[k.id] || m.known[k.id].at < k.at) m.known[k.id] = { ...k, shared: true };
  }
}

export function knownEnemies(me, enemies, time) {
  const alive = new Set(enemies.filter(e => e.alive).map(e => e.id));
  return Object.values(me.known || {}).filter(k => alive.has(k.id)).map(k => ({ ...k, age: time - k.at }));
}

function mobility(me, arena) {
  const probe = (offset) => {
    const a = me.heading + offset;
    for (let d = .5; d <= 12; d += .5) {
      if (arena.blocked(me.position.x + Math.sin(a) * d, me.position.z + Math.cos(a) * d, me.radius)) return d - .5;
    }
    return 12;
  };
  return { front: probe(0), left: probe(-Math.PI / 2), right: probe(Math.PI / 2), rear: probe(Math.PI) };
}

// The JSON state shared by the commander and all JEV streams of one unit.
function lastContact(me) {
  let last = -Infinity;
  for (const k of Object.values(me.known || {})) if (!k.intel) last = Math.max(last, k.at);
  return last;
}

export function snapshot(me, ctx) {
  const { arena, enemies, allies, time } = ctx;
  const target = me.target;
  const known = knownEnemies(me, enemies, time);
  const goal = me.goal;
  return {
    t: r1(time),
    seconds_since_contact: Number.isFinite(time - lastContact(me)) ? r1(time - lastContact(me)) : 'never',
    unit: {
      name: me.name, chassis: me.chassis.name, role: me.role, hp_pct: Math.round(me.hp / me.maxHp * 100), heat: Math.round(me.heat), overheated: me.overheated,
      stunned: me.stun > 0, blocked: !!me.blocked, position: { x: r1(me.position.x), z: r1(me.position.z) },
      legs_heading_deg: deg(me.heading), torso_offset_deg: deg(me.torsoYaw),
      weapons: me.weapons.filter(Boolean).map(w => ({ slot: w.def.mount === 'shoulder' ? 'support' : 'arm', name: w.def.short, range_m: w.def.range, ammo: Number.isFinite(w.ammo) ? w.ammo : 'inf', ready: w.cooldown <= 0 })),
      mobility_m: mobility(me, arena),
    },
    visible_enemies: (me.visible || []).map(e => describeContact(me, e)),
    current_target: target ? { name: target.name, visible: (me.visible || []).includes(target), distance: r1(me.distanceTo(target.position)) } : null,
    last_known_enemies: known.filter(k => !(me.visible || []).some(v => v.id === k.id)).map(k => ({ name: k.name, x: r1(k.x), z: r1(k.z), age_s: r1(k.age), source: k.intel ? 'league spawn intel' : k.shared ? `ally ${k.reportedBy}` : 'own sensor' })),
    allies: allies.filter(a => a !== me).map(a => ({ name: a.name, alive: a.alive, hp_pct: Math.round(a.hp / a.maxHp * 100), distance: r1(me.distanceTo(a.position)), action: a.lastAction })),
    route: goal ? { goal: me.orders?.move_to, distance_m: r1(Math.hypot(goal.x - me.position.x, goal.z - me.position.z)), next_waypoint_from_legs_deg: me.path?.length ? deg(angleDelta(me.heading, Math.atan2(me.path[0].x - me.position.x, me.path[0].z - me.position.z))) : 0 } : null,
    memory: me.memory.slice(-6),
  };
}

export { deg, r1 };
