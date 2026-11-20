// Special Delivery – stork flight runner (three.js)
// Adapted from the standalone special_delivery.html for the device screen and chapter lifecycle:
// no DOM of its own, assets from assets/baby-delivery/, HUD data handed to the chapter via status().
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createBabyDelivery({ assetsUrl = 'assets/baby-delivery/', quality = 'auto', sound = true } = {}) {
// ======================= tuning =======================
const TUNE = {
  speedStart: 11, speedMax: 20, speedRamp: 160,   // m/s, and metres per +1 m/s
  steerX: 8, steerY: 6.5, steerResponse: 2.6,     // max lateral/vertical speed (m/s) and how fast you reach it
  swingFree: 30, swingDrain: 0.6,                 // degrees of swing that are free, and meter drain per extra degree per second
  calmRegen: 3, hitCost: 25, bottleGain: 35, featherCalm: 5, lullabySecs: 8,
  camBack: 3.6, camUp: 1.7, goal: 1000,
};

const canvas = document.createElement('canvas');
let disposed = false, loading = true, loadError = '';

// ======================= renderer / scene =======================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xF4E6D3);
scene.background = HORIZON.clone();
scene.fog = new THREE.Fog(HORIZON, 70, 250);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);

const sky = (() => {
  const g = new THREE.SphereGeometry(400, 32, 16);
  const top = new THREE.Color(0x7FB9E3), mid = new THREE.Color(0xBFE0F2);
  const cols = [], p = g.attributes.position;
  for (let i = 0; i < p.count; i++){
    const y = p.getY(i)/400, c = new THREE.Color();
    if (y > 0.15) c.lerpColors(mid, top, Math.min(1, (y-0.15)/0.6)); else c.lerpColors(HORIZON, mid, Math.max(0, (y+0.05)/0.2));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1; scene.add(m); return m;
})();
scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xC9D8B0, 1.5));
const sun = new THREE.DirectionalLight(0xFFF2DE, 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const gradTex = new THREE.DataTexture(new Uint8Array([125,125,125,255, 195,195,195,255, 255,255,255,255]), 3, 1);
gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
const outlineMats = [];
function makeOutlineMat(width){
  const m = new THREE.MeshBasicMaterial({ color: 0x2B2220, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: width };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      'vec3 transformed = vec3( position ) + normalize( normal ) * uOutline;');
  };
  outlineMats.push(m);
  return m;
}
function stylize(root, width){
  const list = [];
  root.traverse(o => { if (o.isMesh){ o.castShadow = true; o.frustumCulled = false;
    const old = o.material; o.material = new THREE.MeshToonMaterial({ color: old.color.clone(), gradientMap: gradTex }); old.dispose(); list.push(o); } });
  for (const o of list){
    if (!o.isSkinnedMesh) continue;
    const ol = new THREE.SkinnedMesh(o.geometry, makeOutlineMat(width)); ol.bind(o.skeleton, o.bindMatrix);
    ol.frustumCulled = false; ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale); o.parent.add(ol);
  }
}

// ======================= seeded randomness + noise =======================
function mulberry(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, z){ let h = Math.imul(x|0, 374761393) + Math.imul(z|0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z){
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const s = t => t*t*(3-2*t), u = s(xf), v = s(zf);
  const a = hash2(xi, zi), b = hash2(xi+1, zi), c = hash2(xi, zi+1), d = hash2(xi+1, zi+1);
  return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+d*u)*v;
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x-a)/(b-a))); return t*t*(3-2*t); };

// ======================= world layout rules =======================
const CH = 40, SEG = 9;                       // chunk length (m), chunks per biome stretch
const roadX = z => 3.2*Math.sin(z*0.011) + 1.5*Math.sin(z*0.027+1.3);
const riverX = z => 30*Math.sin(z*0.0045+0.7) + 8*Math.sin(z*0.013);
let SEED = 1;
const biomeOf = z => (Math.floor(Math.max(0, z) / (CH*SEG)) % 2);   // 0 = village, 1 = fields
function fieldsWeight(z){
  const L = CH*SEG, k = Math.floor(z / L), f = z - k*L, cur = (k % 2), prev = ((k+1) % 2);
  const blend = 1 - smoothstep(0, 24, f);
  const w = cur*(1-blend) + prev*blend;
  return z < 0 ? 0 : (k === 0 ? cur : w);
}
function groundH(x, z){
  const fw = fieldsWeight(z);
  const amp = 1.4 + 2.4*fw;
  let h = (vnoise(x*0.035 + SEED, z*0.035) - 0.5)*2*amp + (vnoise(x*0.11, z*0.11 + SEED)-0.5)*0.6;
  const rd = Math.abs(x - roadX(z)); h *= 0.35 + 0.65*smoothstep(3, 14, rd);
  if (fw > 0.5){ const rv = Math.abs(x - riverX(z)); h -= 1.2*(1 - smoothstep(3.5, 7, rv)); }
  return h;
}
const C = (h) => new THREE.Color(h);
const GRASS = [C(0x9CCB6B), C(0x8DC062), C(0xA6D174)], CROPS = [C(0xE8D27A), C(0xB4D477), C(0xD7B672), C(0x9CC86B)];
const ROAD = C(0xE6CFA3), WATER = C(0x7FBEDF), BANK = C(0xC9B98A);
function groundColor(x, z, out){
  const fw = fieldsWeight(z);
  const g = GRASS[Math.floor(hash2(Math.floor(x/9), Math.floor(z/9)) * 3)];
  const crop = CROPS[Math.floor(hash2(Math.floor((x+500)/16), Math.floor(z/22)) * 4)];
  out.copy(g).lerp(crop, fw*(Math.abs(x - roadX(z)) > 8 ? 0.85 : 0.2));
  const rd = Math.abs(x - roadX(z));
  if (rd < 3.2) out.lerp(ROAD, (1-fw*0.6) * (1 - smoothstep(2.4, 3.2, rd)));
  if (fw > 0.5){ const rv = Math.abs(x - riverX(z)); if (rv < 7) out.lerp(rv < 4 ? WATER : BANK, rv < 4 ? 1 : 1 - smoothstep(4, 7, rv)); }
  return out;
}

// ======================= assets =======================
const loader = new GLTFLoader();
const KIT = {};
const kitMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex });
const INST = {};
const b2t = (a) => new THREE.Vector3(a[0], a[2], -a[1]);   // Blender -> three coordinates
const groundMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex });
const waterMat = new THREE.MeshToonMaterial({ color: 0x86C5E6, gradientMap: gradTex, transparent: true, opacity: 0.92 });

