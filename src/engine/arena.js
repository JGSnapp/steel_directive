import * as THREE from 'three';
import { instantiateProp } from './assets.js';

const PROP_PALETTES = {
  foundry: { wall: [0x3b3530, 0xc9822e, 0x23201d, 0xff8a3a], container: [[0x7a2a1c, 0x2a1a14], [0x2f4a3a, 0x1c2a22], [0x8a6a2a, 0x3a2a14], [0x30363c, 0x1a1e22]], silo: [0x5a5048, 0xc9822e, 0x2a2420, 0xff9a40], crate: [0x5e4a32, 0x2c2218, 0x3a2e22, 0xffa040], barrier: [0x6a6258, 0xd09a2a, 0x2a2420, 0xff9a40], rock: [0x3a2e28, 0x2a2420, 0x2a2420, 0xff8a3a] },
  whiteout: { wall: [0xd8dee4, 0x2a3a6a, 0x6a7a8a, 0x49a6ff], container: [[0xe4e8ec, 0x1b2446], [0x9aa6b4, 0x1b2446]], pylon: [0xe8edf2, 0x1b2446, 0x9aa7b8, 0x49a6ff], crate: [0xb0b8c0, 0x2a3a6a, 0x6a7a8a, 0x49a6ff], barrier: [0xdfe4ea, 0x2a3a6a, 0x6a7a8a, 0x49a6ff], rock: [0x6a7480, 0x5a6470, 0x4a5460, 0x49a6ff] },
  neon: { wall: [0x1c1a24, 0xd4148c, 0x2a2834, 0xff3ad6], container: [[0x2a1838, 0x120a1a], [0x14304a, 0x0a1622], [0x3a1424, 0x1a0a12], [0x262230, 0x121018]], crate: [0x2a2430, 0xd4148c, 0x1a1620, 0x2ee6ff], barrier: [0x2a2834, 0x2ee6ff, 0x1a1820, 0x2ee6ff], rock: [0x24202a, 0x1a1620, 0x1a1620, 0xff3ad6] },
  citadel: { wall: [0xcab89a, 0x8e1420, 0xc9a24a, 0xffc15e], rook: [0xd8c8a8, 0x8e1420, 0xc9a24a, 0xffc15e], crate: [0x6a4a2a, 0x8e1420, 0xc9a24a, 0xffc15e], barrier: [0xcab89a, 0x8e1420, 0xc9a24a, 0xffc15e], rock: [0x8a7a6a, 0x6a5a4a, 0x6a5a4a, 0xffc15e] },
};

