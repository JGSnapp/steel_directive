import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
// Global damage scale: keeps fights long enough (~1-2 min) for plans to matter.
const DAMAGE_SCALE = .6;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

const boltGeometry = new THREE.BoxGeometry(.14, .14, 1);
const rocketGeometry = new THREE.CylinderGeometry(.12, .16, .9, 6).rotateX(Math.PI / 2);
const shellGeometry = new THREE.SphereGeometry(.3, 8, 6);
const markerGeometry = new THREE.RingGeometry(.9, 1, 40).rotateX(-Math.PI / 2);

export class Combat {
  constructor(match) {
    this.match = match;
    this.scene = match.world.scene;
    this.fx = match.fx;
    this.projectiles = [];
    this.charges = [];
    this.materials = {};
  }

  mat(hex) {
    return (this.materials[hex] ||= new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
  }

  enemiesOf(me) { return this.match.units.filter(u => u.team !== me.team && u.alive); }

  fire(me, w, target, point) {
    const def = w.def;
    w.cooldown = def.rate * rand(.95, 1.08);
    if (Number.isFinite(w.ammo)) w.ammo--;
    me.heat += def.heat;
    if (me.heat >= 100) { me.heat = 100; me.overheated = true; this.match.say(me, 'heat', {}, 'heat'); }
    w.recoil = def.kind === 'beam' ? .15 : def.kind === 'rail' ? 0 : 1;
    const origin = w.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(me.aimHeading()), 0, Math.cos(me.aimHeading()));
    const aimAt = target ? target.centerMass(new THREE.Vector3()) : origin.clone().addScaledVector(dir, def.range);
    if (target && def.speed) {
      const t = me.distanceTo(target.position) / def.speed;
      aimAt.x += target.velocity.x * t * .85;
      aimAt.z += target.velocity.z * t * .85;
    }
    switch (def.kind) {
      case 'projectile': this.spawnBolt(me, def, origin, aimAt, def.spread, 1); this.fx.muzzle(origin, dir, def.color, def.id === 'rotary' ? .6 : 1); break;
      case 'pellets': for (let i = 0; i < def.pellets; i++) this.spawnBolt(me, def, origin, aimAt, def.spread, .6); this.fx.muzzle(origin, dir, def.color, 1.6); this.match.world.impact(.15); break;
      case 'rail': this.charges.push({ me, w, target, t: def.charge, origin }); w.charging = def.charge; w.recoil = 0; break;
      case 'beam': this.beam(me, w, target, origin); break;
      case 'arc': this.arc(me, def, target, origin); break;
      case 'missile': for (let i = 0; i < def.salvo; i++) setTimeout(() => me.alive && this.spawnMissile(me, def, w, target), i * 130); break;
      case 'mortar': this.spawnShell(me, def, origin, point); this.fx.muzzle(origin, UP, def.color, 1.3); break;
    }
    if (me.team === 'blue' || this.match.cameraUnit === me) this.match.audio?.shot(def.kind);
  }