let storkModel = null, storkMixer = null, storkPivot = null, grip = null, tip = null;
let babyRoot = null, babyHolder = null, babyMixer = null, babyAction = null;
const babyClips = {};
let puffs = null, ring = null, glow = null, featherOutline = null;
let fxFeathers = null, fxSparks = null;
const fxRings = [];

const load = (url) => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
Promise.all([load(assetsUrl + 'stork.glb'), load(assetsUrl + 'baby.glb'), load(assetsUrl + 'kit.glb')]).then(([sg, bg, kg]) => {
  if (disposed) { for (const g of [sg, bg, kg]) disposeObject(g.scene); return; }
  kg.scene.traverse(o => {
    if (!o.isMesh || !o.name.startsWith('kit_')) return;
    const ex = o.userData || {};
    const cols = ex.col ? JSON.parse(ex.col).map(c => {
      if (c.t === 'box'){ const a = b2t(c.min), b = b2t(c.max); return { t: 'box', min: a.clone().min(b), max: a.clone().max(b) }; }
      if (c.t === 'sph') return { t: 'sph', c: b2t(c.c), r: c.r };
      return { t: 'cap', a: b2t(c.a), b: b2t(c.b), r: c.r };
    }) : [];
    KIT[o.name] = { geo: o.geometry, cols, smoke: ex.smoke ? b2t(JSON.parse(ex.smoke)) : null, hub: ex.hub ? b2t(JSON.parse(ex.hub)) : null };
    o.material?.dispose?.();
  });
  const caps = { kit_feather: 500, kit_tree_round: 400, kit_tree_pine: 300, kit_bush: 300, kit_fence: 300, kit_haystack: 200, kit_cloud: 120,
                 kit_house_a: 160, kit_house_b: 160, kit_house_c: 160 };
  for (const n in KIT){
    const im = new THREE.InstancedMesh(KIT[n].geo, kitMat, caps[n] || 60);
    im.castShadow = !['kit_cloud', 'kit_feather', 'kit_note', 'kit_bottle'].includes(n); im.receiveShadow = true;
    im.frustumCulled = false; im.count = 0; scene.add(im); INST[n] = im;
  }
  featherOutline = new THREE.InstancedMesh(KIT.kit_feather.geo, makeOutlineMat(0.008), INST.kit_feather.instanceMatrix.count);
  featherOutline.frustumCulled = false; featherOutline.count = 0; scene.add(featherOutline);
  // stork
  storkModel = sg.scene; stylize(storkModel, 0.0045);
  storkPivot = new THREE.Group(); storkPivot.add(storkModel); storkModel.position.set(0, -1.0, 0); scene.add(storkPivot);
  storkMixer = new THREE.AnimationMixer(storkModel);
  storkMixer.clipAction(sg.animations.find(a => a.name === 'Fly')).play();
  grip = storkModel.getObjectByName('beak_grip'); tip = storkModel.getObjectByName('beak_tip');
  // baby
  babyRoot = bg.scene; stylize(babyRoot, 0.0022);
  babyHolder = new THREE.Group(); babyHolder.add(babyRoot); scene.add(babyHolder);
  babyMixer = new THREE.AnimationMixer(babyRoot);
  for (const c of bg.animations) if (c.name.startsWith('Baby_')) babyClips[c.name] = c;
  setBabyAnim('Baby_Sleep');
  // smoke, delivery ring, pickup effects
  puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshToonMaterial({ color: 0xE9E4DE, gradientMap: gradTex }), 260);
  puffs.frustumCulled = false; puffs.count = 0; scene.add(puffs);
  ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 10, 40), new THREE.MeshToonMaterial({ color: 0xF2C14E, gradientMap: gradTex, emissive: 0x6a4a00 }));
  glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), new THREE.MeshBasicMaterial({ color: 0xFFE9A8 }));
  scene.add(ring, glow); ring.visible = glow.visible = false;
  fxFeathers = new THREE.InstancedMesh(KIT.kit_feather.geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex }), 240);
  fxSparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xE9DDFF }), 240);
  for (const m of [fxFeathers, fxSparks]){ m.frustumCulled = false; m.count = 0; scene.add(m); }
  for (let i = 0; i < 6; i++){
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 36), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false }));
    r.visible = false; scene.add(r); fxRings.push({ mesh: r, age: 9 });
  }
  loading = false;
  resetWorld(1, 'menu');
}).catch((error) => { loading = false; loadError = 'Could not load the stork: ' + (error?.message || error); });

function setBabyAnim(name){
  const c = babyClips[name]; if (!c || (babyAction && babyAction.getClip() === c)) return;
  const a = babyMixer.clipAction(c); a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  if (babyAction) babyAction.crossFadeTo(a, 0.3, false);
  babyAction = a;
}

// ======================= chunks =======================
const chunks = new Map();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function worldCols(kit, pos, yaw, scale){
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  return (KIT[kit].cols || []).map(c => {
    if (c.t === 'sph') return { t: 'sph', c: c.c.clone().multiplyScalar(scale).applyQuaternion(q).add(pos), r: c.r*scale };
    if (c.t === 'cap') return { t: 'cap', a: c.a.clone().multiplyScalar(scale).applyQuaternion(q).add(pos), b: c.b.clone().multiplyScalar(scale).applyQuaternion(q).add(pos), r: c.r*scale };
    const bb = new THREE.Box3();
    for (let i = 0; i < 8; i++) bb.expandByPoint(new THREE.Vector3(i&1 ? c.max.x : c.min.x, i&2 ? c.max.y : c.min.y, i&4 ? c.max.z : c.min.z).multiplyScalar(scale).applyQuaternion(q).add(pos));
    return { t: 'box', min: bb.min, max: bb.max };
  });
}
function colDist(c, p){
  if (c.t === 'sph') return p.distanceTo(c.c) - c.r;
  if (c.t === 'cap'){ const ab = _v.copy(c.b).sub(c.a); const t = Math.max(0, Math.min(1, p.clone().sub(c.a).dot(ab)/ab.lengthSq()));
    return p.distanceTo(c.a.clone().addScaledVector(ab, t)) - c.r; }
  const q = p.clone().clamp(c.min, c.max); return p.distanceTo(q);
}
function pointClear(chunk, p, margin){
  for (const it of chunk.statics) for (const c of it.cols) if (colDist(c, p) < margin) return false;
  for (const w of chunk.windmills) if (Math.abs(p.z - w.hub.z) < 2.5 && Math.hypot(p.x - w.hub.x, p.y - w.hub.y) < 8.2) return false;
  for (const b of chunk.balloons) if (p.distanceTo(new THREE.Vector3(b.pos.x, b.baseY + 5, b.pos.z)) < 4.5 + margin) return false;
  return true;
}

