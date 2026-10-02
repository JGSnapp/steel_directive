import * as THREE from 'three';
import { softDot } from './world.js';

const rand = (a, b) => a + Math.random() * (b - a);

// CPU-simulated, GPU-drawn point particles. One pool is additive (fire,
// sparks, glows), the other alpha-blended (smoke, dust, snow puffs).
class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.data = new Float32Array(max * 16);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 600 } },
      vertexShader: `attribute float size;attribute vec4 color;varying vec4 vColor;uniform float scale;
        void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*scale/max(-mv.z,.1);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform sampler2D map;varying vec4 vColor;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vColor.rgb,vColor.a*t.a);}`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  // p: [x,y,z, vx,vy,vz, life, size0, size1, r,g,b, a0, drag, gravity]
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 0, grav = 0) {
    if (this.n >= this.max) return;
    this.data.set([x, y, z, vx, vy, vz, life, life, s0, s1, r, g, b, a, drag, grav], this.n * 16);
    this.n++;
  }

  update(dt) {
    const d = this.data;
    for (let i = 0; i < this.n; i++) {
      const k = i * 16;
      d[k + 6] -= dt;
      if (d[k + 6] <= 0) {
        this.n--;
        d.copyWithin(k, this.n * 16, this.n * 16 + 16);
        i--;
        continue;
      }
      const drag = Math.exp(-d[k + 14] * dt);
      d[k + 3] *= drag; d[k + 4] = d[k + 4] * drag - d[k + 15] * dt; d[k + 5] *= drag;
      d[k] += d[k + 3] * dt; d[k + 1] += d[k + 4] * dt; d[k + 2] += d[k + 5] * dt;
      if (d[k + 1] < .05 && d[k + 15] > 0) { d[k + 1] = .05; d[k + 4] *= -.35; d[k + 3] *= .6; d[k + 5] *= .6; }
      const t = 1 - d[k + 6] / d[k + 7];
      this.pos[i * 3] = d[k]; this.pos[i * 3 + 1] = d[k + 1]; this.pos[i * 3 + 2] = d[k + 2];
      this.col[i * 4] = d[k + 10]; this.col[i * 4 + 1] = d[k + 11]; this.col[i * 4 + 2] = d[k + 12];
      this.col[i * 4 + 3] = d[k + 13] * (1 - t) * Math.min(1, t * 12 + .2);
      this.size[i] = d[k + 8] + (d[k + 9] - d[k + 8]) * t;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.n);
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = true;
  }
}

const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2);
const ringGeometry = new THREE.RingGeometry(.85, 1, 48).rotateX(-Math.PI / 2);
const debrisGeometry = new THREE.BoxGeometry(.35, .2, .5);