export class Arena {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.half = map.size / 2;
    this.group = new THREE.Group();
    this.obstacles = map.obstacles.map(o => ({ ...o, cos: Math.cos(o.r), sin: Math.sin(o.r) }));
    this.animated = [];
    this.buildFloor();
    this.buildObstacles();
    this.buildBoundary();
    this.buildDecor();
    this.buildAccents();
    scene.add(this.group);
    this.nav = new NavGrid(this, 1.5, 2.9);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(n => { n.geometry?.dispose(); if (n.material) [].concat(n.material).forEach(m => { m.map?.dispose(); m.dispose(); }); });
  }

  // ------------------------------------------------------------ visuals
  buildFloor() {
    const { floor } = this.map;
    const tex = floorTexture(floor);
    tex.map.wrapS = tex.map.wrapT = THREE.RepeatWrapping;
    tex.rough.wrapS = tex.rough.wrapT = THREE.RepeatWrapping;
    const repeat = floor === 'checker' ? 240 / 32 : 240 / 24;
    tex.map.repeat.set(repeat, repeat);
    tex.rough.repeat.set(repeat, repeat);
    tex.map.colorSpace = THREE.SRGBColorSpace;
    tex.map.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, roughnessMap: tex.rough, roughness: 1, metalness: floor === 'wet' ? .35 : floor === 'foundry' ? .4 : .05, envMapIntensity: floor === 'wet' ? 2.2 : 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    // Arena outline: glowing lane markings help read the playable area.
    const lineMat = new THREE.MeshBasicMaterial({ color: this.map.accents[0][0], transparent: true, opacity: .55 });
    for (const [w, d, x, z] of [[this.map.size, .3, 0, this.half], [this.map.size, .3, 0, -this.half], [.3, this.map.size, this.half, 0], [.3, this.map.size, -this.half, 0]]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, .04, z);
      this.group.add(line);
    }
  }

  buildObstacles() {
    const pal = PROP_PALETTES[this.map.id];
    let ci = 0;
    for (const o of this.obstacles) {
      const g = new THREE.Group();
      g.position.set(o.x, 0, o.z);
      g.rotation.y = o.r;
      if (o.t === 'container') {
        const levels = Math.max(1, Math.round(o.h / 5.2));
        const lh = o.h / levels;
        const long = o.w >= o.d;
        for (let i = 0; i < levels; i++) {
          const colors = pal.container[(ci++) % pal.container.length];
          const c = instantiateProp('container', [colors[0], colors[1], 0x222222, 0xffffff], { roughness: .6 });
          c.scale.set(long ? o.w : o.d, lh, long ? o.d : o.w);
          if (!long) c.rotation.y = Math.PI / 2;
          c.position.y = i * lh;
          c.rotation.y += (Math.random() - .5) * .04;
          g.add(c);
        }
      } else {
        const p = instantiateProp(o.t, pal[o.t] || pal.wall);
        const footprint = o.t === 'silo' || o.t === 'rook' ? Math.min(o.w, o.d) : null;
        p.scale.set(footprint || o.w, o.h, footprint || o.d);
        if (o.t === 'rock') p.scale.set(o.w * 1.15, o.h * 1.1, o.d * 1.15);
        if (o.t === 'pylon') p.scale.set(o.w * 1.6, o.h, o.d * 1.6);
        g.add(p);
      }
      g.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; } });
      this.group.add(g);
    }
  }

  buildBoundary() {
    const pal = PROP_PALETTES[this.map.id].wall;
    const wallMat = new THREE.MeshStandardMaterial({ color: pal[0], roughness: .8, metalness: .3 });
    const stripMat = new THREE.MeshStandardMaterial({ color: pal[3], emissive: pal[3], emissiveIntensity: 2.5 });
    const h = this.half + 3;
    for (let side = 0; side < 4; side++) {
      for (let i = -5; i <= 5; i++) {
        const seg = new THREE.Group();
        const wall = new THREE.Mesh(new THREE.BoxGeometry(11.4, 3.2 + (i % 2 ? .6 : 0), 1.6), wallMat);
        wall.position.y = 1.6;
        wall.castShadow = wall.receiveShadow = true;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(10, .18, .1), stripMat);
        strip.position.set(0, 2.5, -.82);
        seg.add(wall, strip);
        const a = side * Math.PI / 2;
        seg.position.set(Math.sin(a) * h + Math.cos(a) * i * 12, 0, Math.cos(a) * h - Math.sin(a) * i * 12);
        seg.rotation.y = a;
        this.group.add(seg);
      }
    }
    // Distant silhouettes give the arena a sense of place without collision.
    const sil = new THREE.MeshStandardMaterial({ color: pal[0], roughness: 1, metalness: 0 });
    const winMat = new THREE.MeshBasicMaterial({ color: pal[3] });
    const rng = mulberry(this.map.id.length * 977);
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2 + rng() * .05, r = 95 + rng() * 60;
      const hgt = this.map.id === 'whiteout' ? 6 + rng() * 14 : 12 + rng() * 46;
      const w = 6 + rng() * 14;
      const b = new THREE.Mesh(this.map.id === 'whiteout' ? new THREE.ConeGeometry(w, hgt, 5) : new THREE.BoxGeometry(w, hgt, w * (.6 + rng() * .6)), sil);
      b.position.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r);
      b.rotation.y = rng() * 3;
      this.group.add(b);
      if (this.map.id !== 'whiteout' && rng() < .7) {
        for (let k = 0; k < 4; k++) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(.8 + rng() * 2, .4), winMat);
          win.position.set(b.position.x * .985, 4 + rng() * (hgt - 6), b.position.z * .985);
          win.lookAt(0, win.position.y, 0);
          this.group.add(win);
        }
      }
    }
  }

  buildDecor() {
    for (const d of this.map.decor) {
      if (d.t === 'slag') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a0a00, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: .6, map: lavaTexture(), emissiveMap: lavaTexture() });
        const pool = new THREE.Mesh(new THREE.CircleGeometry(d.s, 40), mat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(d.x, .06, d.z);
        this.group.add(pool);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(d.s, .35, 6, 40), new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: .9 }));
        rim.rotation.x = -Math.PI / 2;
        rim.position.set(d.x, .1, d.z);
        this.group.add(rim);
        this.animated.push((t) => { mat.emissiveIntensity = 2 + Math.sin(t * 1.7 + d.x) * .5; mat.emissiveMap.offset.set(t * .01, t * .007); });
      } else if (d.t === 'drift') {
        const drift = new THREE.Mesh(new THREE.SphereGeometry(d.s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: .95 }));
        drift.scale.y = .18;
        drift.position.set(d.x, -.1, d.z);
        drift.receiveShadow = true;
        this.group.add(drift);
      } else if (d.t === 'neon') {
        const sign = neonSign(d.c, d.c === 0xff3ad6 ? 'BLACK SPARK' : 'VOLT // 24H');
        sign.position.set(d.x, 6.5, d.z);
        sign.rotation.y = d.r || (d.x < 0 ? Math.PI / 2 : -Math.PI / 2);
        this.group.add(sign);
        this.animated.push((t) => { sign.children[0].material.emissiveIntensity = 3 + (Math.sin(t * 23 + d.x) > .96 ? -2.5 : 0); });
      } else if (d.t === 'banner') {
        const banner = makeBanner();
        banner.position.set(d.x, 0, d.z);
        this.group.add(banner);
        this.animated.push((t) => { banner.children[1].rotation.y = Math.sin(t * 1.4 + d.x) * .12; });
      }
    }
  }

  buildAccents() {
    for (const [color, [x, y, z]] of this.map.accents) {
      const l = new THREE.PointLight(color, 55, 42, 1.6);
      l.position.set(x, y, z);
      this.group.add(l);
    }
  }

  update(t) { for (const fn of this.animated) fn(t); }

  // ------------------------------------------------------------ queries
  local(x, z, o) {
    const dx = x - o.x, dz = z - o.z;
    return { x: o.cos * dx - o.sin * dz, z: o.sin * dx + o.cos * dz };
  }

  inBounds(x, z, r = 0) { return Math.abs(x) + r < this.half && Math.abs(z) + r < this.half; }

  blocked(x, z, r = 0) {
    if (!this.inBounds(x, z, r)) return true;
    for (const o of this.obstacles) {
      const p = this.local(x, z, o);
      if (Math.abs(p.x) < o.w / 2 + r && Math.abs(p.z) < o.d / 2 + r) return true;
    }
    return false;
  }

  obstacleAt(x, y, z) {
    for (const o of this.obstacles) {
      if (y > o.h) continue;
      const p = this.local(x, z, o);
      if (Math.abs(p.x) < o.w / 2 && Math.abs(p.z) < o.d / 2) return o;
    }
    return null;
  }

  segmentHits(a, b, o, pad = 0) {
    const p = this.local(a.x, a.z, o), q = this.local(b.x, b.z, o);
    const dx = q.x - p.x, dz = q.z - p.z;
    let lo = 0, hi = 1;
    for (const [s, d, min, max] of [[p.x, dx, -o.w / 2 - pad, o.w / 2 + pad], [p.z, dz, -o.d / 2 - pad, o.d / 2 + pad]]) {
      if (Math.abs(d) < 1e-6) { if (s < min || s > max) return false; continue; }
      let t1 = (min - s) / d, t2 = (max - s) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1); hi = Math.min(hi, t2);
      if (lo > hi) return false;
    }
    return true;
  }

  // Line of sight is blocked only by obstacles taller than sensor height.
  lineOfSight(a, b, minHeight = 4.5) {
    for (const o of this.obstacles) if (o.h >= minHeight && this.segmentHits(a, b, o, .05)) return false;
    return true;
  }
}