function genChunk(ci){
  const rng = mulberry(SEED*7919 + ci*104729);
  const R = (a, b) => a + (b-a)*rng(), pick = arr => arr[Math.floor(rng()*arr.length)];
  const z0 = ci*CH, biome = biomeOf(z0 + CH/2), d = Math.min(1, ci/45);
  const ch = { ci, z0, statics: [], deco: [], windmills: [], balloons: [], crows: [], pickups: [], smokes: [], ground: null, water: null, delivery: null, church: false, windmill: false };
  const add = (kit, x, z, yaw = 0, scale = 1, yOff = 0, solid = true) => {
    const pos = new THREE.Vector3(x, groundH(x, z) + yOff, z);
    const it = { kit, pos, yaw, scale, cols: solid ? worldCols(kit, pos, yaw, scale) : [] };
    (solid ? ch.statics : ch.deco).push(it);
    if (KIT[kit].smoke){ const s = KIT[kit].smoke.clone().multiplyScalar(scale).applyAxisAngle(UP, yaw).add(pos); ch.smokes.push({ p: s, t: rng()*0.6 }); }
    return it;
  };
  const near = (x, z, r) => ch.statics.some(it => Math.hypot(it.pos.x - x, it.pos.z - z) < r);
  const safe = ci < 2;

  if (deliveryChunks.has(ci)){
    const z = z0 + 24, x = roadX(z);
    const it = add('kit_house_a', x, z, Math.PI, 1.35);
    ch.delivery = { pos: it.pos.clone(), ring: new THREE.Vector3(x, it.pos.y + 14.5, z), glow: new THREE.Vector3(x - 1.68*1.35, it.pos.y + 5.05, z - 4.12), done: false };
    for (const s of [-1, 1]) add('kit_tree_round', x + s*9, z + R(-3, 3), R(0, 6), R(0.9, 1.2));
    for (const s of [-1, 1]) add('kit_fence', x + s*4.5, z - 6, 0, 1, 0, false);
  } else if (biome === 0){
    for (const side of [-1, 1]){
      for (let z = z0 + R(1, 5); z < z0 + CH; z += R(9.5, 13)){
        if (safe && rng() < 0.6) continue;
        const kit = pick(['kit_house_a', 'kit_house_a', 'kit_house_b', 'kit_house_c']);
        add(kit, roadX(z) + side*R(8.5, 11.5), z, side < 0 ? Math.PI/2 : -Math.PI/2, R(0.95, 1.1));
        if (rng() < 0.55) add(kit === 'kit_house_b' ? 'kit_house_c' : 'kit_house_b', roadX(z) + side*R(19, 26), z + R(-3, 3), side < 0 ? Math.PI/2 : -Math.PI/2, R(0.9, 1.1));
      }
    }
    if (!safe && rng() < 0.45 + 0.25*d){ const z = z0 + R(8, 32); add('kit_clothesline', roadX(z), z, 0, 1, -R(0, 4.5)); }
    if (!safe && rng() < 0.16 + 0.1*d && !(chunks.get(ci-1)?.church)){
      const z = z0 + R(10, 30), x = roadX(z) + R(-3, 3);
      if (!near(x, z, 10)){ add('kit_church', x, z, rng() < 0.5 ? 0 : Math.PI); ch.church = true; }
    }
    for (let i = 0; i < 6; i++){ const z = z0 + R(0, CH), x = roadX(z) + (rng() < 0.5 ? -1 : 1)*R(6, 30);
      if (!near(x, z, 6)) add(rng() < 0.7 ? 'kit_tree_round' : 'kit_tree_pine', x, z, R(0, 6), R(0.8, 1.15)); }
    for (let i = 0; i < 4; i++){ const z = z0 + R(0, CH), x = roadX(z) + (rng() < 0.5 ? -1 : 1)*R(4.5, 7);
      add(rng() < 0.5 ? 'kit_fence' : 'kit_bush', x, z, rng() < 0.5 ? Math.PI/2 : 0, 1, 0, false); }
  } else {
    if (!safe && rng() < 0.38 + 0.15*d && !(chunks.get(ci-1)?.windmill)){
      const z = z0 + R(14, 26), x = R(-4, 4);
      const it = add('kit_windmill', x, z, 0, 1);
      ch.windmills.push({ base: it, hub: KIT.kit_windmill.hub.clone().add(it.pos), ang: R(0, 6.28), spd: R(0.5, 0.9)*(rng() < 0.5 ? 1 : -1) });
      ch.windmill = true;
    }
    for (let i = 0; i < 9; i++){
      const z = z0 + R(0, CH), inCorr = rng() < 0.35 + 0.2*d && !safe;
      const x = inCorr ? R(-8, 8) : (rng() < 0.5 ? -1 : 1)*R(11, 45);
      if (near(x, z, 7)) continue;
      if (Math.abs(x - riverX(z)) < 6) continue;
      add(pick(['kit_tree_round', 'kit_tree_round', 'kit_tree_pine']), x, z, R(0, 6), inCorr ? R(1.0, 1.35) : R(0.8, 1.2));
    }
    for (let i = 0; i < 3; i++){ const z = z0 + R(0, CH), x = (rng() < 0.5 ? -1 : 1)*R(10, 40); if (!near(x, z, 5) && Math.abs(x - riverX(z)) > 6) add('kit_haystack', x, z, R(0, 6), R(0.8, 1.2), 0, true); }
    for (let i = 0; i < 3; i++){ const z = z0 + R(0, CH), x = (rng() < 0.5 ? -1 : 1)*R(12, 40); add('kit_fence', x, z, rng() < 0.5 ? 0 : Math.PI/2, 1, 0, false); }
    if (rng() < 0.3){ const z = z0 + R(5, 35), x = (rng() < 0.5 ? -1 : 1)*R(16, 30); if (!near(x, z, 9)) add('kit_house_c', x, z, rng() < 0.5 ? Math.PI/2 : -Math.PI/2); }
  }
  // balloons drift over open fields only, well clear of houses, trees and windmills
  if (!safe && biome === 1 && !ch.delivery && rng() < 0.3 + 0.15*d){
    for (let tries = 0; tries < 6; tries++){
      const z = z0 + R(8, 32), x = R(-7, 7);
      const clear = ch.statics.every(it => Math.hypot(it.pos.x - x, it.pos.z - z) > (it.kit.startsWith('kit_tree') || it.kit === 'kit_haystack' ? 7 : 13));
      if (clear){ ch.balloons.push({ pos: new THREE.Vector3(x, 0, z), baseY: groundH(x, z) + R(9, 14), ph: R(0, 6.28) }); break; }
    }
  }
  if (!safe && rng() < 0.15 + 0.35*d){
    const n = 2 + Math.floor(rng()*3), y = R(5, 15), x = R(-6, 6), z = z0 + R(20, 40);
    for (let i = 0; i < n; i++) ch.crows.push({ pos: new THREE.Vector3(x + R(-1.5, 1.5), y + R(-1, 1), z + i*R(1.2, 2.2)), ph: R(0, 6.28), spd: R(5, 7) + 3*d, wob: R(0.5, 1.2) });
  }
  for (let i = 0; i < 2; i++) ch.deco.push({ kit: 'kit_cloud', pos: new THREE.Vector3((rng() < 0.5 ? -1 : 1)*R(20, 70), R(26, 40), z0 + R(0, CH)), yaw: R(0, 6), scale: R(1.5, 3.2), cols: [] });

  const arcs = ci < 1 ? 1 : 1 + (rng() < 0.6 ? 1 : 0);
  for (let a = 0; a < arcs; a++){
    const zs = z0 + R(2, 26), x0 = R(-6, 6), y0 = R(4.5, 14), ax = R(-2.5, 2.5), ay = R(-2, 2);
    for (let k = 0; k < 6; k++){
      const t = k/5, p = new THREE.Vector3(x0 + ax*Math.sin(t*Math.PI), y0 + ay*Math.sin(t*Math.PI*0.5 + 0.3), zs + k*2.4);
      if (p.y - groundH(p.x, p.z) < 3) continue;
      if (pointClear(ch, p, 1.6)) ch.pickups.push({ type: 'kit_feather', pos: p, taken: false, counted: false });
    }
  }
  const extra = (type, prob) => { if (safe || rng() > prob) return;
    for (let tries = 0; tries < 6; tries++){
      const p = new THREE.Vector3(R(-7, 7), R(4.5, 15), z0 + R(4, 36));
      if (p.y - groundH(p.x, p.z) > 3 && pointClear(ch, p, 2)){ ch.pickups.push({ type, pos: p, taken: false, counted: false }); return; }
    } };
  extra('kit_bottle', 0.22); extra('kit_note', 0.3);

  const W = 180, NX = 45, NZ = 10, geo = new THREE.PlaneGeometry(W, CH, NX, NZ); geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), z = pos.getZ(i) + z0 + CH/2;
    pos.setY(i, groundH(x, z)); pos.setZ(i, z);
    groundColor(x, z, col); cols[i*3] = col.r; cols[i*3+1] = col.g; cols[i*3+2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  ch.ground = new THREE.Mesh(geo, groundMat); ch.ground.receiveShadow = true; scene.add(ch.ground);
  if (biome === 1 || fieldsWeight(z0) > 0.5){
    const wg = new THREE.PlaneGeometry(9, CH, 1, 12); wg.rotateX(-Math.PI/2);
    const wp = wg.attributes.position;
    for (let i = 0; i < wp.count; i++){ const z = wp.getZ(i) + z0 + CH/2; wp.setX(i, wp.getX(i) + riverX(z)); wp.setZ(i, z); wp.setY(i, -0.35); }
    ch.water = new THREE.Mesh(wg, waterMat); scene.add(ch.water);
  }
  return ch;
}
function dropChunk(ch){ scene.remove(ch.ground); ch.ground.geometry.dispose(); if (ch.water){ scene.remove(ch.water); ch.water.geometry.dispose(); } }

