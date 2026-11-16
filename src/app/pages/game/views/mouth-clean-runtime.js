// Tooth Explorer – Mouth Level (three.js r170)
// Adapted from assets/mouth-clean/game.js for the device screen and chapter lifecycle.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createMouthClean() {
let loadingMessage = 'Loading mouth world...';
let flashMessage = '';
const canvas = document.createElement('canvas');
const MOUTH_URL = 'assets/mouth-clean/MouthScene.glb';
const HERO_URL = 'assets/mouth-clean/ToothExplorer.glb';
let disposed = false, elapsed = 0, timerId = 0;
const timers = new Map();
const setTimeout = (callback, delay) => { timers.set(++timerId, { callback, at: elapsed + delay }); return timerId; };
const clearTimeout = (id) => timers.delete(id);
function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}
// ======================= world constants =======================
const HERO_SCALE = 0.31;          // hero is tiny compared to the mouth
const LANE_X = 2.6;               // the 2D "track" runs along the top of the tongue's near lobe
let CUT_X = 3.2;                  // moves with the hero: everything nearer the camera than this is cut / ghosted
const X_MIN = -4.6, X_MAX = 4.6;   // how far he can walk away from / toward the camera
const CUT_AHEAD = 0.65;               // everything nearer the camera than this is cut away
const Z_MIN = -24.4, Z_MAX = 7.2; // throat end … behind the front teeth
const WALK = 1.25, RUN = 2.2, JUMP_V = 4.9, GRAV = 15;
const STEP = 0.24;                // biggest bump he can walk up without jumping

// ======================= renderer / scene =======================

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0105);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.0;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.enabled = false;

scene.add(new THREE.HemisphereLight(0xffd0c8, 0x2a0408, 0.32));
const key = new THREE.DirectionalLight(0xffe8dc, 0.8);
key.position.set(14, 16, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
key.shadow.bias = -0.0008; key.shadow.normalBias = 0.03;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xffb0a0, 0.22); fill.position.set(10, 2, -6); scene.add(fill);
const warm = new THREE.PointLight(0xff6a50, 12, 20, 1.6); warm.position.set(0, 6, -4.4); scene.add(warm);
const throatGlow = new THREE.PointLight(0xff3a2a, 16, 16, 1.8); throatGlow.position.set(1, 3, -15.8); scene.add(throatGlow);
const heroLamp = new THREE.SpotLight(0xfff0c4, 70, 12, 0.5, 0.45, 1.1); scene.add(heroLamp, heroLamp.target);
heroLamp.castShadow = true; heroLamp.shadow.mapSize.set(1024, 1024); heroLamp.shadow.bias = -0.002;
const lampGlow = new THREE.PointLight(0xffe2a0, 3, 1.6, 2); scene.add(lampGlow);       // little halo around the helmet
// visible beam: additive cone that fades with distance
const BEAM_LEN = 5.5;
const beamGeo = new THREE.ConeGeometry(1.3, BEAM_LEN, 32, 1, true);
beamGeo.translate(0, -BEAM_LEN / 2, 0); beamGeo.rotateX(-Math.PI / 2);                 // apex at origin, opens along +Z
const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uLen: { value: BEAM_LEN }, uColor: { value: new THREE.Color('#ffe9b0') }, uStr: { value: 0.22 } },
  vertexShader: `varying float vD; varying vec3 vN; varying vec3 vV;
    void main(){ vD = position.z; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uLen; uniform vec3 uColor; uniform float uStr; varying float vD; varying vec3 vN; varying vec3 vV;
    void main(){ float f = 1. - clamp(vD/uLen,0.,1.); float edge = pow(abs(dot(vN,vV)), 1.5);
      gl_FragColor = vec4(uColor * uStr * f * f * edge, 1.); }`
}));
beam.renderOrder = 10; scene.add(beam);

// cut-away plane: keep x <= CUT_X
const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), CUT_X);
const clipList = [cutPlane];

