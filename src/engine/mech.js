import * as THREE from 'three';
import { CHASSIS, PALETTES } from '../data/chassis.js';
import { WEAPONS } from '../data/weapons.js';
import { instantiateMech, instantiateWeapon } from './assets.js';

const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const _v = new THREE.Vector3();

let nextId = 1;

export class Mech {
  // spec: { name, chassis, weapons:[armL, armR, support], palette, elite, team, coach, strategy, role }
  constructor(scene, spec) {
    this.scene = scene;
    this.id = `${spec.team === 'blue' ? 'B' : 'R'}${nextId++}`;
    this.name = spec.name;
    this.team = spec.team;
    this.coach = spec.coach;
    this.role = spec.role || null;
    this.strategy = spec.strategy || '';
    this.elite = !!spec.elite;
    this.chassis = CHASSIS[spec.chassis];
    this.paletteName = spec.palette;
    const palette = PALETTES[spec.palette];
    this.color = palette[3];
    this.maxHp = this.chassis.hp * (this.elite ? 1.25 : 1);
    this.hp = this.maxHp;
    this.radius = this.chassis.radius * (this.elite ? 1.12 : 1);
    this.speed = this.chassis.speed * (this.elite ? .93 : 1);

    const { object, nodes, materials } = instantiateMech(spec.chassis, palette);
    this.root = new THREE.Group();
    this.root.add(object);
    this.nodes = nodes;
    this.materials = materials;
    if (this.elite) object.scale.setScalar(1.15);
    this.scale = this.elite ? 1.15 : 1;
    this.baseTorsoY = nodes.torso.position.y;
    this.baseHipsY = nodes.hips.position.y;
    this.reverseLegs = spec.chassis === 'vector' || spec.chassis === 'spark';

    this.weapons = spec.weapons.map((id, slot) => {
      if (!id) return null;
      const def = WEAPONS[id];
      const mountName = def.mount === 'shoulder' ? 'mount_shoulder_R' : slot === 0 ? 'mount_arm_L' : 'mount_arm_R';
      const { object: w, muzzle } = instantiateWeapon(id, palette);
      nodes[mountName].add(w);
      return { def, slot, object: w, muzzle, cooldown: Math.random() * .5, ammo: def.ammo, recoil: 0, charging: 0, firing: false };
    });

    // Team ring under the feet: readable at a glance from the director camera.
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.radius + .3, this.radius + .65, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: spec.team === 'blue' ? 0x3fe0f5 : 0xff4a3a, transparent: true, opacity: .55, depthWrite: false }));
    ring.position.y = .06;
    this.root.add(ring);
    this.ring = ring;

    this.root.traverse(n => { if (n.isMesh && n !== ring) { n.castShadow = true; n.receiveShadow = true; } });
    scene.add(this.root);

    this.heading = 0;
    this.torsoYaw = 0;
    this.velocity = new THREE.Vector3();
    this.heat = 0;
    this.overheated = false;
    this.stun = 0;
    this.alive = true;
    this.step = Math.random() * 6;
    this.turnRate = 0;
    this.lastAction = 'IDLE';
    this.memory = [];
    this.damageTaken = 0;
    this.kills = 0;
    this.lastHitAt = -99;
    this.smokeTimer = 0;
    this.deathTime = 0;
  }

  get position() { return this.root.position; }

  place(x, z, heading) {
    this.root.position.set(x, 0, z);
    this.heading = heading;
    this.root.rotation.y = heading;
  }

  sensorPosition(out = new THREE.Vector3()) { return this.nodes.sensor.getWorldPosition(out); }
  aimHeading() { return this.heading + this.torsoYaw; }
  centerMass(out = new THREE.Vector3()) { return out.copy(this.root.position).setY(5 * this.scale); }

  // Movement with obstacle sliding and unit separation.
  move(dt, arena, others) {
    if (!this.alive) return;
    const pos = this.root.position;
    const delta = _v.copy(this.velocity).multiplyScalar(dt);
    let nx = pos.x + delta.x, nz = pos.z + delta.z;
    // Wrecks have collapsed and can be stepped over; only live mechs collide.
    const hitsUnit = (x, z) => others.some(o => o !== this && o.alive && Math.hypot(x - o.position.x, z - o.position.z) < this.radius + o.radius);
    const free = (x, z) => !arena.blocked(x, z, this.radius) && !hitsUnit(x, z);
    this.blocked = false;
    if (!free(nx, nz)) {
      this.blocked = true;
      if (free(nx, pos.z)) nz = pos.z;
      else if (free(pos.x, nz)) nx = pos.x;
      else { nx = pos.x; nz = pos.z; }
    }
    // Walk cycle follows real displacement, so a mech pressed against a wall stands still.
    this.actualSpeed = THREE.MathUtils.lerp(this.actualSpeed || 0, Math.hypot(nx - pos.x, nz - pos.z) / Math.max(dt, 1e-4), .35);
    pos.x = nx; pos.z = nz;
    // Push apart if two units overlap (spawns, knockback).
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = pos.x - o.position.x, dz = pos.z - o.position.z, d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > .001) {
        const push = (min - d) * .5;
        const tx = pos.x + dx / d * push, tz = pos.z + dz / d * push;
        if (!arena.blocked(tx, tz, this.radius)) { pos.x = tx; pos.z = tz; }
      }
    }
  }

  animate(dt, fx, time) {
    const n = this.nodes;
    this.root.rotation.y = this.heading;
    n.torso.rotation.y = this.torsoYaw;
    if (!this.alive) {
      this.deathTime += dt;
      const t = Math.min(1, this.deathTime / 1.2);
      n.torso.rotation.x = THREE.MathUtils.lerp(0, .32, t);
      n.torso.rotation.z = THREE.MathUtils.lerp(0, .12, t);
      n.torso.position.y = this.baseTorsoY - t * 1.2;
      n.hips.position.y = this.baseHipsY - t * 1.1;
      n.thigh_L.rotation.x = n.thigh_R.rotation.x = -t * .5;
      n.shin_L.rotation.x = n.shin_R.rotation.x = t * (this.reverseLegs ? -1.1 : 1.1);
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0 && this.deathTime < 30) {
        this.smokeTimer = .08;
        const p = this.centerMass(_v);
        fx.puff(p.setY(p.y - 1), 1, .12, 3.2, 3.5, 3);
        if (this.deathTime < 14) fx.fire(this.centerMass(_v).setY(4 * this.scale), 1.2);
      }
      return;
    }
    const speed = this.actualSpeed ?? this.velocity.length();
    const activity = Math.min(1, speed / 3 + Math.abs(this.turnRate) * .6);
    this.step += (speed * .62 + Math.abs(this.turnRate) * 1.8) * dt;
    const k = this.reverseLegs ? -1 : 1;
    for (const [side, phase] of [['L', 0], ['R', Math.PI]]) {
      const p = this.step + phase;
      const swing = Math.sin(p) * .42 * activity;
      const lift = Math.max(0, Math.cos(p)) * .75 * activity;
      n[`thigh_${side}`].rotation.x = -swing - lift * .35 * k;
      n[`shin_${side}`].rotation.x = lift * .7 * k;
      n[`foot_${side}`].rotation.x = swing * .6 - lift * .3 * k;
    }
    const bob = Math.abs(Math.sin(this.step)) * .16 * activity;
    n.hips.position.y = this.baseHipsY - bob;
    n.torso.position.y = this.baseTorsoY - bob * 1.1;
    n.torso.rotation.z = Math.sin(this.step) * .03 * activity;
    n.torso.rotation.x = (this.stun > 0 ? Math.sin(time * 40) * .04 : 0);
    // Footfall dust.
    if (activity > .3) {
      const s = Math.sin(this.step);
      if ((this.lastStepSign || 0) * s < 0) {
        const foot = (s > 0 ? n.foot_R : n.foot_L).getWorldPosition(_v);
        fx.puff(foot.setY(.3), 2, .5, 1.2, .9, .4);
      }
      this.lastStepSign = s;
    }
    for (const w of this.weapons) {
      if (!w) continue;
      w.recoil = Math.max(0, w.recoil - dt * 6);
      w.object.position.z = -w.recoil * .45;
    }
    // Damage states.
    this.smokeTimer -= dt;
    const ratio = this.hp / this.maxHp;
    if (this.smokeTimer <= 0 && ratio < .55) {
      this.smokeTimer = ratio < .25 ? .05 : .14;
      const p = this.nodes.torso.getWorldPosition(_v);
      p.y += 2.2 * this.scale;
      fx.puff(p, 1, ratio < .25 ? .1 : .3, 1.4, 1.8, 2.2);
      if (ratio < .25) { fx.fire(p, .6); if (Math.random() < .1) fx.sparks(p, 0xffc070, 4, .5); }
    }
    if (this.overheated && Math.random() < .5) {
      const p = this.nodes[`exhaust_${Math.random() < .5 ? 'L' : 'R'}`].getWorldPosition(_v);
      fx.puff(p, 1, .9, 1, .8, 3);
    }
    if (this.stun > 0 && Math.random() < .35) {
      const p = this.centerMass(_v);
      p.x += (Math.random() - .5) * 3; p.y += (Math.random() - .5) * 4; p.z += (Math.random() - .5) * 3;
      fx.sparks(p, 0xc98bff, 3, .4);
    }
    this.ring.material.opacity = .45 + Math.sin(time * 4) * .1;
  }

  powerDown() {
    this.alive = false;
    this.velocity.set(0, 0, 0);
    this.lastAction = 'OFFLINE';
    this.ring.visible = false;
    for (const m of Object.values(this.materials)) {
      if (m.emissive) { m.emissive.setHex(0); m.emissiveIntensity = 0; }
      m.color.multiplyScalar(.3);
      m.roughness = Math.min(1, m.roughness + .3);
    }
    for (const w of this.weapons) w?.object.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.multiplyScalar(.3); if (n.material.emissive) n.material.emissive.setHex(0); } });
  }

  dispose() {
    this.scene.remove(this.root);
  }

  bearingTo(p) { return Math.atan2(p.x - this.position.x, p.z - this.position.z); }
  distanceTo(p) { return Math.hypot(p.x - this.position.x, p.z - this.position.z); }
  turretErrorTo(p) { return angleDelta(this.aimHeading(), this.bearingTo(p)); }
}

export { angleDelta };