  spawnBolt(me, def, origin, aimAt, spread, scale) {
    const d = me.distanceTo(aimAt);
    const dir = aimAt.clone().sub(origin).normalize();
    const moving = me.velocity.lengthSq() > .5 ? 1.6 : 1;
    dir.x += rand(-1, 1) * spread * moving; dir.y += rand(-.5, .5) * spread * moving; dir.z += rand(-1, 1) * spread * moving;
    dir.normalize();
    const mesh = new THREE.Mesh(boltGeometry, this.mat(def.color));
    mesh.scale.set(scale, scale, 2.6 * scale);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);
    this.projectiles.push({ type: 'bolt', mesh, owner: me, def, vel: dir.multiplyScalar(def.speed), life: Math.min(1.6, (d + 20) / def.speed), damage: def.damage });
  }

  // Unguided rockets: fired at the target's predicted position on a flat arc,
  // splash on impact. A target that changes course simply isn't there.
  spawnMissile(me, def, w, target) {
    const origin = w.muzzle.getWorldPosition(new THREE.Vector3());
    origin.x += rand(-.4, .4); origin.y += rand(-.2, .2);
    const mesh = new THREE.Mesh(rocketGeometry, new THREE.MeshStandardMaterial({ color: 0xdedede, emissive: 0xff7a3b, emissiveIntensity: .6 }));
    mesh.position.copy(origin);
    this.scene.add(mesh);
    let aim;
    if (target) {
      const t = me.distanceTo(target.position) / def.speed;
      aim = new THREE.Vector3(target.position.x + target.velocity.x * t, 1.5, target.position.z + target.velocity.z * t);
    } else {
      aim = origin.clone().add(new THREE.Vector3(Math.sin(me.aimHeading()) * def.range, 0, Math.cos(me.aimHeading()) * def.range)).setY(1.5);
    }
    aim.x += rand(-1, 1) * def.spread; aim.z += rand(-1, 1) * def.spread;
    const dist = origin.distanceTo(aim);
    this.projectiles.push({ type: 'rocket', mesh, owner: me, def, from: origin.clone(), to: aim, flight: dist / def.speed, arc: Math.min(6, dist * .12), age: 0, damage: def.damage });
    this.fx.muzzle(origin, UP, 0xff7a3b, .8);
  }

  spawnShell(me, def, origin, point) {
    const tx = point.x + rand(-1, 1) * def.spread, tz = point.z + rand(-1, 1) * def.spread;
    const flight = 1.3 + me.distanceTo({ x: tx, z: tz }) / 38;
    const mesh = new THREE.Mesh(shellGeometry, this.mat(0xffc36a));
    mesh.position.copy(origin);
    this.scene.add(mesh);
    // Warning marker for everybody (fair telegraph, and it looks great).
    const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    marker.scale.setScalar(def.radius);
    marker.position.set(tx, .12, tz);
    this.scene.add(marker);
    this.projectiles.push({ type: 'shell', mesh, marker, owner: me, def, from: origin.clone(), to: new THREE.Vector3(tx, 0, tz), flight, age: 0, damage: def.damage });
  }

  beam(me, w, target, origin) {
    const def = w.def;
    const end = target ? target.centerMass(new THREE.Vector3()) : origin.clone().add(new THREE.Vector3(Math.sin(me.aimHeading()) * def.range, 0, Math.cos(me.aimHeading()) * def.range));
    const blocked = !this.match.arena.lineOfSight(origin, end, 1);
    if (!blocked && target) {
      this.damage(target, def.damage, me, end, def.dtype);
      if (Math.random() < .5) this.fx.sparks(end, def.color, 4, .6);
    }
    this.fx.beam(origin, end, def.color, .12, .13);
    this.fx.glow.spawn(origin.x, origin.y, origin.z, 0, 0, 0, .1, 1.2, 1.8, 1, .4, .9, .9);
    this.match.world.pulseLight(origin, def.color, 25, .1, 10);
  }

  arc(me, def, target, origin) {
    if (!target) return;
    const p = target.centerMass(new THREE.Vector3());
    this.fx.arc(origin, p, def.color);
    this.damage(target, def.damage, me, p, def.dtype);
    target.stun = Math.max(target.stun, def.stun);
    this.match.say(target, 'stun', { e: me.name }, 'stun');
    const next = this.enemiesOf(me).filter(e => e !== target && e.distanceTo(target.position) < def.chain)[0];
    if (next) {
      const q = next.centerMass(new THREE.Vector3());
      setTimeout(() => { this.fx.arc(p, q, def.color); this.damage(next, def.damage * .6, me, q, def.dtype); next.stun = Math.max(next.stun, def.stun * .6); }, 90);
    }
    this.match.world.impact(.2);
  }

  updateCharges(dt) {
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      c.t -= dt;
      const origin = c.w.muzzle.getWorldPosition(_a);
      const dir = _b.set(Math.sin(c.me.aimHeading()), 0, Math.cos(c.me.aimHeading()));
      if (!c.me.alive || c.me.stun > 0) { c.w.charging = 0; this.charges.splice(i, 1); continue; }
      // Red laser sight: the telegraph the enemy can react to.
      const sightEnd = c.target?.alive ? c.target.centerMass(_c) : origin.clone().addScaledVector(dir, c.w.def.range);
      this.fx.beam(origin, sightEnd, 0xff2020, .025, .03, false);
      this.fx.glow.spawn(origin.x, origin.y, origin.z, 0, 0, 0, .05, .6 + (1 - c.t / c.w.def.charge) * 1.5, .6, 1, .3, .3, 1);
      if (c.t > 0) continue;
      c.w.charging = 0;
      this.charges.splice(i, 1);
      const def = c.w.def;
      let end = origin.clone().addScaledVector(dir, def.range);
      let hit = null;
      const t = c.target;
      if (t?.alive) {
        const err = Math.abs(c.me.turretErrorTo(t.position));
        const d = c.me.distanceTo(t.position);
        const p = t.centerMass(new THREE.Vector3());
        if (err < Math.atan2(t.radius, d) + .02 && this.match.arena.lineOfSight(origin, p, 1)) { hit = t; end = p; }
      }
      if (!hit) {
        // Trace to the first obstacle along the aim line.
        for (let s = 2; s < def.range; s += 1) {
          const q = origin.clone().addScaledVector(dir, s);
          if (this.match.arena.obstacleAt(q.x, q.y, q.z)) { end = q; this.fx.sparks(q, def.color, 16, 1); break; }
        }
      }
      this.fx.beam(origin, end, def.color, .2, .45);
      this.fx.muzzle(origin, dir, def.color, 1.8);
      this.match.world.impact(.35);
      if (hit) { this.damage(hit, def.damage, c.me, end, def.dtype); this.fx.explosion(end, .35, def.color); }
      this.match.audio?.shot('rail');
    }
  }

  update(dt) {
    this.updateCharges(dt);
    const arena = this.match.arena;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      let done = false;
      if (p.type === 'rocket') {
        p.age += dt;
        const t = Math.min(1, p.age / p.flight);
        const prevPos = _b.copy(p.mesh.position);
        p.mesh.position.lerpVectors(p.from, p.to, t);
        p.mesh.position.y += Math.sin(t * Math.PI) * p.arc;
        p.mesh.lookAt(_c.copy(p.mesh.position).multiplyScalar(2).sub(prevPos));
        this.fx.missileTrail(p.mesh.position);
        const pos = p.mesh.position;
        const direct = this.match.units.find(u => u.alive && u.team !== p.owner.team && Math.hypot(pos.x - u.position.x, pos.z - u.position.z) < u.radius && pos.y < u.chassis.height * u.scale);
        if (t >= 1 || direct || arena.obstacleAt(pos.x, pos.y, pos.z)) {
          this.blast(pos.clone(), p.def, p.owner, .5);
          done = true;
        }
      } else if (p.type === 'shell') {
        p.age += dt;
        const t = Math.min(1, p.age / p.flight);
        p.mesh.position.lerpVectors(p.from, p.to, t);
        p.mesh.position.y = THREE.MathUtils.lerp(p.from.y, 0, t) + Math.sin(t * Math.PI) * (12 + p.flight * 6);
        p.marker.material.opacity = .4 + Math.sin(p.age * 18) * .35;
        if (Math.random() < .6) this.fx.missileTrail(p.mesh.position);
        if (t >= 1) { this.blast(p.to, p.def, p.owner); this.scene.remove(p.marker); p.marker.material.dispose(); done = true; }
      } else {
        p.life -= dt;
        const prev = _b.copy(p.mesh.position);
        p.mesh.position.addScaledVector(p.vel, dt);
        const pos = p.mesh.position;
        const hitUnit = this.match.units.find(u => u.team !== p.owner.team && (u.alive || u.deathTime < 3) && Math.hypot(pos.x - u.position.x, pos.z - u.position.z) < u.radius + .25 && pos.y < u.chassis.height * u.scale && pos.y > .3);
        if (hitUnit) {
          if (hitUnit.alive) this.damage(hitUnit, p.damage, p.owner, pos.clone(), p.def.dtype);
          this.fx.sparks(pos, p.def.color, 6, .7);
          done = true;
        } else if (pos.y <= .1 || arena.obstacleAt(pos.x, pos.y, pos.z) || !arena.inBounds(pos.x, pos.z)) {
          this.fx.sparks(prev, 0xffd09a, 5, .5); this.fx.puff(prev, 1, .45, .8, .7, .5);
          done = true;
        } else if (p.life <= 0) done = true;
      }
      if (done) {
        this.scene.remove(p.mesh);
        if (p.type === 'rocket') p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  blast(pos, def, owner, scale = .85) {
    this.fx.explosion(pos.clone().setY(Math.max(1, pos.y)), scale, 0xffa040);
    for (const u of this.match.units) {
      if (!u.alive || u.team === owner.team) continue;
      const d = u.distanceTo(pos);
      if (d < def.radius + u.radius) this.damage(u, def.damage * (1 - d / (def.radius + u.radius) * .6), owner, u.centerMass(new THREE.Vector3()), def.dtype);
    }
  }

  damage(u, amount, attacker, at, dtype = 'kinetic') {
    if (!u.alive) return;
    amount *= DAMAGE_SCALE * (u.chassis.armor?.[dtype] ?? 1);
    u.hp = Math.max(0, u.hp - amount);
    u.damageTaken += amount;
    u.lastHitAt = this.match.time;
    u.lastAttacker = attacker;
    // Being hit reveals roughly where the shot came from.
    u.known = u.known || {};
    const k = u.known[attacker.id];
    if (!k || this.match.time - k.at > .5) u.known[attacker.id] = { id: attacker.id, name: attacker.name, x: attacker.position.x + (Math.random() - .5) * 6, z: attacker.position.z + (Math.random() - .5) * 6, hp: attacker.hp / attacker.maxHp, at: this.match.time, action: 'SHOOTING', fromHit: true };
    attacker.damageDealt = (attacker.damageDealt || 0) + amount;
    if (at && Math.random() < .35) this.fx.sparks(at, 0xffc070, 5, .6);
    this.match.onDamage?.(u, amount, attacker);
    if (u.hp <= 0) this.kill(u, attacker);
  }

  kill(u, attacker) {
    u.powerDown();
    attacker.kills++;
    const p = u.centerMass(new THREE.Vector3());
    this.fx.explosion(p, 1.6, 0xff8a3a);
    setTimeout(() => this.fx.explosion(p.clone().add(new THREE.Vector3(rand(-2, 2), 1, rand(-2, 2))), 1, 0xffc060), 220);
    setTimeout(() => this.fx.explosion(p.clone().setY(2), .8), 520);
    this.fx.debrisBurst(p, 14, u.materials.paint_primary);
    this.match.world.flash = .35;
    this.match.onKill?.(u, attacker);
  }

  clear() {
    for (const p of this.projectiles) { this.scene.remove(p.mesh); if (p.marker) this.scene.remove(p.marker); }
    this.projectiles = [];
    this.charges = [];
  }
}