// ------------------------------------------------------------ navigation grid
class NavGrid {
  constructor(arena, cell, radius) {
    this.arena = arena;
    this.cell = cell;
    this.n = Math.ceil(arena.map.size / cell);
    this.free = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const { x, z } = this.center(i, j);
      this.free[j * this.n + i] = arena.blocked(x, z, radius) ? 0 : 1;
    }
  }

  center(i, j) { return { x: -this.arena.half + (i + .5) * this.cell, z: -this.arena.half + (j + .5) * this.cell }; }
  cellOf(x, z) { return [Math.floor((x + this.arena.half) / this.cell), Math.floor((z + this.arena.half) / this.cell)]; }
  ok(i, j) { return i >= 0 && j >= 0 && i < this.n && j < this.n && this.free[j * this.n + i] === 1; }

  nearestFree(x, z) {
    const [ci, cj] = this.cellOf(x, z);
    for (let r = 0; r < 12; r++) {
      let best = null, bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (!this.ok(i, j)) continue;
        const c = this.center(i, j), d = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return best;
    }
    return [ci, cj];
  }

  walkable(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / (this.cell * .5));
    for (let s = 0; s <= steps; s++) {
      const t = s / Math.max(1, steps);
      const [i, j] = this.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.ok(i, j)) return false;
    }
    return true;
  }

  // A* with octile moves, then string-pulled into a short list of waypoints.
  path(from, to) {
    const n = this.n;
    const [si, sj] = this.nearestFree(from.x, from.z), [gi, gj] = this.nearestFree(to.x, to.z);
    const start = sj * n + si, goal = gj * n + gi;
    if (start === goal) return [this.center(gi, gj)];
    const g = new Float32Array(n * n).fill(Infinity), came = new Int32Array(n * n).fill(-1), closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
    g[start] = 0;
    heap.push(start, h(si, sj));
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % n, cj = (cur / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this.ok(ni, nj) || (di && dj && (!this.ok(ci + di, cj) || !this.ok(ci, cj + dj)))) continue;
        const k = nj * n + ni, cost = g[cur] + (di && dj ? 1.414 : 1);
        if (cost < g[k]) { g[k] = cost; came[k] = cur; heap.push(k, cost + h(ni, nj)); }
      }
    }
    if (!found) return [to];
    const cells = [];
    for (let k = goal; k !== -1; k = came[k]) cells.push(this.center(k % n, (k / n) | 0));
    cells.reverse();
    const out = [];
    let anchor = { x: from.x, z: from.z };
    for (let i = 1; i < cells.length; i++) {
      if (!this.walkable(anchor, cells[i])) { out.push(cells[i - 1]); anchor = cells[i - 1]; }
    }
    out.push(cells[cells.length - 1]);
    // A start inside the inflated margin snaps to the nearest free cell; drop
    // waypoints that sit on top of the mech so it always gets a direction.
    while (out.length > 1 && Math.hypot(out[0].x - from.x, out[0].z - from.z) < 1.5) out.shift();
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    this.k.push(k); this.p.push(p);
    let i = this.k.length - 1;
    while (i > 0) { const up = (i - 1) >> 1; if (this.p[up] <= p) break; this.swap(i, up); i = up; }
  }
  pop() {
    const top = this.k[0], lk = this.k.pop(), lp = this.p.pop();
    if (this.k.length) {
      this.k[0] = lk; this.p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.p[l] < this.p[m]) m = l;
        if (r < this.k.length && this.p[r] < this.p[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  swap(a, b) { [this.k[a], this.k[b]] = [this.k[b], this.k[a]]; [this.p[a], this.p[b]] = [this.p[b], this.p[a]]; }
}

// ------------------------------------------------------------ procedural textures
function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function floorTexture(kind) {
  const S = 1024;
  const c = document.createElement('canvas'), r = document.createElement('canvas');
  c.width = c.height = r.width = r.height = S;
  const g = c.getContext('2d'), gr = r.getContext('2d');
  const rng = mulberry(kind.length * 131);
  const noise = (ctx, n, alpha, colors, size = 3) => { for (let i = 0; i < n; i++) { ctx.fillStyle = colors[(rng() * colors.length) | 0]; ctx.globalAlpha = rng() * alpha; const s = rng() * size + 1; ctx.fillRect(rng() * S, rng() * S, s, s); } ctx.globalAlpha = 1; };
  const blotches = (ctx, n, color, alpha, min, max) => { for (let i = 0; i < n; i++) { const x = rng() * S, y = rng() * S, rad = min + rng() * (max - min); const gd = ctx.createRadialGradient(x, y, 0, x, y, rad); gd.addColorStop(0, color.replace('A', alpha)); gd.addColorStop(1, color.replace('A', 0)); ctx.fillStyle = gd; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); } };
  if (kind === 'foundry') {
    g.fillStyle = '#2a2622'; g.fillRect(0, 0, S, S);
    gr.fillStyle = '#b0b0b0'; gr.fillRect(0, 0, S, S);
    const tile = S / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 34 + rng() * 14;
      g.fillStyle = `rgb(${v + 6},${v},${v - 6})`;
      g.fillRect(x * tile + 3, y * tile + 3, tile - 6, tile - 6);
      g.fillStyle = '#16130f';
      for (const [px, py] of [[14, 14], [tile - 14, 14], [14, tile - 14], [tile - 14, tile - 14]]) { g.beginPath(); g.arc(x * tile + px, y * tile + py, 4, 0, 7); g.fill(); }
      // diamond tread
      g.strokeStyle = 'rgba(255,255,255,.035)';
      for (let k = 0; k < tile; k += 18) { g.beginPath(); g.moveTo(x * tile + k, y * tile); g.lineTo(x * tile, y * tile + k); g.stroke(); }
    }
    blotches(g, 30, 'rgba(10,6,4,A)', .5, 30, 140);
    blotches(gr, 30, 'rgba(60,60,60,A)', .6, 30, 120);
    noise(g, 9000, .25, ['#000', '#5a4a3a', '#8a5a2a']);
  } else if (kind === 'snow') {
    g.fillStyle = '#c9d3dc'; g.fillRect(0, 0, S, S);
    blotches(g, 70, 'rgba(160,180,200,A)', .3, 40, 200);
    blotches(g, 40, 'rgba(255,255,255,A)', .6, 30, 160);
    noise(g, 16000, .25, ['#c8d4de', '#ffffff', '#aebccb']);
    gr.fillStyle = '#e0e0e0'; gr.fillRect(0, 0, S, S);
    blotches(gr, 30, 'rgba(120,120,120,A)', .7, 20, 80);
  } else if (kind === 'wet') {
    g.fillStyle = '#16141b'; g.fillRect(0, 0, S, S);
    noise(g, 30000, .35, ['#2a2632', '#0c0b10', '#3a3444'], 2);
    g.strokeStyle = 'rgba(255,200,40,.5)'; g.lineWidth = 6; g.setLineDash([40, 30]);
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke(); g.setLineDash([]);
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3;
    for (let i = 0; i < 14; i++) { g.beginPath(); let x = rng() * S, y = rng() * S; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rng() - .5) * 90; y += (rng() - .5) * 90; g.lineTo(x, y); } g.stroke(); }
    gr.fillStyle = '#9a9a9a'; gr.fillRect(0, 0, S, S);
    blotches(gr, 45, 'rgba(0,0,0,A)', .95, 40, 160);   // puddles = mirror-smooth
    blotches(g, 45, 'rgba(5,4,8,A)', .5, 40, 160);
  } else if (kind === 'checker') {
    const n = 4, t = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#d9cbb0' : '#4a1a1c';
      g.fillRect(x * t, y * t, t, t);
      for (let k = 0; k < 6; k++) { g.strokeStyle = (x + y) % 2 ? 'rgba(120,100,80,.18)' : 'rgba(255,220,200,.08)'; g.lineWidth = 1 + rng() * 2; g.beginPath(); g.moveTo(x * t + rng() * t, y * t); g.bezierCurveTo(x * t + rng() * t, y * t + t * .3, x * t + rng() * t, y * t + t * .6, x * t + rng() * t, y * t + t); g.stroke(); }
    }
    g.strokeStyle = '#c9a24a'; g.lineWidth = 4;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, S); g.stroke(); g.beginPath(); g.moveTo(0, i * t); g.lineTo(S, i * t); g.stroke(); }
    noise(g, 8000, .18, ['#000', '#fff']);
    gr.fillStyle = '#5a5a5a'; gr.fillRect(0, 0, S, S);
    blotches(gr, 20, 'rgba(160,160,160,A)', .6, 40, 140);
  }
  return { map: new THREE.CanvasTexture(c), rough: new THREE.CanvasTexture(r) };
}