// ======================= game state =======================
const G = { phase: 'menu', mode: 'level', p: new THREE.Vector3(0, 8, 0), vx: 0, vy: 0, speed: 11, dist: 0, feathers: 0, featherTotal: 0, score: 0,
  sleep: 100, soothe: 0, calmSum: 0, calmN: 0, notes: 0, lullaby: 0, hitT: 0, shake: 0, paused: false, t: 0, result: null };
let deliveryChunks = new Set();
const keys = new Set();
const steerInput = { x: 0, y: 0, active: false };
let toastText = '', toastT = 0;
const toast = (msg, secs = 1.1) => { toastText = msg; toastT = secs; };

function resetWorld(seed, phase){
  for (const ch of chunks.values()) dropChunk(ch); chunks.clear();
  SEED = seed; G.phase = phase; G.p.set(0, 8.5, 0); G.vx = G.vy = 0; G.speed = TUNE.speedStart; G.dist = 0; G.feathers = 0; G.featherTotal = 0; G.score = 0;
  G.sleep = 100; G.soothe = 0; G.calmSum = 0; G.calmN = 0; G.notes = 0; G.lullaby = 0; G.hitT = 0; G.shake = 0; G.t = 0; G.result = null; G.paused = false;
  deliveryChunks = new Set(G.mode === 'level' ? [Math.floor(TUNE.goal/CH)] : Array.from({ length: 40 }, (_, n) => (2*n + 2)*SEG + 4));
  com = null; fxParts.length = 0; floaters.length = 0; puffList.length = 0;
  streamChunks();
}
function streamChunks(){
  const c0 = Math.floor((G.p.z - 30)/CH), c1 = Math.floor((G.p.z + 250)/CH);
  for (const [k, ch] of chunks) if (k < c0) { dropChunk(ch); chunks.delete(k); }
  for (let k = Math.max(0, c0); k <= c1; k++) if (!chunks.has(k)) chunks.set(k, genChunk(k));
}

// ======================= baby on a string (pendulum + air drag) =======================
const PIVOT = new THREE.Vector3(0, 0.3267, -0.0036), LEN = 0.20, GRAV = new THREE.Vector3(0, -9.81, 0), DRAG = 0.32;
let com = null, comPrev = null, lastP = null, swingAng = 0;
const lastX = new THREE.Vector3(-1, 0, 0), _P = new THREE.Vector3(), _T = new THREE.Vector3(), _u = new THREE.Vector3(), _b = new THREE.Vector3(),
      _x = new THREE.Vector3(), _z = new THREE.Vector3(), _mb = new THREE.Matrix4();