// ======================= materials (cartoon / cel-shaded) =======================
const gradTex = (() => {                       // 3-band toon ramp
  const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
})();
const toon = (o) => new THREE.MeshToonMaterial({ gradientMap: gradTex, ...o });
const PALETTE = {
  M_Enamel:    { color: '#fff3dc' },
  M_Gum:       { color: '#f0435a', side: THREE.DoubleSide },
  M_Tongue:    { color: '#ff6f7d' },
  M_MouthWall: { color: '#c42638' },
  M_Throat:    { vertexColors: true, side: THREE.DoubleSide },
  M_Uvula:     { color: '#ff7a86' },
  M_Lip:       { color: '#e8344a', side: THREE.DoubleSide },
  M_Plaque:    { color: '#ffc531' },
  M_Saliva:    { color: '#e6f7ff', transparent: true, opacity: 0.55, depthWrite: false, emissive: '#7fb8d6', emissiveIntensity: 0.25 },
};
const matCache = {}, ghostCache = {};
const envTex = scene.environment;
const salivaMat = () => new THREE.MeshPhysicalMaterial({
  color: '#fff4f4', roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.35, ior: 1.34,
  attenuationColor: new THREE.Color('#ffd6d6'), attenuationDistance: 1.2,
  clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMap: envTex, envMapIntensity: 1.6,
  transparent: true, opacity: 0.95, depthWrite: false });
const fixMat = (m) => {
  if (m.name === 'M_Saliva') return (matCache.M_Saliva ??= salivaMat());
  const p = PALETTE[m.name]; return p ? (matCache[m.name] ??= toon({ ...p })) : m; };
// semi-transparent "ghost" version for whatever sits between the camera and the hero
const ghostPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -CUT_X);   // keeps x >= CUT_X
const ghostMat = (name) => ghostCache[name] ??= toon({ ...PALETTE[name], side: THREE.FrontSide, transparent: true,
  opacity: 0.32, depthWrite: false, clippingPlanes: [ghostPlane] });
const ghosts = [];
const GHOSTED = new Set(['M_Enamel', 'M_Plaque']);   // only the near teeth (and their plaque) turn see-through
const NEVER_CUT = new Set(['M_Tongue', 'M_Saliva']); // the tongue stays whole and solid
function setCut(on) {
  for (const [name, m] of Object.entries(matCache)) {
    m.clippingPlanes = (on && !NEVER_CUT.has(name)) ? clipList : null;
    m.needsUpdate = true;
  }
  for (const g of ghosts) g.visible = on;
}

// ======================= state =======================
let hero, mixer, actions = {}, current, groundMeshes = [], germs = [], cleaned = 0, sideView = true;
const S = { x: LANE_X, z: 4.5, y: 2, vy: 0, onGround: false, face: -1, fx: 0, fz: -1, busy: false, moving: false };   // face -1 → toward throat (screen right)
const ray = new THREE.Raycaster(); const DOWN = new THREE.Vector3(0, -1, 0);
const loader = new GLTFLoader();

function groundBelow(z, fromY, x = S.x) {
  ray.set(new THREE.Vector3(x, fromY + 0.5, z), DOWN); ray.far = 60;
  const hit = ray.intersectObjects(groundMeshes, false)[0];
  return hit ? hit.point.y : -50;
}

// ======================= load mouth =======================
loader.load(MOUTH_URL, (g) => {
  if (disposed) { disposeObject(g.scene); return; }
  const mouth = g.scene;
  mouth.updateMatrixWorld(true);
  mouth.traverse((o) => {
    if (!o.isMesh) return;
    o.material = fixMat(o.material);
    o.receiveShadow = true;
    o.castShadow = false;            // mouth parts never shadow the tongue — only the hero & germs do
    if (o.name === 'Tongue' || o.name === 'Throat' || o.name.startsWith('Tooth_lower')) groundMeshes.push(o);
    if (o.name === 'Throat') {
      const pos = o.geometry.attributes.position, col = new Float32Array(pos.count * 3);
      const a = new THREE.Color('#7a0c12'), b = new THREE.Color('#080102'), c = new THREE.Color(), v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const t = THREE.MathUtils.clamp((-v.z - 8) / 14, 0, 1);
        c.copy(a).lerp(b, Math.pow(t, 0.9)); col.set([c.r, c.g, c.b], i * 3);
      }
      o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (o.material === matCache.M_Saliva) o.renderOrder = 2;
    else if (PALETTE[o.material.name] || Object.values(matCache).includes(o.material)) {
      const name = Object.keys(matCache).find(k => matCache[k] === o.material);
      if (name && GHOSTED.has(name)) { const gm = new THREE.Mesh(o.geometry, ghostMat(name)); gm.renderOrder = 5; gm.raycast = () => {}; o.add(gm); ghosts.push(gm); }
    }
  });
  scene.add(mouth);
  mouth.updateMatrixWorld(true);
  setupDrips(mouth);
  slimUvula(mouth);
  setCut(true);
  spawnGerms();
  loadHero();
}, undefined, (e) => { loadingMessage = 'Could not load the mouth: ' + (e.message || e); });