let lava;
function lavaTexture() {
  if (lava) return lava;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5a10'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 26;
    const gd = g.createRadialGradient(x, y, 0, x, y, r);
    gd.addColorStop(0, Math.random() < .5 ? 'rgba(255,220,120,.9)' : 'rgba(40,8,0,.9)');
    gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  lava = new THREE.CanvasTexture(c);
  lava.wrapS = lava.wrapT = THREE.RepeatWrapping;
  lava.colorSpace = THREE.SRGBColorSpace;
  return lava;
}

function neonSign(color, text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 256);
  g.font = 'bold 150px "Barlow Condensed", Arial Narrow, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeStyle = '#fff'; g.lineWidth = 10;
  g.strokeText(text, 512, 132);
  g.strokeRect(20, 20, 984, 216);
  const tex = new THREE.CanvasTexture(c);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: color, emissiveMap: tex, emissiveIntensity: 3, transparent: true, alphaMap: tex }));
  group.add(mesh);
  return group;
}

function makeBanner() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: .9, roughness: .3 }));
  pole.position.y = 5;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8e1420'; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 12; g.strokeRect(14, 14, 228, 484);
  g.fillStyle = '#c9a24a';
  g.fillRect(78, 150, 100, 170); g.fillRect(62, 320, 132, 30);
  for (let i = 0; i < 3; i++) g.fillRect(70 + i * 44, 118, 28, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2, 1, 6), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .85 }));
  cloth.position.set(1.4, 6.8, 0);
  cloth.castShadow = true;
  group.add(pole, cloth);
  return group;
}