export class FX {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.glow = new ParticlePool(this.scene, 6000, true);
    this.smoke = new ParticlePool(this.scene, 3500, false);
    this.transients = [];
    this.debris = [];
    this.scorches = [];
    this.scorchTexture = makeScorch();
    this.debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x22272a, metalness: .8, roughness: .5 });
  }

  resize(world) {
    const s = innerHeight * world.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2)));
    this.glow.material.uniforms.scale.value = this.smoke.material.uniforms.scale.value = s;
  }

  color(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }

  muzzle(pos, dir, hex, big = 1) {
    const [r, g, b] = this.color(hex);
    this.glow.spawn(pos.x, pos.y, pos.z, 0, 0, 0, .06, 1.6 * big, 2.4 * big, r, g, b, 1);
    for (let i = 0; i < 5 * big; i++) {
      const s = rand(8, 22);
      this.glow.spawn(pos.x, pos.y, pos.z, dir.x * s + rand(-2, 2), dir.y * s + rand(-2, 2), dir.z * s + rand(-2, 2), rand(.05, .12), .5 * big, .1, r, g * .9, b * .6, 1, 6);
    }
    this.smoke.spawn(pos.x, pos.y, pos.z, dir.x * 3, .8, dir.z * 3, rand(.5, .9), .5 * big, 2.2 * big, .45, .45, .45, .28, 2);
    this.world.pulseLight(pos, hex, 30 * big, .07, 12);
  }

  sparks(pos, hex = 0xffc070, n = 10, power = 1) {
    const [r, g, b] = this.color(hex);
    for (let i = 0; i < n; i++) {
      this.glow.spawn(pos.x, pos.y, pos.z, rand(-9, 9) * power, rand(2, 12) * power, rand(-9, 9) * power, rand(.2, .5), .32, .05, r, g, b, 1, 1.2, 22);
    }
    this.glow.spawn(pos.x, pos.y, pos.z, 0, 0, 0, .08, 1.4 * power, 2 * power, r, g, b, .9);
  }

  puff(pos, n = 3, shade = .35, size = 2, life = 1.6, rise = 1.4) {
    for (let i = 0; i < n; i++) {
      this.smoke.spawn(pos.x + rand(-.4, .4), pos.y + rand(-.3, .3), pos.z + rand(-.4, .4), rand(-.6, .6), rise * rand(.6, 1.2), rand(-.6, .6), life * rand(.7, 1.2), size * .5, size * 1.6, shade, shade, shade * 1.02, .42, .9);
    }
  }

  fire(pos, scale = 1) {
    this.glow.spawn(pos.x + rand(-.5, .5) * scale, pos.y, pos.z + rand(-.5, .5) * scale, rand(-.3, .3), rand(2, 4) * scale, rand(-.3, .3), rand(.35, .7), 1.4 * scale, .3, 1, rand(.35, .55), .12, .85, .5);
  }

  missileTrail(pos) {
    this.glow.spawn(pos.x, pos.y, pos.z, 0, 0, 0, .12, .9, .2, 1, .55, .2, 1);
    this.smoke.spawn(pos.x, pos.y, pos.z, rand(-.3, .3), rand(.1, .5), rand(-.3, .3), rand(.9, 1.4), .5, 2.2, .62, .6, .58, .38, 1.4);
  }

  explosion(pos, scale = 1, hex = 0xff8a3a) {
    const [r, g, b] = this.color(hex);
    this.glow.spawn(pos.x, pos.y, pos.z, 0, 0, 0, .18, 6 * scale, 12 * scale, 1, .95, .8, 1);
    for (let i = 0; i < 46 * scale; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 12) * scale);
      this.glow.spawn(pos.x, pos.y, pos.z, v.x, v.y, v.z, rand(.25, .7), rand(1.5, 3) * scale, .4, r, g * rand(.6, 1), b * .7, 1, 3.2, -1);
    }
    for (let i = 0; i < 30 * scale; i++) {
      this.glow.spawn(pos.x, pos.y, pos.z, rand(-22, 22) * scale, rand(4, 26) * scale, rand(-22, 22) * scale, rand(.4, 1.1), .35, .06, 1, .78, .4, 1, .6, 24);
    }
    for (let i = 0; i < 18 * scale; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.5, 5) * scale);
      this.smoke.spawn(pos.x, pos.y, pos.z, v.x, v.y + 1, v.z, rand(1.6, 3.2), 2.2 * scale, 7 * scale, .16, .15, .15, .62, 1.3, -.4);
    }
    this.ring(pos, hex, 9 * scale, .45);
    this.world.pulseLight(pos.clone().setY(pos.y + 2), hex, 160 * scale, .5, 34 * scale);
    this.world.impact(.7 * scale);
    this.world.flash = Math.max(this.world.flash, .08 * scale);
    if (scale > .6) this.scorch(pos, 4.5 * scale);
  }

  ring(pos, hex, radius, life = .4) {
    const m = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(pos.x, .25, pos.z);
    this.scene.add(m);
    this.transients.push({ mesh: m, life, max: life, update: (t) => { m.scale.setScalar(.5 + t * radius); m.material.opacity = .9 * (1 - t); } });
  }

  // A glowing cylinder between two points: railgun slugs, plasma, laser sights.
  beam(a, b, hex, width = .15, life = .2, core = true) {
    const group = new THREE.Group();
    const len = a.distanceTo(b);
    const outer = new THREE.Mesh(unitCylinder, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    outer.scale.set(width * 2.2, width * 2.2, len);
    group.add(outer);
    if (core) {
      const inner = new THREE.Mesh(unitCylinder, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
      inner.scale.set(width * .6, width * .6, len);
      group.add(inner);
    }
    group.position.copy(a).lerp(b, .5);
    group.lookAt(b);
    this.scene.add(group);
    this.transients.push({ mesh: group, life, max: life, update: (t) => { group.children.forEach(c => { c.material.opacity = (c === outer ? .55 : .95) * (1 - t); c.scale.x = c.scale.y = (c === outer ? width * 2.2 : width * .6) * (1 - t * .6); }); } });
    return group;
  }

  arc(a, b, hex) {
    const pts = [a.clone()];
    const segs = 7;
    for (let i = 1; i < segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      p.x += rand(-1, 1) * 1.1; p.y += rand(-1, 1) * 1.1; p.z += rand(-1, 1) * 1.1;
      pts.push(p);
    }
    pts.push(b.clone());
    for (let i = 0; i < pts.length - 1; i++) this.beam(pts[i], pts[i + 1], hex, .07, .16);
    this.sparks(b, hex, 14, .8);
    this.world.pulseLight(b, hex, 60, .2, 16);
  }

  scorch(pos, size) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(size, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.scorchTexture, transparent: true, depthWrite: false, opacity: .85, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(pos.x, .03, pos.z);
    m.rotation.y = Math.random() * 6;
    this.scene.add(m);
    this.scorches.push(m);
    if (this.scorches.length > 40) {
      const old = this.scorches.shift();
      this.scene.remove(old);
      old.material.dispose();
      old.geometry.dispose();
    }
  }

  debrisBurst(pos, n = 10, material) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(debrisGeometry, material || this.debrisMaterial);
      m.position.copy(pos);
      m.scale.setScalar(rand(.6, 1.8));
      m.castShadow = true;
      this.scene.add(m);
      this.debris.push({ mesh: m, v: new THREE.Vector3(rand(-9, 9), rand(6, 16), rand(-9, 9)), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: rand(4, 7), smoking: Math.random() < .5 });
    }
    while (this.debris.length > 80) this.scene.remove(this.debris.shift().mesh);
  }

  clear() {
    for (const t of this.transients) this.scene.remove(t.mesh);
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const s of this.scorches) this.scene.remove(s);
    this.transients = []; this.debris = []; this.scorches = [];
    this.glow.n = this.smoke.n = 0;
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const t = this.transients[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.traverse(o => o.material?.dispose());
        this.transients.splice(i, 1);
        continue;
      }
      t.update(1 - t.life / t.max);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.mesh.position.y > .15 || d.v.y > 0) {
        d.v.y -= 26 * dt;
        d.mesh.position.addScaledVector(d.v, dt);
        d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
        if (d.mesh.position.y < .15) { d.mesh.position.y = .15; d.v.multiplyScalar(.3); d.v.y = Math.abs(d.v.y) > 2 ? -d.v.y * .4 : 0; d.spin.multiplyScalar(.4); }
        if (d.smoking && Math.random() < .5) this.smoke.spawn(d.mesh.position.x, d.mesh.position.y, d.mesh.position.z, 0, .5, 0, .8, .3, 1.2, .2, .2, .2, .5);
      }
      if (d.life <= 0) { this.scene.remove(d.mesh); this.debris.splice(i, 1); }
    }
  }
}

function makeScorch() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(8,6,5,.95)');
  grad.addColorStop(.55, 'rgba(15,12,10,.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(0,0,0,${Math.random() * .4})`;
    g.lineWidth = Math.random() * 3;
    g.beginPath();
    const a = Math.random() * Math.PI * 2;
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(a) * rand(30, 62), 64 + Math.sin(a) * rand(30, 62));
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