// ======================= plaque germs along the track =======================
const germMat = toon({ color: '#ffc531' });
const eyeW = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const eyeB = new THREE.MeshBasicMaterial({ color: '#111111' });
const blobGeo = new THREE.SphereGeometry(1, 18, 14), eyeGeo = new THREE.SphereGeometry(1, 12, 10);
function makeGerm(size) {
  const gp = new THREE.Group();
  const n = 7 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(blobGeo, germMat); const r = size * (0.35 + Math.random() * 0.35);
    m.scale.setScalar(r); m.position.set((Math.random() - .5) * size * .7, r * 0.8 + Math.random() * size * .5, (Math.random() - .5) * size);
    m.castShadow = true; gp.add(m);
  }
  for (const s of [-1, 1]) {        // grumpy little eyes facing the camera (+X)
    const w = new THREE.Mesh(eyeGeo, eyeW); w.scale.setScalar(size * 0.17); w.position.set(size * 0.42, size * 0.95, s * size * 0.2); gp.add(w);
    const p = new THREE.Mesh(eyeGeo, eyeB); p.scale.setScalar(size * 0.08); p.position.set(size * 0.56, size * 0.93, s * size * 0.2); gp.add(p);
  }
  return gp;
}
function spawnGerms() {
  const spots = []; for (let z = 5.8; z > -23.3; z -= 1.35 + Math.random() * 0.5) spots.push(z);
  for (const z of spots) {
    const gx = THREE.MathUtils.lerp(-3.4, 3.6, Math.random());
    const y = groundBelow(z, 4, gx);   // start below the throat's ceiling
    if (y < -40) continue;
    const size = 0.2 + Math.random() * 0.14;
    const gp = makeGerm(size); gp.position.set(gx, y - 0.03, z);
    scene.add(gp); germs.push({ g: gp, x: gx, z, y, alive: true, t: 0, phase: Math.random() * 6 });
  }

}

// ======================= hero =======================
function loadHero() {
  loader.load(HERO_URL, (g) => {
    if (disposed) { disposeObject(g.scene); return; }
    hero = g.scene; hero.scale.setScalar(HERO_SCALE);
    hero.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const conv = (m) => {
        if (m.name === 'Outline') return new THREE.MeshBasicMaterial({ color: 0x05060a, side: THREE.FrontSide, name: 'Outline' });
        const e = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
        return toon({ color: m.color, emissive: e ? m.emissive : 0x000000, emissiveIntensity: e ? 1.5 : 0, side: THREE.FrontSide, name: m.name });
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    scene.add(hero);
    mixer = new THREE.AnimationMixer(hero);
    for (const c of g.animations) actions[c.name] = mixer.clipAction(c);
    for (const n of ['Poke', 'OverheadStrike', 'MarchAndWave']) { actions[n]?.setLoop(THREE.LoopOnce, 1); if (actions[n]) actions[n].clampWhenFinished = true; }
    mixer.addEventListener('finished', (e) => { if (e.action === current) { S.busy = false; } });
    S.y = groundBelow(S.z, 4); S.onGround = true;
    play('FightStance', 0);
    placeCamera(true);

    flash('Scrub the germs! →');
  }, undefined, (e) => { loadingMessage = 'Could not load the hero: ' + (e.message || e); });
}
function play(name, fade = 0.2) {
  const next = actions[name]; if (!next || next === current) return;
  next.reset(); next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1); next.play();
  if (current) current.crossFadeTo(next, fade, false);
  current = next;
}

// ======================= input =======================
const keys = new Set(); const touch = { l: false, r: false, u: false, d: false };
function jump() { if (hero && S.onGround && !S.busy) { S.vy = JUMP_V; S.onGround = false; } }

function toggleView() {
  sideView = !sideView;


  setCut(sideView);
  controls.enabled = !sideView;
  if (!sideView) { controls.target.set(S.x, S.y + 0.5, S.z); camera.position.set(S.x + 6, S.y + 3.5, S.z + 6); controls.update(); }
  else placeCamera(true);
}

// ======================= combat =======================
function attack(name) {
  if (!hero || S.busy || !S.onGround) return;
  S.busy = true; play(name, 0.08);
  if (name === 'MarchAndWave') return;
  const delay = name === 'Poke' ? 380 : 700, reach = name === 'Poke' ? 0.6 : 0.45, rad = name === 'Poke' ? 0.5 : 0.62;
  setTimeout(() => {
    const hz = S.z + S.fz * reach, hx = S.x + S.fx * reach; let hits = 0;
    for (const g of germs) {
      if (!g.alive) continue;
      if (Math.hypot(g.z - hz, g.x - hx) < rad && Math.abs(g.y - S.y) < 0.75) { g.alive = false; hits++; burst(g.g.position.clone().setY(g.y + 0.2)); }
    }
    if (hits) { cleaned += hits; flash(cleaned === germs.length ? '✨ Sparkling clean! You win! ✨' : (hits > 1 ? `Combo ×${hits}!` : 'Scrubbed!')); }
    else burst(new THREE.Vector3(hx, S.y + 0.4, hz), 6, '#d8f1ff');
  }, delay);
}

