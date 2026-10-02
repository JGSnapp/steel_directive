import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Final colour grade: tint/contrast/saturation per map, vignette, chromatic
// aberration that spikes on impacts, film grain and a white flash for explosions.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, flash: { value: 0 }, aberration: { value: .0012 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, contrast: { value: 1.05 }, saturation: { value: 1 }, vignette: { value: .32 },
    damage: { value: 0 }, grain: { value: .035 },
  },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `
    uniform sampler2D tDiffuse;uniform float time,flash,aberration,contrast,saturation,vignette,damage,grain;uniform vec3 tint;varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec2 c=vUv-.5;float d=length(c);
      float ab=aberration*(1.+d*2.);
      vec3 col=vec3(texture2D(tDiffuse,vUv+c*ab).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-c*ab).b);
      col*=tint;
      float l=dot(col,vec3(.2126,.7152,.0722));
      col=mix(vec3(l),col,saturation);
      col=(col-.5)*contrast+.5;
      col+=flash*vec3(1.,.93,.8);
      col=mix(col,col*vec3(1.35,.55,.5),damage*smoothstep(.25,.75,d));
      col*=1.-vignette*smoothstep(.3,.85,d);
      col+=(hash(vUv*vec2(1920.,1080.)+time)-.5)*grain;
      gl_FragColor=vec4(max(col,0.),1.);
    }`,
};

