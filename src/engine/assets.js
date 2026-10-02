import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHASSIS } from '../data/chassis.js';
import { WEAPONS } from '../data/weapons.js';

const PROPS = ['container', 'barrier', 'silo', 'rook', 'pylon', 'crate', 'wall', 'rock'];
const PIVOTS = new Set(['mech_root', 'hips', 'torso', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R']);
const cache = {};

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const names = [
    ...Object.values(CHASSIS).map(c => c.model),
    ...Object.keys(WEAPONS).map(w => `weapon_${w}`),
    ...PROPS.map(p => `prop_${p}`),
  ];
  let done = 0;
  await Promise.all(names.map(async (name) => {
    const gltf = await loader.loadAsync(`assets/models/${name}.glb`);
    cache[name] = bake(gltf.scene);
    onProgress?.(++done / names.length);
  }));
}

// Merge every static mesh into its nearest animated pivot, one mesh per
// material. A ~90-part chassis collapses to a few dozen draw calls.
function bake(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    let pivot = node.parent;
    while (pivot && pivot !== root && !PIVOTS.has(pivot.name) && !pivot.name.startsWith('weapon_') && !pivot.name.startsWith('prop_')) pivot = pivot.parent;
    pivot = pivot || root;
    const key = pivot.uuid + '|' + node.material.name;
    if (!groups.has(key)) groups.set(key, { pivot, material: node.material, geos: [] });
    const rel = new THREE.Matrix4().copy(pivot.matrixWorld).invert().multiply(node.matrixWorld);
    const g = node.geometry.clone().applyMatrix4(rel);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    groups.get(key).geos.push(g.index ? g.toNonIndexed() : g);
  });
  const meshes = [];
  root.traverse(n => n.isMesh && meshes.push(n));
  meshes.forEach(m => m.parent.remove(m));
  for (const { pivot, material, geos } of groups.values()) {
    const merged = new THREE.Mesh(mergeGeometries(geos), material);
    merged.name = 'merged_' + material.name;
    merged.castShadow = merged.receiveShadow = true;
    pivot.add(merged);
  }
  return root;
}

function paint(object, palette, opts = {}) {
  const [primary, secondary, trim, glow] = palette;
  const made = {};
  object.traverse((node) => {
    if (!node.isMesh) return;
    const src = node.material;
    if (!made[src.name]) {
      const m = src.clone();
      m.flatShading = true;
      if (src.name === 'paint_primary') m.color.setHex(primary);
      if (src.name === 'paint_secondary') m.color.setHex(secondary);
      if (src.name === 'trim') m.color.setHex(trim);
      if (src.name === 'glow') { m.color.setHex(glow); m.emissive.setHex(glow); m.emissiveIntensity = opts.glow ?? 2.2; }
      if (src.name === 'glass') { m.roughness = .05; m.metalness = .3; }
      if (opts.roughness && src.name.startsWith('paint')) m.roughness = opts.roughness;
      made[src.name] = m;
    }
    node.material = made[src.name];
  });
  return made;
}

export function instantiateMech(chassisId, palette) {
  const scene = cache[CHASSIS[chassisId].model].clone(true);
  const materials = paint(scene, palette);
  const nodes = {};
  scene.traverse(n => { if (n.name) nodes[n.name] = n; });
  return { object: scene, nodes, materials };
}

export function instantiateWeapon(id, palette) {
  const scene = cache[`weapon_${id}`].clone(true);
  const p = [palette[0], palette[1], 0x8f9aa0, WEAPONS[id].color];
  paint(scene, p, { glow: 3 });
  let muzzle = null;
  scene.traverse(n => { if (n.name === 'muzzle') muzzle = n; });
  return { object: scene, muzzle: muzzle || scene };
}

export function instantiateProp(type, palette, opts) {
  const scene = cache[`prop_${type}`].clone(true);
  paint(scene, palette, opts);
  return scene;
}