let msgT;
function flash(message) {
  flashMessage = message;
  clearTimeout(msgT);
  msgT = setTimeout(() => { flashMessage = ''; }, 1400);
}

const parts = []; const foamGeo = new THREE.SphereGeometry(0.035, 8, 6);
function burst(at, n = 24, color = '#ffffff') {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(foamGeo, new THREE.MeshStandardMaterial({ color, emissive: '#bfe9ff', emissiveIntensity: 0.6, transparent: true }));
    m.position.copy(at); m.scale.setScalar(0.6 + Math.random() * 1.6);
    parts.push({ m, v: new THREE.Vector3((Math.random() - .5) * 0.8, Math.random() * 2.2 + 0.6, (Math.random() - .5) * 2.4), life: 0.8 + Math.random() * 0.5 });
    scene.add(m);
  }
}

// ======================= camera =======================
// The left edge of the view never goes past the lips (matches the reference framing).
const LEFT_EDGE_Z = 9.9, RIGHT_EDGE_Z = Z_MIN - 1.5;
const CAM_DEFAULT = 11.5;
const cam = { dist: CAM_DEFAULT, panZ: 0, panY: 0, follow: true, freeZ: 4, freeY: 2 };
const camLook = new THREE.Vector3(), camPos = new THREE.Vector3();
function halfWidth(d) { return d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect; }
function camTarget() {
  const hw = halfWidth(cam.dist);
  let zc = cam.follow ? S.z - S.face * 0.5 + cam.panZ : cam.freeZ + cam.panZ;
  let yc = (cam.follow ? Math.max(S.y, -1) + 0.45 : cam.freeY) + cam.panY;
  const lo = RIGHT_EDGE_Z + hw, hi = LEFT_EDGE_Z - hw;
  zc = lo > hi ? hi : THREE.MathUtils.clamp(zc, lo, hi);
  return { zc, yc };
}
function placeCamera(instant) {
  const { zc, yc } = camTarget();
  const cx = cam.follow ? S.x : LANE_X;
  const tLook = new THREE.Vector3(cx - 0.6, yc, zc);
  const tPos = new THREE.Vector3(cx - 0.6 + cam.dist, yc + cam.dist * 0.3, zc);
  if (instant) { camLook.copy(tLook); camPos.copy(tPos); }
  else { const k = cam.follow ? 0.09 : 0.25; camLook.lerp(tLook, k); camPos.lerp(tPos, k); }
  camera.position.copy(camPos); camera.lookAt(camLook);
}
function zoom(f) { cam.dist = THREE.MathUtils.clamp(cam.dist * f, 3.5, 45); }
function setFollow(on) {
  if (!on) { const t = camTarget(); cam.freeZ = t.zc; cam.freeY = t.yc; cam.panZ = 0; cam.panY = 0; }
  else { cam.panZ = 0; cam.panY = 0; }
  cam.follow = on;
}
function resetCamera() { cam.dist = CAM_DEFAULT; cam.panZ = 0; cam.panY = 0; setFollow(true); }
// ======================= palatine uvula: slimmer =======================
function slimUvula(mouth) {
  const u = mouth.getObjectByName('Uvula'); if (!u) return;
  const box = new THREE.Box3().setFromObject(u);
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  const local = u.parent.worldToLocal(top.clone());
  u.geometry = u.geometry.clone();
  u.geometry.translate(-local.x + u.position.x, -local.y + u.position.y, -local.z + u.position.z);
  u.position.copy(local);
  u.scale.set(0.5, 1.08, 0.5);          // thin it out, a touch longer, still hanging from the soft palate
  uvula = u;
}

// ======================= saliva: slow, tall, stretchy drool =======================
const drips = [], drops = [], puddles = [];
let uvula = null;
const DRIP_G = 7.5;
// teardrop bead (pointy top, round bottom), unit height, origin at its top tip
const beadGeo = (() => {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * Math.PI;
    const r = Math.sin(a) * Math.pow(t, 0.55) * 0.5;      // narrow neck → fat bottom
    pts.push(new THREE.Vector2(Math.max(r, 0.0005), -t));
  }
  return new THREE.LatheGeometry(pts, 24);
})();
const strandGeo = new THREE.CylinderGeometry(1, 0.55, 1, 14, 1, true).translate(0, -0.5, 0);   // origin at top
const capGeo = new THREE.SphereGeometry(1, 18, 12);
const UP = new THREE.Vector3(0, 1, 0);

