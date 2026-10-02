// In-engine cutscene: the Ring Incident, 2064. Built from the game's own
// mechs, FX and post-processing; ~38 s, skippable.
import * as THREE from 'three';
import { FX } from '../engine/fx.js';
import { Mech } from '../engine/mech.js';
import { L } from '../i18n.js';

const T = (ru, en, zh) => ({ ru, en, zh });
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const CAPTIONS = [
  [1, 6, T('Стадион «Кольцо», Меридиан. 14 октября 2064 года. Финал последнего пилотируемого сезона.', 'The Ring stadium, Meridian. October 14, 2064. Final of the last piloted season.', '子午城，“环形”体育场。2064 年 10 月 14 日。最后一个有人驾驶赛季的决赛。')],
  [6.5, 12, T('Шестьдесят две тысячи зрителей. Два пилота. Девяносто секунд до конца матча.', 'Sixty-two thousand spectators. Two pilots. Ninety seconds left on the clock.', '六万两千名观众。两名驾驶员。比赛还剩九十秒。')],
  [12.5, 15.5, T('Ракета пробивает кожух реактора.', 'A rocket punches through the reactor casing.', '一枚火箭击穿了反应堆外壳。')],
  [21, 27, T('Мех без управления идёт к восточной трибуне.', 'With no one at the controls, the mech walks toward the east stand.', '无人操控的机甲走向东看台。')],
  [29, 34, T('Тридцать один погибший. Через месяц Лига принимает Акт о пустых кабинах.', 'Thirty-one dead. A month later the League passes the Empty Cockpit Act.', '三十一人死亡。一个月后，联赛通过了《空驾驶舱法案》。')],
  [34.5, 38, T('С тех пор внутри мехов никого нет.', 'Nobody has sat inside a league mech since.', '从那以后，机甲里再也没有人。')],
];
const LOG = [
  [15.2, 'ASSIST › REACTOR BREACH · CORE 1 180 °C'],
  [15.9, 'ASSIST › RECOMMEND: SCRAM REACTOR'],
  [16.6, 'ASSIST › AWAITING PILOT CONFIRMATION…'],
  [17.2, 'PILOT › — 4'],
  [17.9, 'PILOT › — 3'],
  [18.6, 'PILOT › — 2'],
  [19.3, 'PILOT › — 1'],
  [20.0, 'ASSIST › NO RESPONSE. AUTONOMOUS OVERRIDE NOT PERMITTED.'],
];
export const CUTSCENE_SECONDS = 39;