function updateBaby(dt){
  grip.getWorldPosition(_P); tip.getWorldPosition(_T);
  if (!com){ com = _P.clone().add(new THREE.Vector3(0, -LEN, 0)); comPrev = com.clone(); lastP = _P.clone(); }
  const steps = 6, h = Math.max(1e-4, dt)/steps;
  const damp = Math.exp(-(G.lullaby > 0 ? 18 : 3.2)*h);
  const dP = _P.clone().sub(lastP).divideScalar(steps);
  for (let i = 1; i <= steps; i++){
    const Pi = lastP.clone().addScaledVector(dP, i);
    const vel = com.clone().sub(comPrev);
    const acc = GRAV.clone().addScaledVector(vel, -DRAG/h);
    comPrev.copy(com);
    com.add(dP).addScaledVector(vel.sub(dP), damp).addScaledVector(acc, h*h);
    const d = com.clone().sub(Pi).setLength(LEN);
    const ymax = -LEN*0.2;
    if (d.y > ymax){ const hz = Math.sqrt(LEN*LEN - ymax*ymax), hl = Math.hypot(d.x, d.z) || 1; d.set(d.x/hl*hz, ymax, d.z/hl*hz); }
    com.copy(Pi).add(d);
  }
  const vP = dP.clone().multiplyScalar(steps/Math.max(1e-4, dt));
  const eq = GRAV.clone().addScaledVector(vP, -DRAG).normalize();
  swingAng = Math.acos(THREE.MathUtils.clamp(com.clone().sub(_P).normalize().dot(eq), -1, 1));
  lastP.copy(_P);
  _u.copy(_P).sub(com).normalize(); _b.copy(_T).sub(_P).normalize();
  _x.copy(_b).addScaledVector(_u, -_b.dot(_u));
  if (_x.lengthSq() > 1e-6) lastX.copy(_x.normalize().negate());
  _x.copy(lastX); _z.crossVectors(_x, _u).normalize(); _x.crossVectors(_u, _z).normalize();
  _mb.makeBasis(_x, _u, _z); babyHolder.quaternion.setFromRotationMatrix(_mb);
  babyHolder.position.copy(_P).sub(PIVOT.clone().applyQuaternion(babyHolder.quaternion));
}
function kickBaby(v){ if (com) comPrev.addScaledVector(v, -1/60); }

// ======================= pickup effects =======================
const fxParts = [], floaters = [];
function featherBurst(pos){
  for (let i = 0; i < 9; i++){
    const dir = new THREE.Vector3(Math.random()-0.5, Math.random()*0.8, Math.random()-0.5).normalize();
    fxParts.push({ kind: 0, pos: pos.clone(), vel: dir.multiplyScalar(2.2 + Math.random()*2).add(new THREE.Vector3(0, 0.6, G.speed*0.55)),
      rot: new THREE.Euler(Math.random()*6, Math.random()*6, Math.random()*6), spin: new THREE.Vector3((Math.random()-0.5)*9, (Math.random()-0.5)*9, (Math.random()-0.5)*9),
      age: 0, life: 0.9 + Math.random()*0.5, size: 0.28 + Math.random()*0.14 });
  }
  for (let i = 0; i < 14; i++){
    const dir = new THREE.Vector3(Math.random()-0.5, Math.random()-0.3, Math.random()-0.5).normalize();
    fxParts.push({ kind: 1, pos: pos.clone(), vel: dir.multiplyScalar(3 + Math.random()*3).add(new THREE.Vector3(0, 0, G.speed*0.6)),
      rot: new THREE.Euler(), spin: new THREE.Vector3(4, 6, 0), age: 0, life: 0.45 + Math.random()*0.35, size: 0.7 + Math.random()*0.8 });
  }
  if (fxParts.length > 230) fxParts.splice(0, fxParts.length - 230);
  const r = fxRings.find(x => x.age > 0.45) || fxRings[0];
  r.age = 0; r.mesh.position.copy(pos); r.mesh.visible = true;
  floaters.push({ pos: pos.clone(), text: '+10 💤', age: 0 });
  chime();
}
const _fxm = new THREE.Matrix4(), _fxq = new THREE.Quaternion(), _fxs = new THREE.Vector3();
function updateFX(dt){
  let nf = 0, ns = 0;
  for (let i = fxParts.length - 1; i >= 0; i--){
    const p = fxParts[i]; p.age += dt;
    if (p.age >= p.life){ fxParts.splice(i, 1); continue; }
    if (p.kind === 0){ p.vel.y -= 1.6*dt; p.vel.multiplyScalar(Math.exp(-2.2*dt)); p.vel.x += Math.sin(p.age*7 + i)*dt*1.5; }
    else p.vel.multiplyScalar(Math.exp(-3.5*dt));
    p.pos.addScaledVector(p.vel, dt);
    p.rot.x += p.spin.x*dt; p.rot.y += p.spin.y*dt; p.rot.z += p.spin.z*dt;
    const k = 1 - Math.pow(p.age/p.life, 3);
    _fxq.setFromEuler(p.rot); _fxs.setScalar(p.size*k); _fxm.compose(p.pos, _fxq, _fxs);
    if (p.kind === 0) fxFeathers.setMatrixAt(nf++, _fxm); else fxSparks.setMatrixAt(ns++, _fxm);
  }
  fxFeathers.count = nf; fxSparks.count = ns;
  fxFeathers.instanceMatrix.needsUpdate = fxSparks.instanceMatrix.needsUpdate = true;
  for (const r of fxRings){
    if (r.age > 0.45){ r.mesh.visible = false; continue; }
    r.age += dt; const u = r.age/0.45;
    r.mesh.scale.setScalar(0.8 + u*1.5); r.mesh.material.opacity = 0.85*(1 - u)*(1 - u);
    r.mesh.position.z += G.speed*0.5*dt; r.mesh.quaternion.copy(camera.quaternion);
  }
  for (let i = floaters.length - 1; i >= 0; i--){ floaters[i].age += dt; if (floaters[i].age > 1.0) floaters.splice(i, 1); }
}
// soft chime that climbs while you chain feathers together
let actx = null, combo = 0, comboT = 0;
function chime(){
  if (!sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = [0, 2, 4, 7, 9, 12, 14, 16];
    const f = 660 * Math.pow(2, notes[Math.min(combo, notes.length-1)]/12);
    combo++; comboT = 1.2;
    const now = actx.currentTime;
    for (const [mul, vol] of [[1, 0.09], [2, 0.03]]){
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f*mul;
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      o.connect(g).connect(actx.destination); o.start(now); o.stop(now + 0.5);
    }
  } catch (e) { /* audio is optional */ }
}