function setupDrips(mouth) {
  mouth.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name.startsWith('Saliva_Falling')) { o.visible = false; return; }
    if (!o.name.startsWith('Saliva_Drip')) return;
    const box = new THREE.Box3().setFromObject(o);
    const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - 0.06, (box.min.z + box.max.z) / 2);
    o.visible = false;                                   // replaced by the animated strand below
    const mat = matCache.M_Saliva;
    const cap = new THREE.Mesh(capGeo, mat); cap.position.copy(top); cap.scale.set(0.2, 0.11, 0.2);
    const strand = new THREE.Mesh(strandGeo, mat); strand.position.copy(top);
    const bead = new THREE.Mesh(beadGeo, mat);
    for (const m of [cap, strand, bead]) { m.renderOrder = 3; scene.add(m); }
    drips.push({ top, cap, strand, bead, state: 'rest', t: Math.random() * 6, dur: 3 + Math.random() * 8,
                 len: 0.12, maxLen: 3, beadR: 0.2, wob: Math.random() * 6 });
  });
}
function startGrow(d) {
  const floor = groundBelow(d.top.z, d.top.y - 0.2, d.top.x);
  const room = floor > -40 ? (d.top.y - floor) * 0.78 : 5;
  d.maxLen = Math.min(2.4 + Math.random() * 2.4, room);
  d.beadR = 0.16 + Math.random() * 0.1;
  d.state = 'grow'; d.t = 0; d.dur = 9 + Math.random() * 5;
}
function layoutDrip(d, len, beadR, sway) {
  // bead hangs at the end of the strand and sways like a slow pendulum
  const sx = Math.sin(sway) * 0.06 * len, sz = Math.cos(sway * 0.8) * 0.05 * len;
  const end = new THREE.Vector3(d.top.x + sx, d.top.y - len, d.top.z + sz);
  const dir = end.clone().sub(d.top); const L = dir.length(); dir.normalize();
  // strand: gets thinner as it stretches (volume-ish preserving)
  const r = THREE.MathUtils.clamp(0.07 / Math.sqrt(Math.max(L, 0.25)), 0.022, 0.09);
  d.strand.position.copy(d.top);
  d.strand.quaternion.setFromUnitVectors(UP.clone().negate(), dir);
  d.strand.scale.set(r, L, r);
  // bead: elongates slightly while hanging
  const bh = beadR * 2.6;
  d.bead.position.copy(end).addScaledVector(dir, -bh * 0.35);
  d.bead.quaternion.setFromUnitVectors(UP.clone().negate(), dir);
  d.bead.scale.set(beadR * 2, bh, beadR * 2);
  return end;
}
function spawnDrop(at, r) {
  const m = new THREE.Mesh(beadGeo, matCache.M_Saliva); m.renderOrder = 3;
  m.position.copy(at); m.scale.set(r * 2, r * 2.6, r * 2);
  scene.add(m); drops.push({ m, vy: -0.4, r });
}
function splat(at, r) {
  const mat = matCache.M_Saliva.clone(); mat.opacity = 0.9;
  const m = new THREE.Mesh(capGeo, mat); m.renderOrder = 3;
  m.position.copy(at); m.scale.set(r * 0.5, r * 0.18, r * 0.5);
  scene.add(m); puddles.push({ m, t: 0, r });
}
const dripRay = new THREE.Raycaster();
function updateDrips(dt, t) {
  for (const d of drips) {
    d.t += dt;
    const sway = t * 0.9 + d.wob;
    if (d.state === 'rest') {
      layoutDrip(d, 0.12, 0.09, sway); d.bead.visible = true;
      if (d.t > d.dur) startGrow(d);
    } else if (d.state === 'grow') {
      const k = Math.min(d.t / d.dur, 1);
      const ease = k < 0.75 ? Math.pow(k / 0.75, 1.6) * 0.8 : 0.8 + (k - 0.75) / 0.25 * 0.2;   // slow ooze, then sags
      const len = THREE.MathUtils.lerp(0.12, d.maxLen, ease);
      const br = THREE.MathUtils.lerp(0.09, d.beadR, Math.min(1, k * 1.4));
      d.lastEnd = layoutDrip(d, len, br, sway); d.curLen = len; d.curR = br;
      if (k >= 1) { spawnDrop(d.bead.position.clone(), d.curR); d.state = 'snap'; d.t = 0; d.bead.visible = false; }
    } else if (d.state === 'snap') {               // strand recoils back up to the tooth
      const k = Math.min(d.t / 0.45, 1), e = 1 - Math.pow(1 - k, 3);
      layoutDrip(d, THREE.MathUtils.lerp(d.curLen, 0.12, e), 0.05, sway);
      if (k >= 1) { d.state = 'rest'; d.t = 0; d.dur = 6 + Math.random() * 8; }
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const p = drops[i];
    p.vy -= DRIP_G * dt; p.m.position.y += p.vy * dt;
    p.m.scale.y = p.r * (2.6 + Math.min(1.2, -p.vy * 0.12));
    dripRay.set(p.m.position.clone().setY(p.m.position.y + 0.5), DOWN); dripRay.far = 0.5 + Math.abs(p.vy * dt) + p.r * 2;
    const hit = dripRay.intersectObjects(groundMeshes, false)[0];
    if (hit || p.m.position.y < -15) {
      if (hit) splat(hit.point, p.r * 2.6);
      scene.remove(p.m); drops.splice(i, 1);
    }
  }
  for (let i = puddles.length - 1; i >= 0; i--) {
    const p = puddles[i]; p.t += dt;
    const spread = Math.min(1, p.t * 2.5);
    p.m.scale.set(p.r * (0.5 + spread * 0.8), p.r * 0.16 * (1 - spread * 0.55), p.r * (0.5 + spread * 0.8));
    p.m.material.opacity = 0.9 * Math.max(0, 1 - p.t / 3);
    if (p.t > 3) { scene.remove(p.m); p.m.material.dispose(); puddles.splice(i, 1); }
  }
}

// ======================= click / tap to move =======================
let moveTarget = null;            // { x, z, germ?, stuck }
const pickRay = new THREE.Raycaster(), ndc = new THREE.Vector2();
// target pointer: pulsing ring on the ground + bobbing arrow above it
const marker = new THREE.Group(); marker.visible = false; scene.add(marker);
const mkMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
const mkRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.22, 40).rotateX(-Math.PI / 2), mkMat);
const mkRing2 = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 24).rotateX(-Math.PI / 2), mkMat);
const mkArrow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 4).rotateX(Math.PI), mkMat);
for (const m of [mkRing, mkRing2, mkArrow]) { m.renderOrder = 6; marker.add(m); }
let mkState = 'off', mkT = 0;
function clickToMove(e) {
  if (!hero) return;
  const r = { left: 0, top: 0, width: canvas.width, height: canvas.height };                       // exact canvas rect, any DPI / zoom
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  camera.updateMatrixWorld(); pickRay.setFromCamera(ndc, camera);
  // germs first: walk up and poke
  const live = germs.filter(g => g.alive).map(g => g.g);
  const gh = pickRay.intersectObjects(live, true)[0];
  if (gh) {
    let o = gh.object; while (o.parent && !live.includes(o)) o = o.parent;
    const germ = germs.find(g => g.g === o);
    if (germ) { moveTarget = { x: germ.x, z: germ.z, germ, stuck: 0 }; showMarker(germ.x, germ.y + 0.3, germ.z, '#ffb02e'); return; }
  }
  // otherwise the first walkable surface hit (ignore anything nearer than the cut-away)
  const hits = pickRay.intersectObjects(groundMeshes, false).filter(h => h.object.name === 'Tongue' || h.point.x <= CUT_X + 0.05);   // cut-away teeth aren't clickable
  const h = hits[0]; if (!h) return;
  const x = THREE.MathUtils.clamp(h.point.x, X_MIN, X_MAX), z = THREE.MathUtils.clamp(h.point.z, Z_MIN, Z_MAX);
  moveTarget = { x, z, stuck: 0 };
  showMarker(x, h.point.y, z, '#ffe9a8');
}
function showMarker(x, y, z, col) {
  marker.position.set(x, y + 0.03, z); mkMat.color.set(col); mkMat.opacity = 0.95;
  marker.scale.setScalar(1); marker.visible = true; mkState = 'on'; mkT = 0;
}
function popMarker() { if (mkState !== 'on') return; mkState = 'pop'; mkT = 0; burst(marker.position.clone().setY(marker.position.y + 0.2), 10, '#fff4c8'); }
function fadeMarker() { if (mkState === 'on') { mkState = 'fade'; mkT = 0; } }
function clearTarget(reached) { if (!moveTarget) return; moveTarget = null; reached ? popMarker() : fadeMarker(); }
function updateMarker(dt, t) {
  if (!marker.visible) return;
  mkT += dt;
  if (mkState === 'on') {
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    mkRing.scale.setScalar(pulse); mkRing2.scale.setScalar(2 - pulse);
    mkArrow.position.y = 0.42 + Math.abs(Math.sin(t * 4)) * 0.16;   // bobbing pointer
    mkArrow.rotation.y = t * 2;
    // a germ target moves with the germ's wobble
    if (moveTarget?.germ) marker.position.y = moveTarget.germ.y + 0.03 + moveTarget.germ.g.scale.y * 0.5;
  } else if (mkState === 'pop') {             // hero reached it: quick burst and gone
    const k = Math.min(1, mkT / 0.28);
    marker.scale.setScalar(1 + k * 1.4); mkMat.opacity = 0.95 * (1 - k);
    if (k >= 1) { marker.visible = false; mkState = 'off'; }
  } else if (mkState === 'fade') {            // cancelled: soft fade
    const k = Math.min(1, mkT / 0.35);
    mkMat.opacity = 0.95 * (1 - k); marker.scale.setScalar(1 - k * 0.4);
    if (k >= 1) { marker.visible = false; mkState = 'off'; }
  }
}