export class RingCutscene {
  constructor(app) {
    this.app = app;
    this.world = app.world;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x0a0d14, .009);
    this.scene.environment = this.world.scene.environment;
    this.scene.environmentIntensity = .25;
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .3, 900);
    this.lights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffffff, 0, 30, 1.6); this.scene.add(l); return { l, life: 0, max: 1, peak: 0 }; });
    // FX expects a world-like object; route its lights and shake here.
    const self = this;
    this.fxWorld = {
      scene: this.scene, camera: this.camera, renderer: this.world.renderer, flash: 0,
      pulseLight(pos, color, intensity, life = .15, distance = 18) {
        const s = self.lights.reduce((a, b) => (a.life < b.life ? a : b));
        s.l.position.copy(pos); s.l.color.setHex(color); s.l.distance = distance; s.peak = intensity; s.life = s.max = life;
      },
      impact(v) { self.shake = Math.max(self.shake, v); },
    };
    this.fx = new FX(this.fxWorld);
    this.fx.resize(this.world);
    this.shake = 0;
    this.build();
  }

  build() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x8aa4ff, 0x120c0a, .5));
    const moon = new THREE.DirectionalLight(0xbfd0ff, .6); moon.position.set(-40, 80, 30); s.add(moon);
    // Arena floor and lines
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: .7, metalness: .3 }));
    floor.receiveShadow = true;
    s.add(floor);
    const line = new THREE.Mesh(new THREE.RingGeometry(46, 46.6, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8b45a }));
    line.position.y = .03; s.add(line);
    const mid = new THREE.Mesh(new THREE.RingGeometry(9, 9.4, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8b45a }));
    mid.position.y = .03; s.add(mid);
    // Stepped stands (one lathe)
    const prof = [new THREE.Vector2(49, 0)];
    for (let k = 0; k < 9; k++) { prof.push(new THREE.Vector2(49 + k * 3, 2 + k * 2.2)); prof.push(new THREE.Vector2(52 + k * 3, 2 + k * 2.2)); }
    prof.push(new THREE.Vector2(78, 24), new THREE.Vector2(80, 0));
    const stands = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: .9, side: THREE.DoubleSide }));
    s.add(stands);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(79, .5, 6, 96).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd7a0, emissiveIntensity: 1.5 }));
    rim.position.y = 24.5; s.add(rim);
    // Crowd: instanced figures on every tier
    const n = 2600;
    this.crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, 1.3, .7), new THREE.MeshStandardMaterial({ roughness: .8 }), n);
    this.crowdBase = [];
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const tier = i % 9, a = Math.random() * Math.PI * 2, r = 50.5 + tier * 3 + Math.random() * 1.8;
      const p = new THREE.Vector3(Math.cos(a) * r, 2.7 + tier * 2.2, Math.sin(a) * r);
      this.crowdBase.push({ p, a, phase: Math.random() * 6, east: Math.cos(a) > .55 });
      m.makeTranslation(p.x, p.y, p.z);
      this.crowd.setMatrixAt(i, m);
      this.crowd.setColorAt(i, c.setHSL(Math.random(), .45, .35 + Math.random() * .25));
    }
    s.add(this.crowd);
    // Floodlights
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 84, z = Math.sin(a) * 84;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.6, .9, 46, 8), new THREE.MeshStandardMaterial({ color: 0x30353c, metalness: .7 }));
      pole.position.set(x, 23, z); s.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 6 }));
      head.position.set(x * .97, 46, z * .97); head.lookAt(0, 0, 0); s.add(head);
      const spot = new THREE.SpotLight(0xfff0dc, 900, 220, .55, .5, 1.2);
      spot.position.copy(head.position); spot.target.position.set(0, 0, 0);
      spot.castShadow = k === 0; s.add(spot, spot.target);
    }
    // Scoreboard
    const cvs = document.createElement('canvas'); cvs.width = 1024; cvs.height = 256;
    const g = cvs.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#ffb347'; g.font = 'bold 92px Arial'; g.textAlign = 'center'; g.fillText('FINAL · 01:30', 512, 120);
    g.fillStyle = '#e8ecef'; g.font = 'bold 54px Arial'; g.fillText('SEASON 2064 · THE RING', 512, 205);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: new THREE.CanvasTexture(cvs), emissiveIntensity: 1.6 }));
    board.position.set(-70, 30, 0); board.lookAt(0, 22, 0); s.add(board);
    // The two piloted mechs (league colours of 2064)
    // Both are 2064 piloted frames (RING chassis) in the old league liveries.
    this.hero = new Mech(s, { name: 'RING-07', chassis: 'ring', weapons: ['autocannon', 'autocannon', 'missile'], palette: 'league2064', team: 'blue' });
    this.rival = new Mech(s, { name: 'RING-12', chassis: 'ring', weapons: ['rotary', 'autocannon', 'missile'], palette: 'league2064b', team: 'red' });
    for (const u of [this.hero, this.rival]) u.ring.visible = false;
    this.hero.place(-10, 4, Math.PI / 2);
    this.rival.place(16, -4, -Math.PI / 2);
    this.coreGlow = new THREE.PointLight(0xff3010, 0, 18, 1.4);
    this.scene.add(this.coreGlow);
  }

  // ------------------------------------------------------------ playback
  play(onDone) {
    this.onDone = onDone;
    this.time = 0;
    this.done = false;
    this.prev = { scene: this.world.renderPass.scene, camera: this.world.renderPass.camera };
    this.world.renderPass.scene = this.scene;
    this.world.renderPass.camera = this.camera;
    this.overlay = document.getElementById('cutscene');
    this.overlay.classList.remove('hidden');
    this.caption = this.overlay.querySelector('.cs-caption');
    this.log = this.overlay.querySelector('.cs-log');
    this.log.innerHTML = '';
    this.logShown = 0;
    this.skip = (e) => { if (e.type === 'keydown' && !['Space', 'Enter', 'Escape'].includes(e.code)) return; e.preventDefault?.(); this.finish(); };
    this.overlay.addEventListener('click', this.skip);
    addEventListener('keydown', this.skip);
    this.app.music?.play('ring');
    this.app.cutscene = this;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.overlay.removeEventListener('click', this.skip);
    removeEventListener('keydown', this.skip);
    this.overlay.classList.add('hidden');
    this.world.renderPass.scene = this.prev.scene;
    this.world.renderPass.camera = this.prev.camera;
    this.fx.clear();
    this.hero.dispose(); this.rival.dispose();
    this.app.cutscene = null;
    this.onDone?.();
  }

  update(dt) {
    if (this.done) return;
    const t = (this.time += dt);
    const hero = this.hero, rival = this.rival;
    // --- choreography
    if (t < 12.3) {
      // Duel at the centre: sidestepping, trading fire.
      hero.velocity.set(0, 0, Math.sin(t * .9) * 3.5);
      rival.velocity.set(-Math.cos(t * .7) * 2, 0, Math.cos(t * .8) * 3);
      hero.position.addScaledVector(hero.velocity, dt);
      rival.position.addScaledVector(rival.velocity, dt);
      hero.heading = Math.atan2(rival.position.x - hero.position.x, rival.position.z - hero.position.z);
      rival.heading = Math.atan2(hero.position.x - rival.position.x, hero.position.z - rival.position.z);
      if (t > 6 && Math.random() < dt * 9) this.shot(hero, rival, 0xffd28a);
      if (t > 6 && Math.random() < dt * 12) this.shot(rival, hero, 0xffb35a);
    }
    if (t >= 12.3 && !this.breached) {
      this.breached = true;
      const p = hero.centerMass(new THREE.Vector3());
      this.fx.explosion(p.clone().add(new THREE.Vector3(0, 1, -1)), .9, 0xff6a2a);
      this.fx.debrisBurst(p, 10);
      this.fxWorld.flash = .4;
      this.app.audio?.boom(1.4);
    }
    if (t >= 12.3) {
      hero.velocity.set(0, 0, 0);
      rival.velocity.set(0, 0, 0);
      const core = hero.nodes.torso.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.4, 0));
      this.coreGlow.position.copy(core);
      this.coreGlow.intensity = 60 + Math.sin(t * 22) * 25 + smooth(12, 26, t) * 120;
      if (Math.random() < .7) this.fx.sparks(core, 0xff5020, 3, .6);
      if (Math.random() < .5) this.fx.puff(core, 1, .12, 1.6, 2, 2.5);
      if (Math.random() < .4) this.fx.fire(core, .8);
    }
    if (t >= 20.5 && t < 27.5) {
      // Unpiloted walk toward the east stand (+x)
      hero.heading = THREE.MathUtils.lerp(hero.heading, Math.PI / 2, dt * 1.5);
      hero.velocity.set(Math.sin(hero.heading) * 8.6, 0, Math.cos(hero.heading) * 8.6);
      hero.position.addScaledVector(hero.velocity, dt);
      hero.position.x = Math.min(hero.position.x, 49);
      hero.position.z *= 1 - dt * .4;
      rival.heading = Math.atan2(hero.position.x - rival.position.x, hero.position.z - rival.position.z);
    }
    if (t >= 27.5 && !this.blown) {
      this.blown = true;
      const p = hero.centerMass(new THREE.Vector3());
      this.blastAt = p.clone().setX(p.x + 6);
      this.fx.explosion(p, 2.6, 0xff7a2a);
      setTimeout(() => this.fx.explosion(p.clone().add(new THREE.Vector3(4, 5, 3)), 1.8, 0xffb060), 260);
      setTimeout(() => this.fx.explosion(p.clone().add(new THREE.Vector3(6, 8, -4)), 1.4), 600);
      this.fx.debrisBurst(p, 24);
      hero.powerDown();
      this.coreGlow.intensity = 0;
      this.fxWorld.flash = 1;
      this.shake = 1.2;
      this.app.audio?.boom(2.4);
    }
    if (t >= 27.5) {
      const p = new THREE.Vector3(52 + Math.random() * 10, 4 + Math.random() * 10, (Math.random() - .5) * 26);
      if (Math.random() < .8) this.fx.puff(p, 1, .1, 6, 5, 3);
      if (Math.random() < .5) this.fx.fire(p, 2);
      // Sirens sweep the smoke
      const s = this.lights[0];
      s.l.position.set(30, 6, Math.sin(t * 3) * 25); s.l.color.setHex(Math.sin(t * 6) > 0 ? 0xff2020 : 0x2050ff); s.l.distance = 80; s.peak = 140; s.life = s.max = .2;
    }
    hero.animate(dt, this.fx, t);
    rival.animate(dt, this.fx, t);
    this.updateCrowd(t);
    // --- camera
    const cam = this.camera;
    let pos, look;
    if (t < 6.5) { const a = t * .12 + .4; pos = new THREE.Vector3(Math.cos(a) * 95, 42 - t * 2, Math.sin(a) * 95); look = new THREE.Vector3(0, 6, 0); }
    else if (t < 12.3) { const a = (t - 6.5) * .25; pos = new THREE.Vector3(-26 + Math.sin(a) * 6, 6, 18 + Math.cos(a) * 4); look = new THREE.Vector3(4, 5, 0); }
    else if (t < 20.5) { const core = hero.centerMass(new THREE.Vector3()); const k = smooth(12.3, 16, t); pos = new THREE.Vector3(lerp(core.x - 14, core.x - 6, k), lerp(9, 7, k), lerp(core.z + 10, core.z + 5, k)); look = core.clone().setY(6.5); }
    else if (t < 27.5) { pos = new THREE.Vector3(hero.position.x - 22, 10, hero.position.z + 24); look = new THREE.Vector3(hero.position.x + 12, 8, hero.position.z); }
    else { const k = smooth(27.5, 38, t); pos = new THREE.Vector3(lerp(10, -30, k), lerp(14, 40, k), lerp(40, 70, k)); look = new THREE.Vector3(48, 8, 0); }
    // Hard cut between shots, smooth drift within a shot.
    const shotIdx = (t > 6.5) + (t > 12.3) + (t > 20.5) + (t > 27.5);
    if (shotIdx !== this.lastShot) cam.position.copy(pos);
    else cam.position.lerp(pos, 1 - Math.pow(.05, dt));
    this.lastShot = shotIdx;
    if (this.shake > 0) { cam.position.x += (Math.random() - .5) * this.shake; cam.position.y += (Math.random() - .5) * this.shake; this.shake = Math.max(0, this.shake - dt * 1.4); }
    cam.lookAt(look);
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    // --- lights, fx, grading
    for (const s of this.lights) { if (s.life <= 0) { s.l.intensity = 0; continue; } s.life -= dt; s.l.intensity = s.peak * Math.max(0, s.life / s.max); }
    this.fx.update(dt);
    this.world.flash = Math.max(this.world.flash, this.fxWorld.flash);
    this.fxWorld.flash = Math.max(0, this.fxWorld.flash - dt * 2);
    // --- overlay text
    const cap = CAPTIONS.find(([a, b]) => t >= a && t < b);
    const text = cap ? L(cap[2]) : '';
    if (this.caption.dataset.text !== text) { this.caption.dataset.text = text; this.caption.textContent = text; this.caption.classList.toggle('show', !!text); }
    while (this.logShown < LOG.length && t >= LOG[this.logShown][0]) {
      const row = document.createElement('div');
      row.textContent = LOG[this.logShown][1];
      this.log.appendChild(row);
      this.logShown++;
    }
    this.log.classList.toggle('show', t > 15 && t < 22);
    this.overlay.querySelector('.cs-title').classList.toggle('show', t > 36);
    if (t >= CUTSCENE_SECONDS) this.finish();
  }

  shot(from, to, color) {
    const o = from.centerMass(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0));
    const d = to.centerMass(new THREE.Vector3()).sub(o).normalize();
    this.fx.muzzle(o.clone().addScaledVector(d, 3), d, color, .8);
    const hit = to.centerMass(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 2, (Math.random() - .5) * 2));
    this.fx.beam(o, hit, color, .05, .06, false);
    if (Math.random() < .5) this.fx.sparks(hit, 0xffc070, 4, .5);
  }

  updateCrowd(t) {
    const m = new THREE.Matrix4();
    // East-stand spectators start to run along their tier (away from the
    // mech's path) once it turns toward them; everyone panics after the blast.
    // Only those inside the blast radius vanish, and only at the moment of impact.
    const flee = smooth(21.5, 27.5, t), panic = smooth(27.5, 31, t);
    const blast = this.blastAt;
    this.crowdBase.forEach((c, i) => {
      let a = c.a;
      const run = c.east ? flee * .35 + panic * .25 : panic * .12;
      if (run) a += Math.sign(Math.sin(c.a) || 1) * run;
      const r = Math.hypot(c.p.x, c.p.z);
      let x = Math.cos(a) * r, z = Math.sin(a) * r, y = c.p.y;
      const cheer = t < 12.3 ? Math.max(0, Math.sin(t * 6 + c.phase)) * .35 : (run ? Math.abs(Math.sin(t * 14 + c.phase)) * .25 : 0);
      if (blast && Math.hypot(c.p.x - blast.x, c.p.z - blast.z) < 15 && Math.abs(c.p.y - blast.y) < 12) y = -60;
      m.makeTranslation(x, y + cheer, z);
      this.crowd.setMatrixAt(i, m);
    });
    this.crowd.instanceMatrix.needsUpdate = true;
  }
}