// ======================= per-frame instancing =======================
const counts = {};
function putInst(kit, pos, yaw, scale, extraRot){
  const im = INST[kit]; if (!im) return; const i = counts[kit] || 0; if (i >= im.instanceMatrix.count) return;
  _q.setFromAxisAngle(UP, yaw); if (extraRot) _q.multiply(extraRot);
  _s.setScalar(scale); _m4.compose(pos, _q, _s); im.setMatrixAt(i, _m4); counts[kit] = i + 1;
}
const _rz = new THREE.Quaternion(), _rl = new THREE.Quaternion(), _rr = new THREE.Quaternion(), ZAX = new THREE.Vector3(0, 0, 1);
const puffList = [];
function drawWorld(dt){
  for (const k in counts) counts[k] = 0;
  ring.visible = glow.visible = false;
  for (const ch of chunks.values()){
    for (const it of ch.statics) putInst(it.kit, it.pos, it.yaw, it.scale);
    for (const it of ch.deco) putInst(it.kit, it.pos, it.yaw, it.scale);
    for (const w of ch.windmills){ _rz.setFromAxisAngle(ZAX, w.ang); putInst('kit_windmill_blades', w.hub, 0, 1, _rz); }
    for (const b of ch.balloons){ _v.set(b.pos.x, b.baseY + Math.sin(G.t*0.7 + b.ph)*1.2, b.pos.z); putInst('kit_balloon', _v, b.ph, 1); }
    for (const c of ch.crows){
      const f = Math.sin(G.t*11 + c.ph)*0.7;
      putInst('kit_crow', c.pos, 0, 1);
      _rl.setFromAxisAngle(ZAX, f); putInst('kit_crow_wing_l', c.pos, 0, 1, _rl);
      _rr.setFromAxisAngle(ZAX, -f); putInst('kit_crow_wing_r', c.pos, 0, 1, _rr);
    }
    for (const pk of ch.pickups) if (!pk.taken){
      _v.copy(pk.pos); _v.y += Math.sin(G.t*2.4 + pk.pos.z)*0.18;
      if (pk.type === 'kit_feather'){ _rz.setFromAxisAngle(ZAX, 0.5); putInst(pk.type, _v, G.t*2.2 + pk.pos.z, 1.8, _rz); }
      else putInst(pk.type, _v, G.t*2.2 + pk.pos.z, 1.45);
    }
    if (ch.delivery && !ch.delivery.done){
      ring.visible = glow.visible = true;
      ring.position.copy(ch.delivery.ring); ring.rotation.set(0, 0, G.t*0.6); ring.scale.setScalar(1 + 0.05*Math.sin(G.t*4));
      glow.position.copy(ch.delivery.glow); glow.rotation.y = Math.PI; glow.scale.set(0.55, 0.62, 1);
    }
  }
  for (const k in INST){ INST[k].count = counts[k] || 0; INST[k].instanceMatrix.needsUpdate = true; }
  featherOutline.instanceMatrix.array.set(INST.kit_feather.instanceMatrix.array.subarray(0, INST.kit_feather.count*16));
  featherOutline.count = INST.kit_feather.count; featherOutline.instanceMatrix.needsUpdate = true;
  let n = 0;
  for (let i = puffList.length - 1; i >= 0; i--){ const p = puffList[i]; p.age += dt; p.pos.y += dt*1.6; p.pos.x += dt*0.5;
    if (p.age > 3) { puffList.splice(i, 1); continue; }
    const s = (0.6 + p.age*0.45) * (p.age > 2.2 ? (3 - p.age)/0.8 : 1);
    _s.setScalar(s); _q.identity(); _m4.compose(p.pos, _q, _s); if (n < 260) puffs.setMatrixAt(n++, _m4); }
  puffs.count = n; puffs.instanceMatrix.needsUpdate = true;
}

// ======================= gameplay =======================
function hitTest(p, r){
  for (const ch of chunks.values()){
    if (Math.abs(ch.z0 + CH/2 - p.z) > CH) continue;
    for (const it of ch.statics) for (const c of it.cols) if (colDist(c, p) < r) return it.kit;
    for (const w of ch.windmills){
      if (Math.abs(w.hub.z - p.z) > 3) continue;
      for (let k = 0; k < 4; k++){
        const a = w.ang + k*Math.PI/2, tipP = w.hub.clone().add(new THREE.Vector3(Math.cos(a)*7, Math.sin(a)*7, 0));
        if (colDist({ t: 'cap', a: w.hub, b: tipP, r: 1.0 }, p) < r) return 'kit_windmill_blades';
      }
    }
    for (const b of ch.balloons){
      _v.set(b.pos.x, b.baseY + Math.sin(G.t*0.7 + b.ph)*1.2 + 5.0, b.pos.z);
      if (p.distanceTo(_v) < 2.8 + r) return 'kit_balloon';
    }
    for (const c of ch.crows) if (p.distanceTo(c.pos) < 0.5 + r) return 'kit_crow';
  }
  return null;
}
const HIT_NAMES = { kit_clothesline: 'Tangled in the laundry!', kit_windmill_blades: 'Whacked by a sail!', kit_crow: 'Crow attack!', kit_balloon: 'Bonk! Balloon!',
  kit_church: 'Ouch, the steeple!', kit_house_a: 'Rooftop!', kit_house_b: 'Rooftop!', kit_house_c: 'Rooftop!', kit_haystack: 'Hay everywhere!',
  kit_tree_round: 'Into the leaves!', kit_tree_pine: 'Pine needles!' };

function finish(success, message){
  const calm = G.calmN ? Math.round(G.calmSum/G.calmN) : 0;
  let stars = success ? 1 : 0;
  if (success && calm >= 70) stars++;
  if (success && G.featherTotal && G.feathers >= 0.6*G.featherTotal) stars++;
  G.phase = 'end';
  G.result = { success, title: success ? 'Delivered!' : (message.startsWith('The baby') ? 'Waaah!' : 'Oops!'), message,
    stars: G.mode === 'level' ? stars : 0, distance: Math.round(G.dist), feathers: G.feathers, calm, score: Math.round(G.score) };
}

