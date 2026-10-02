// Live 3D preview of the mech being configured in the briefing. A small
// separate renderer so the loadout updates instantly as selects change.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { instantiateMech, instantiateWeapon } from '../engine/assets.js';
import { PALETTES } from '../data/chassis.js';
import { WEAPONS } from '../data/weapons.js';

export class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.scene.environmentIntensity = .5;
    this.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
    const key = new THREE.DirectionalLight(0xfff1e0, 3.2); key.position.set(-6, 10, 8);
    const rim = new THREE.DirectionalLight(0x3fe0f5, 2.6); rim.position.set(6, 6, -8);
    const fill = new THREE.HemisphereLight(0xbfd8ff, 0x101418, 1.1);
    this.scene.add(key, rim, fill);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c1417, roughness: .6, metalness: .4 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.75, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3fe0f5, transparent: true, opacity: .5 }));
    ring.position.y = .01;
    this.scene.add(floor, ring);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.angle = .6;
    this.drag = null;
    canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag !== null) { this.angle += (e.clientX - this.drag) * .01; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.running = false;
  }

  show(unit, paletteName = 'signal') {
    const key = JSON.stringify([unit.chassis, unit.weapons, paletteName]);
    if (key === this.key) return;
    this.key = key;
    this.holder.clear();
    const palette = PALETTES[paletteName];
    const { object, nodes } = instantiateMech(unit.chassis, palette);
    unit.weapons.forEach((id, slot) => {
      if (!id) return;
      const mountName = WEAPONS[id].mount === 'shoulder' ? 'mount_shoulder_R' : slot === 0 ? 'mount_arm_L' : 'mount_arm_R';
      nodes[mountName].add(instantiateWeapon(id, palette).object);
    });
    // Slight pose so the weapons read in profile.
    nodes.torso.rotation.y = -.25;
    this.holder.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const h = box.max.y - box.min.y;
    this.camera.position.set(0, h * .62, h * 1.85);
    this.camera.lookAt(0, h * .48, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      requestAnimationFrame(tick);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (!w || !h) return;
      if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio())) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      if (this.drag === null) this.angle += .004;
      this.holder.rotation.y = this.angle;
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  stop() { this.running = false; }
}