// ======================= loop =======================
function resize(width, height) {
  if (canvas.width === width && canvas.height === height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function update(deltaMs) {
  const dt = Math.min(deltaMs / 1000, 0.05);
  elapsed += dt * 1000;
  const t = elapsed / 1000;
  for (const [id, timer] of timers) {
    if (timer.at <= elapsed) { timers.delete(id); timer.callback(); }
  }
  if (hero) {
    // screen-right = toward the throat (-Z); "down" on screen = toward the camera (+X)
    const right = keys.has('d') || keys.has('arrowright') || touch.r, left = keys.has('a') || keys.has('arrowleft') || touch.l;
    const up = keys.has('w') || keys.has('arrowup') || touch.u, down = keys.has('s') || keys.has('arrowdown') || touch.d;
    let mz = (left ? 1 : 0) - (right ? 1 : 0);          // +1 → toward the lips
    let mx = (down ? 1 : 0) - (up ? 1 : 0);             // +1 → toward the camera
    let autoRun = false;
    if (mx || mz) clearTarget(false);                   // keyboard / d-pad takes over
    else if (moveTarget && !S.busy) {
      const tx = moveTarget.x - S.x, tz = moveTarget.z - S.z, dist = Math.hypot(tx, tz);
      const reach = moveTarget.germ ? 0.5 : 0.12;
      if (moveTarget.germ && !moveTarget.germ.alive) clearTarget(false);
      else if (dist <= reach) {
        if (moveTarget.germ) { S.fx = tx / (dist || 1); S.fz = tz / (dist || 1); if (tz) S.face = tz > 0 ? 1 : -1; attack('Poke'); }
        clearTarget(true);
      } else {
        mx = tx / dist; mz = tz / dist; autoRun = dist > 3.5;
      }
    }
    const ml = Math.hypot(mx, mz);
    S.moving = ml > 0;
    const canMove = !S.busy || !S.onGround;
    if (ml && canMove) {
      mx /= ml; mz /= ml;
      S.fx = mx; S.fz = mz;
      if (mz) S.face = mz > 0 ? 1 : -1;
      const run = keys.has('shift') || autoRun, sp = run ? RUN : WALK;
      const px = S.x, pz = S.z;
      const nz = THREE.MathUtils.clamp(S.z + mz * sp * dt, Z_MIN, Z_MAX);
      const nx = THREE.MathUtils.clamp(S.x + mx * sp * 0.8 * dt, X_MIN, X_MAX);
      // along the track: block steps that are too high (jump instead)
      const gz = groundBelow(nz, S.y + STEP * 0.8, S.x);
      if (!(S.onGround && gz > S.y + STEP)) S.z = nz;
      // in depth: don't walk off the sides of the tongue or up a wall
      const gx = groundBelow(S.z, S.y + STEP * 0.8, nx);
      if (gx > -40 && gx < S.y + STEP && gx > S.y - 0.7) S.x = nx;
      actions.Walk?.setEffectiveTimeScale(run ? 2.6 : 1.6);
      // give up on a click target if something blocks the way (a tall step: jump with Space)
      if (moveTarget) { const prog = Math.hypot(S.x - px, S.z - pz); moveTarget.stuck = prog < sp * dt * 0.2 ? moveTarget.stuck + dt : 0; if (moveTarget.stuck > 0.5) clearTarget(false); }
    }
    // gravity / ground
    const g = groundBelow(S.z, S.y + STEP * 0.7);
    if (S.onGround) {
      if (g < S.y - STEP * 0.6) { S.onGround = false; S.vy = 0; }   // walked off an edge
      else S.y = THREE.MathUtils.lerp(S.y, g, 0.6);
    }
    if (!S.onGround) {
      S.vy -= GRAV * dt; S.y += S.vy * dt;
      if (S.vy <= 0 && S.y <= g) { S.y = g; S.vy = 0; S.onGround = true; }
      if (S.y < -12) { S.x = LANE_X; S.z = 4.5; S.y = groundBelow(S.z, 4); S.vy = 0; S.onGround = true; flash('Whoops! Back to the start'); }
    }
    // animation state
    if (!S.busy) play(S.moving ? 'Walk' : 'FightStance', 0.18);

    hero.position.set(S.x, S.y, S.z);
    const wantYaw = Math.atan2(S.fx, S.fz);                    // model faces +Z
    hero.rotation.y += (Math.atan2(Math.sin(wantYaw - hero.rotation.y), Math.cos(wantYaw - hero.rotation.y))) * Math.min(1, dt * 14);
    // jump squash: lean a touch while airborne
    hero.rotation.x = 0;
    mixer.update(S.onGround ? dt : dt * 0.4);

    heroLamp.position.set(S.x + S.fx * 0.2, S.y + 0.66, S.z + S.fz * 0.2);
    heroLamp.target.position.set(S.x + S.fx * 5, S.y + 0.05, S.z + S.fz * 5);
    lampGlow.position.set(S.x + S.fx * 0.25 + 0.12, S.y + 0.66, S.z + S.fz * 0.25);
    beam.position.copy(heroLamp.position); beam.lookAt(heroLamp.target.position);
    beam.visible = !S.busy || current !== actions.OverheadStrike;
    key.target.position.set(S.x, S.y, S.z); key.position.set(S.x + 12, S.y + 16, S.z + 6);

    CUT_X = S.x + CUT_AHEAD; cutPlane.constant = CUT_X; ghostPlane.constant = -CUT_X;
    if (sideView) {
      const t = camTarget(), want = (cam.follow ? S.z - S.face * 0.5 : cam.freeZ) + cam.panZ;
      cam.panZ += t.zc - want;           // don't let pan accumulate past the edges
      placeCamera(false);
    } else controls.update();
  }
  for (const g of germs) {
    if (g.alive) { g.g.scale.y = 1 + Math.sin(t * 3 + g.phase) * 0.06; g.g.rotation.y = Math.sin(t * 1.3 + g.phase) * 0.25; }
    else if (g.g.visible) { g.t += dt * 3; const s = Math.max(0, 1 - g.t); g.g.scale.setScalar(s); g.g.position.y += dt; if (s <= 0) g.g.visible = false; }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; p.v.y -= 8 * dt; p.m.position.addScaledVector(p.v, dt); p.m.material.opacity = Math.max(0, p.life);
    if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); parts.splice(i, 1); }
  }
  throatGlow.intensity = 14 + Math.sin(t * 1.3) * 5;
  updateDrips(dt, t);
  updateMarker(dt, t);
  if (uvula) uvula.rotation.x = Math.sin(t * 0.9) * 0.05, uvula.rotation.z = Math.sin(t * 0.7 + 1) * 0.04;
}
return {
  canvas, update,
  render(width, height) { resize(width, height); renderer.render(scene, camera); },
  status() { return { loading: !hero, message: loadingMessage, cleaned, total: germs.length, flash: flashMessage }; },
  move(x, y) { clickToMove({ clientX: x, clientY: y }); },
  key(key, down) {
    const mapped = { left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown' }[key];
    if (mapped) { if (down) keys.add(mapped); else keys.delete(mapped); }
    if (!down) return;
    if (key === 'enter' || key === 'poke') attack('Poke');
    if (key === 'smash') attack('OverheadStrike');
    if (key === 'jump') jump();
    if (key === 'view') toggleView();
    if (key === 'zoom-in') zoom(1 / 1.2);
    if (key === 'zoom-out') zoom(1.2);
  },
  suspend() { keys.clear(); clearTarget(false); },
  dispose() {
    disposed = true;
    timers.clear();
    controls.dispose();
    mixer?.stopAllAction();
    disposeObject(scene);
    scene.environment?.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
};
}