function gameplay(dt){
  if (G.hitT > 0) G.hitT -= dt;
  else {
    const head = new THREE.Vector3(0, 0.05, 0.75).applyQuaternion(storkPivot.quaternion).add(G.p);
    const hit = hitTest(G.p, 0.42) || hitTest(head, 0.2) || (com && hitTest(com.clone().add(new THREE.Vector3(0, -0.12, 0)), 0.2));
    if (hit){
      G.hitT = 1.2; G.shake = 0.5; G.sleep -= TUNE.hitCost; G.vx *= -0.6; G.vy = 3;
      kickBaby(new THREE.Vector3((Math.random()-0.5)*6, 3, -4));
      toast(HIT_NAMES[hit] || 'Bump!');
    }
  }
  for (const ch of chunks.values()) for (const s of ch.smokes){
    if (Math.abs(s.p.z - G.p.z) < 1.8 && Math.abs(s.p.x - G.p.x) < 1.8 && G.p.y > s.p.y - 0.5 && G.p.y < s.p.y + 6){
      kickBaby(new THREE.Vector3((Math.random()-0.5)*3, (Math.random()-0.5)*2, 0)); if (Math.random() < dt*3) toast('Smoky!', 0.6);
    }
  }
  for (const ch of chunks.values()) for (const pk of ch.pickups){
    if (pk.taken) continue;
    if (pk.pos.z < G.p.z - 3){ if (!pk.counted && pk.type === 'kit_feather'){ pk.counted = true; G.featherTotal++; } continue; }
    if (G.p.distanceTo(pk.pos) < 1.6 || (com && com.distanceTo(pk.pos) < 1.1)){
      pk.taken = true;
      if (pk.type === 'kit_feather'){ G.feathers++; G.featherTotal++; pk.counted = true; G.score += 10; G.sleep = Math.min(100, G.sleep + TUNE.featherCalm); G.soothe = 0.6; featherBurst(pk.pos); }
      else if (pk.type === 'kit_bottle'){ G.sleep = Math.min(100, G.sleep + TUNE.bottleGain); G.score += 25; toast('Mmm, milk'); }
      else if (pk.type === 'kit_note'){ G.notes++; G.score += 25;
        if (G.notes >= 3){ G.notes = 0; G.lullaby = TUNE.lullabySecs; toast('♪ Lullaby! ♪', 1.6); } else toast('♪', 0.5); }
    }
  }
  const deg = THREE.MathUtils.radToDeg(swingAng);
  if (G.lullaby > 0){ G.lullaby -= dt; G.sleep = Math.min(100, G.sleep + 10*dt); }
  else if (deg > TUNE.swingFree) G.sleep -= (deg - TUNE.swingFree)*TUNE.swingDrain*dt;
  else if (deg < TUNE.swingFree*0.6) G.sleep = Math.min(100, G.sleep + TUNE.calmRegen*dt);
  if (G.soothe > 0) G.soothe -= dt;
  G.calmSum += G.sleep; G.calmN++;
  G.score += G.speed*dt*0.5;
  setBabyAnim(G.sleep < 40 ? 'Baby_Wiggle' : 'Baby_Sleep');
  for (const ch of chunks.values()){
    const dv = ch.delivery; if (!dv || dv.done) continue;
    if (G.p.z >= dv.ring.z){
      dv.done = true;
      const off = Math.hypot(G.p.x - dv.ring.x, G.p.y - dv.ring.y);
      if (off < 3.4){
        G.score += 500 + Math.round(G.sleep*3);
        if (G.mode === 'level'){ finish(true, G.sleep > 70 ? 'Dropped right down the chimney, and the baby never woke up.' : 'Delivered, though the little one is a bit fussy.'); return; }
        G.sleep = Math.min(100, G.sleep + 40); toast('Delivered! +500', 1.5);
      } else if (G.mode === 'level'){
        toast('Missed the chimney! Next house…', 1.5);
        let k = Math.floor(G.p.z/CH) + 5; while (biomeOf(k*CH + CH/2) !== 0) k++; deliveryChunks.add(k);
      } else toast('Missed the chimney!', 1.2);
    }
  }
  if (G.sleep <= 0){ G.sleep = 0; finish(false, 'The baby woke up and won’t stop crying. Fly smoother next time!'); }
}

// ======================= update / render =======================
let viewWidth = 2, viewHeight = 2;
const PRESETS = { low: { dpr: 0.75, shadows: false, shadowRes: 512 }, medium: { dpr: 1, shadows: true, shadowRes: 1024 }, high: { dpr: Math.min(devicePixelRatio, 1.5), shadows: true, shadowRes: 2048 } };
const gpuName = (() => { try { const gl = renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; } })();
const autoLevel = /mali|adreno|powervr|swiftshader/i.test(gpuName) || (navigator.maxTouchPoints > 0 && innerWidth < 900) ? 'low' : 'medium';
let qualityLevel = 'medium';
function setQuality(mode){
  if (!['auto', ...Object.keys(PRESETS)].includes(mode)) throw new RangeError('Unknown baby-delivery quality: ' + mode);
  qualityLevel = mode === 'auto' ? autoLevel : mode;
  const Q = PRESETS[qualityLevel];
  renderer.setPixelRatio(Q.dpr);
  renderer.shadowMap.enabled = Q.shadows; sun.castShadow = Q.shadows;
  if (sun.shadow.mapSize.x !== Q.shadowRes){ sun.shadow.mapSize.set(Q.shadowRes, Q.shadowRes); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  resize(viewWidth, viewHeight, true);
}
function resize(width, height, force = false){
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) return;
  viewWidth = width; viewHeight = height;
  const ratio = renderer.getPixelRatio();
  if (!force && canvas.width === Math.floor(width * ratio) && canvas.height === Math.floor(height * ratio)) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  // keep roughly a 70° horizontal view so a portrait screen still sees both sides of the street
  const vfov = THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(35))/camera.aspect));
  camera.fov = THREE.MathUtils.clamp(vfov, 55, 84);
  camera.updateProjectionMatrix();
}

function input(){
  let ix = 0, iy = 0;
  if (keys.has('left')) ix -= 1;
  if (keys.has('right')) ix += 1;
  if (keys.has('up')) iy += 1;
  if (keys.has('down')) iy -= 1;
  if (steerInput.active){ ix += steerInput.x; iy += steerInput.y; }
  // screen-left is world +x because the camera looks down +z
  return [-THREE.MathUtils.clamp(ix, -1, 1), THREE.MathUtils.clamp(iy, -1, 1)];
}