const SkyShader = {
  uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
  vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',
  fragmentShader: `
    uniform vec3 top,horizon,sunColor,sunDir;varying vec3 vDir;
    void main(){
      float h=clamp(vDir.y,-.2,1.);
      vec3 col=mix(horizon,top,pow(max(h,0.),.55));
      col=mix(col,horizon*.55,step(h,0.)*min(1.,-h*6.));
      float s=max(dot(normalize(vDir),normalize(sunDir)),0.);
      col+=sunColor*(pow(s,420.)*3.+pow(s,24.)*.35+pow(s,4.)*.12);
      gl_FragColor=vec4(col,1.);
    }`,
};

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .2, 600);
    this.camera.position.set(0, 40, 80);
    this.clock = 0;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.scene.environmentIntensity = .35;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 1, far: 220 });
    this.sun.shadow.bias = -.0004;
    this.sun.shadow.normalBias = .04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({ ...SkyShader, uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms), side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // Pooled point lights: a fixed light count avoids shader recompiles mid-fight.
    this.lightPool = Array.from({ length: 8 }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 18, 1.8);
      this.scene.add(l);
      return { light: l, life: 0, max: 1, peak: 0 };
    });

    const size = new THREE.Vector2(innerWidth, innerHeight).multiplyScalar(this.renderer.getPixelRatio());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .65, .45, .9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.shake = 0;
    this.flash = 0;
    this.aberrationKick = 0;
    this.weather = null;
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  applyMap(map) {
    const s = this.sky.material.uniforms;
    s.top.value.setHex(map.sky.top);
    s.horizon.value.setHex(map.sky.horizon);
    s.sunColor.value.setHex(map.sky.sun);
    s.sunDir.value.set(...map.sun.pos).normalize();
    this.scene.fog = new THREE.FogExp2(map.fog.color, map.fog.density);
    this.scene.background = new THREE.Color(map.fog.color);
    this.sun.color.setHex(map.sun.color);
    this.sun.intensity = map.sun.intensity;
    this.sun.position.set(...map.sun.pos);
    this.hemi.color.setHex(map.hemi.sky);
    this.hemi.groundColor.setHex(map.hemi.ground);
    this.hemi.intensity = map.hemi.intensity;
    this.renderer.toneMappingExposure = map.exposure;
    const g = this.grade.uniforms;
    g.tint.value.set(...map.grade.tint);
    g.contrast.value = map.grade.contrast;
    g.saturation.value = map.grade.saturation;
    this.setWeather(map.weather);
  }

  pulseLight(pos, color, intensity, life = .15, distance = 18) {
    const slot = this.lightPool.reduce((a, b) => (a.life < b.life ? a : b));
    slot.light.position.copy(pos);
    slot.light.color.setHex(color);
    slot.light.distance = distance;
    slot.peak = intensity;
    slot.life = slot.max = life;
  }

  impact(strength) {
    this.shake = Math.max(this.shake, strength);
    this.aberrationKick = Math.max(this.aberrationKick, strength * .01);
  }

  setWeather(kind) {
    if (this.weather) {
      this.scene.remove(this.weather.object);
      this.weather.object.geometry.dispose();
      this.weather = null;
    }
    if (!kind) return;
    const count = { rain: 5000, snow: 3500, embers: 900, dust: 700 }[kind];
    const area = 90, height = 45;
    const pos = new Float32Array(count * (kind === 'rain' ? 6 : 3));
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds.set([(Math.random() - .5) * area, Math.random() * height, (Math.random() - .5) * area], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    let object;
    if (kind === 'rain') {
      object = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: .32, depthWrite: false }));
    } else {
      const color = { snow: 0xffffff, embers: 0xff8a3a, dust: 0xffd9a0 }[kind];
      object = new THREE.Points(geo, new THREE.PointsMaterial({
        color, size: { snow: .22, embers: .16, dust: .1 }[kind], transparent: true, opacity: kind === 'dust' ? .5 : .9, depthWrite: false,
        blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending, map: softDot(), sizeAttenuation: true,
      }));
    }
    object.frustumCulled = false;
    this.scene.add(object);
    this.weather = { kind, object, seeds, count, area, height };
  }

  updateWeather(dt) {
    const w = this.weather;
    if (!w) return;
    const { seeds, count, area, height } = w;
    const pos = w.object.geometry.attributes.position.array;
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const t = this.clock;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      if (w.kind === 'rain') seeds[k + 1] -= dt * 38;
      else if (w.kind === 'snow') { seeds[k + 1] -= dt * 3.2; seeds[k] += Math.sin(t * .7 + i) * dt * 1.2; seeds[k + 2] += dt * 2.2; }
      else if (w.kind === 'embers') { seeds[k + 1] += dt * (1.5 + (i % 7) * .3); seeds[k] += Math.sin(t * 1.3 + i) * dt * 1.5; }
      else { seeds[k + 1] += Math.sin(t * .4 + i) * dt * .3; seeds[k] += dt * .6; }
      if (seeds[k + 1] < 0) seeds[k + 1] += height;
      if (seeds[k + 1] > height) seeds[k + 1] -= height;
      // Wrap particles in a box that follows the camera.
      let x = ((seeds[k] - cx) % area + area * 1.5) % area - area / 2 + cx;
      let z = ((seeds[k + 2] - cz) % area + area * 1.5) % area - area / 2 + cz;
      const y = seeds[k + 1];
      if (w.kind === 'rain') {
        pos.set([x, y, z, x + .15, y + 1.3, z + .1], i * 6);
      } else pos.set([x, y, z], k);
    }
    w.object.geometry.attributes.position.needsUpdate = true;
  }

  render(dt) {
    this.clock += dt;
    for (const slot of this.lightPool) {
      if (slot.life <= 0) { slot.light.intensity = 0; continue; }
      slot.life -= dt;
      slot.light.intensity = slot.peak * Math.max(0, slot.life / slot.max) ** 1.5;
    }
    this.updateWeather(dt);
    const g = this.grade.uniforms;
    g.time.value = this.clock;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    g.flash.value = this.flash;
    this.aberrationKick = Math.max(0, this.aberrationKick - dt * .03);
    g.aberration.value = .0012 + this.aberrationKick;
    if (this.shake > 0) {
      const s = this.shake * .6;
      this.camera.position.add(new THREE.Vector3((Math.random() - .5) * s, (Math.random() - .5) * s, (Math.random() - .5) * s));
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    this.sky.position.copy(this.camera.position);
    this.composer.render(dt);
  }
}

let dotTexture;
export function softDot() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(.35, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}