function update(deltaMs){
  if (loading || loadError || disposed) return;
  const rdt = Math.min(Math.max(deltaMs, 0) / 1000, 1/20);
  const playing = G.phase === 'play' && !G.paused;
  const dt = playing || G.phase === 'menu' ? rdt : 0;
  G.t += dt;
  if (toastT > 0) toastT -= rdt;
  if (comboT > 0){ comboT -= rdt; if (comboT <= 0) combo = 0; }

  if (G.phase === 'menu'){
    G.p.z += dt*10; G.p.x = 4*Math.sin(G.t*0.35); G.p.y = 11 + 2*Math.sin(G.t*0.5);
    G.vx = 4*0.35*Math.cos(G.t*0.35); G.vy = 0;
  } else if (playing){
    const [ix, iy] = input();
    G.speed = Math.min(TUNE.speedMax, TUNE.speedStart + G.dist/TUNE.speedRamp);
    G.vx += (ix*TUNE.steerX - G.vx)*Math.min(1, dt*TUNE.steerResponse);
    G.vy += (iy*TUNE.steerY - G.vy)*Math.min(1, dt*TUNE.steerResponse);
    G.p.x = THREE.MathUtils.clamp(G.p.x + G.vx*dt, -10, 10);
    G.p.y = THREE.MathUtils.clamp(G.p.y + G.vy*dt, 2.2, 21);
    const gh = groundH(G.p.x, G.p.z) + 1.7; if (G.p.y < gh){ G.p.y = gh; G.vy = Math.max(0, G.vy); }
    G.p.z += G.speed*dt; G.dist = G.p.z;
  }
  if (G.phase !== 'end') streamChunks();

  storkPivot.position.copy(G.p);
  const bankT = -G.vx*0.075, pitchT = -G.vy*0.045, yawT = G.vx*0.03;
  storkPivot.rotation.z += (bankT - storkPivot.rotation.z)*Math.min(1, rdt*6);
  storkPivot.rotation.x += (pitchT - storkPivot.rotation.x)*Math.min(1, rdt*6);
  storkPivot.rotation.y += (yawT - storkPivot.rotation.y)*Math.min(1, rdt*6);
  storkMixer.update(dt*(1 + 0.35*Math.max(0, G.vy/7)));
  storkModel.updateMatrixWorld(true);
  babyMixer.update(G.phase === 'end' ? rdt : dt);
  if (dt > 0) updateBaby(dt);
  for (const ch of chunks.values()){
    for (const w of ch.windmills) w.ang += w.spd*dt;
    for (const c of ch.crows){ c.pos.z -= c.spd*dt; c.pos.x += Math.sin(G.t*1.3 + c.ph)*c.wob*dt; c.pos.y += Math.cos(G.t*1.7 + c.ph)*0.4*dt; }
    for (const s of ch.smokes){ s.t -= dt; if (s.t <= 0 && Math.abs(s.p.z - G.p.z) < 90){ s.t = 0.8; puffList.push({ pos: s.p.clone(), age: 0 }); } }
  }
  if (playing) gameplay(dt);
  drawWorld(dt);
  updateFX(dt);

  const shake = G.shake > 0 ? (G.shake -= rdt, G.shake*0.6) : 0;
  const camT = G.phase === 'menu'
    ? new THREE.Vector3(G.p.x*0.5 + 5*Math.sin(G.t*0.2), G.p.y + 1.5, G.p.z - 7.5)
    : new THREE.Vector3(G.p.x*0.92, G.p.y + TUNE.camUp, G.p.z - TUNE.camBack);
  camera.position.lerp(camT, Math.min(1, rdt*5));
  camera.position.x += (Math.random()-0.5)*shake; camera.position.y += (Math.random()-0.5)*shake;
  camera.lookAt(G.p.x*0.95, G.p.y - 0.1, G.p.z + 8);
  sky.position.copy(camera.position);
  sun.position.set(G.p.x + 25, G.p.y + 60, G.p.z - 20); sun.target.position.set(G.p.x, 0, G.p.z + 10);
}

function disposeObject(root){
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials){
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

const _scr = new THREE.Vector3();
setQuality(quality);
return {
  canvas, update, setQuality,
  render(width, height){ resize(width, height); if (!loading && !loadError) renderer.render(scene, camera); },
  start(mode = 'level'){
    if (loading || loadError) return;
    if (mode !== 'level' && mode !== 'endless') throw new RangeError('Unknown baby-delivery mode: ' + mode);
    G.mode = mode; keys.clear(); steerInput.active = false;
    resetWorld(mode === 'level' ? 1 : 1 + Math.floor(Math.random()*1e6), 'play');
    toast(mode === 'level' ? 'Deliver the baby!' : 'Fly as far as you can!', 1.4);
  },
  menu(){ if (!loading && !loadError){ G.mode = 'level'; resetWorld(1, 'menu'); } },
  setPaused(paused){ if (G.phase === 'play') G.paused = !!paused; if (paused){ keys.clear(); steerInput.active = false; } },
  status(){
    const fl = [];
    for (const f of floaters){
      _scr.copy(f.pos); _scr.y += 0.4 + f.age*1.4; _scr.z += G.speed*0.6*f.age; _scr.project(camera);
      if (_scr.z >= 1) continue;   // behind the camera
      fl.push({ x: _scr.x*0.5 + 0.5, y: -_scr.y*0.5 + 0.5, text: f.text, alpha: f.age < 0.6 ? 1 : 1 - (f.age - 0.6)/0.4,
                scale: 1 + 0.25*Math.sin(Math.min(1, f.age*6)*Math.PI) });
    }
    return {
      loading, error: loadError, phase: G.phase, mode: G.mode, paused: G.paused,
      distance: Math.round(G.dist), goal: TUNE.goal, feathers: G.feathers, score: Math.round(G.score),
      sleep: Math.max(0, G.sleep), soothing: G.soothe > 0, lullaby: Math.max(0, G.lullaby), notes: G.notes,
      toast: toastT > 0 ? toastText : '', toastAlpha: Math.max(0, Math.min(1, toastT*4)),
      floaters: fl, result: G.result, qualityLevel,
    };
  },
  key(key, down){
    if (!['left', 'right', 'up', 'down'].includes(key)) return;
    if (down) keys.add(key); else keys.delete(key);
  },
  steer(x, y){
    if (x === null || y === null){ steerInput.active = false; return; }
    steerInput.active = true;
    steerInput.x = THREE.MathUtils.clamp(x, -1, 1); steerInput.y = THREE.MathUtils.clamp(y, -1, 1);
  },
  suspend(){ keys.clear(); steerInput.active = false; },
  dispose(){
    disposed = true;
    for (const ch of chunks.values()) dropChunk(ch); chunks.clear();
    storkMixer?.stopAllAction(); babyMixer?.stopAllAction();
    scene.traverse((object) => object.shadow?.dispose?.());
    disposeObject(scene);
    for (const n in KIT) KIT[n].geo.dispose();
    for (const m of [kitMat, groundMat, waterMat, ...outlineMats]) m.dispose();
    gradTex.dispose();
    try { actx?.close(); } catch (e) { /* ignore */ }
    renderer.dispose();
    renderer.forceContextLoss();
  },
};
}
