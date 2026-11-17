// Tooth Explorer – Mouth Level (three.js r170)
// Adapted from assets/mouth-clean/game.js for the device screen and chapter lifecycle.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createMouthClean({ heroScale = 0.31, quality = 'auto', cellSize } = {}) {
let loadingMessage = 'Loading mouth world...';
let flashMessage = '';
const canvas = document.createElement('canvas');
const MOUTH_URL = 'assets/mouth-clean/MouthScene.glb';
const HERO_URL = 'assets/mouth-clean/ToothExplorer.glb';
const ENEMY_URL = 'assets/mouth-clean/SodaEnemy.glb';
let enemyLoaded = false, enemyLoadFailed = false;
let timeScale = 1;
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
const HERO_SCALE = heroScale;
const LANE_X = 2.6;               // the 2D "track" runs along the top of the tongue's near lobe
let CUT_X = 3.2;                  // moves with the hero: everything nearer the camera than this is cut / ghosted
const X_MIN = -4.6, X_MAX = 4.6;   // how far he can walk away from / toward the camera
const CUT_AHEAD = 0.65;               // everything nearer the camera than this is cut away
const Z_MIN = -24.4, Z_MAX = 7.2; // throat end … behind the front teeth
const WALK = 1.25, RUN = 2.2, JUMP_V = 4.9, GRAV = 15;
const STEP = 0.24;                // biggest bump he can walk up without jumping

// ======================= renderer / scene =======================

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, preserveDrawingBuffer: true });   // stencil: used for the hero's x-ray outline
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e050b);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.0;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.enabled = false;

const hemi = new THREE.HemisphereLight(0xffe0d8, 0x4a0a12, 0.8); scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0e6, 1.7);
key.position.set(14, 16, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
key.shadow.bias = -0.0008; key.shadow.normalBias = 0.03;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xffc0b0, 0.55); fill.position.set(10, 2, -6); scene.add(fill);
const warm = new THREE.PointLight(0xff7a60, 22, 22, 1.5); warm.position.set(0, 6, -4.4); scene.add(warm);
const throatGlow = new THREE.PointLight(0xff4a35, 20, 16, 1.8); throatGlow.position.set(1, 3, -15.8); scene.add(throatGlow);


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
// ---- tongue surface detail: cartoon papillae, mottling, centre groove ----
// A small tileable texture is painted once on a canvas (R = fine dots, G = big bumps, B = soft blotches),
// then projected from above in world space. The shader only does 2 texture lookups – cheap on any GPU.
const tongueTex = (() => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const wrapDraw = (x, y, r, draw) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) if (x + dx > -r && x + dx < N + r && y + dy > -r && y + dy < N + r) draw(x + dx, y + dy); };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // B: soft blotches
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) { const x = rnd() * N, y = rnd() * N, r = 30 + rnd() * 50, a = 0.18 + rnd() * 0.22;
    wrapDraw(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(0,0,255,${a})`); gr.addColorStop(1, 'rgba(0,0,255,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, 2 * r, 2 * r); }); }
  // G: big round bumps (sparse)
  for (let i = 0; i < 12; i++) { const x = rnd() * N, y = rnd() * N, r = 11 + rnd() * 6;
    wrapDraw(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(0,255,0,1)'); gr.addColorStop(0.7, 'rgba(0,255,0,0.9)'); gr.addColorStop(1, 'rgba(0,255,0,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, 2 * r, 2 * r); }); }
  // R: lots of tiny papillae
  for (let i = 0; i < 150; i++) { const x = rnd() * N, y = rnd() * N, r = 3.5 + rnd() * 2.5;
    wrapDraw(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,0,0,1)'); gr.addColorStop(0.6, 'rgba(255,0,0,0.85)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, 2 * r, 2 * r); }); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4; return t;
})();
// ---- movement grid on the tongue ----
// Cell size scales with the hero (0.5 world units at the original hero scale 0.31) unless cellSize is given.
const CELL = cellSize ?? 0.5 * heroScale / 0.31;
const cellCenter = (v) => (Math.floor(v / CELL) + 0.5) * CELL;
const GRID_U = { uCellSize: { value: CELL }, uGridOn: { value: 1 },
  uHeroCell: { value: new THREE.Vector2(9999, 9999) }, uTargetCell: { value: new THREE.Vector3(9999, 9999, 0) } };
function tongueDetail(mat) {
  mat.customProgramCacheKey = () => 'tongueDetail';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTongueTex = { value: tongueTex };
    Object.assign(sh.uniforms, GRID_U);
    sh.vertexShader = 'varying vec3 vTW;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vTW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = 'varying vec3 vTW;\nuniform sampler2D uTongueTex;\nuniform float uCellSize;\nuniform float uGridOn;\nuniform vec2 uHeroCell;\nuniform vec3 uTargetCell;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec4 fine = texture2D( uTongueTex, vTW.xz * 0.32 );          // small papillae + blotches
        vec4 big  = texture2D( uTongueTex, vTW.xz * 0.11 + 0.37 );   // bigger bumps
        float back = 1.0 - smoothstep( -14.0, -4.0, vTW.z );          // 0 at the tip, 1 toward the throat
        diffuseColor.rgb *= mix( 1.05, 0.84, fine.b );                // soft blotches
        diffuseColor.rgb *= 1.0 - 0.28 * exp( -pow( vTW.x / 0.55, 2.0 ) );   // centre groove
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.22, 1.35, 1.3 ), fine.r * 0.55 );   // soft lighter-pink dots
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.86, 0.62, 0.66 ), big.g * ( 0.55 + 0.3 * back ) ); // deeper-red bumps
        diffuseColor.rgb *= 1.0 - 0.18 * back;                        // deeper colour toward the throat
        // ---- grid ----
        if ( uGridOn > 0.5 ) {
          vec2 gc = vTW.xz / uCellSize;
          vec2 toLine = 0.5 - abs( fract( gc ) - 0.5 );                // 0 on a grid line
          vec2 aa = fwidth( gc );
          float line = max( 1.0 - smoothstep( 0.0, aa.x * 1.4, toLine.x ), 1.0 - smoothstep( 0.0, aa.y * 1.4, toLine.y ) );
          float fade = 1.0 - smoothstep( 1.2, 2.5, max( aa.x, aa.y ) * 10.0 );   // fade lines that get too dense far away
          diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.62, line * 0.75 * fade );
          // the hero's cell: soft light fill
          vec2 dh = abs( vTW.xz - uHeroCell ) / uCellSize;
          float inHero = 1.0 - step( 0.5, max( dh.x, dh.y ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.86, 0.9 ), inHero * 0.22 );
          // optional target cell: warm yellow fill (uTargetCell.z = 1 to show)
          vec2 dt = abs( vTW.xz - uTargetCell.xy ) / uCellSize;
          float inTarget = ( 1.0 - step( 0.5, max( dt.x, dt.y ) ) ) * uTargetCell.z;
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.85, 0.45 ), inTarget * 0.35 );
        }
      }`);
  };
  return mat;
}
const fixMat = (m) => {
  if (m.name === 'M_Saliva') return (matCache.M_Saliva ??= salivaMat());
  if (m.name === 'M_Tongue') return (matCache.M_Tongue ??= tongueDetail(toon({ ...PALETTE.M_Tongue })));
  const p = PALETTE[m.name]; return p ? (matCache[m.name] ??= toon({ ...p })) : m; };
// semi-transparent "ghost" version for whatever sits between the camera and the hero
const ghostPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -CUT_X);   // keeps x >= CUT_X
const ghostMat = (name) => ghostCache[name] ??= toon({ ...PALETTE[name], side: THREE.FrontSide, transparent: true,
  opacity: 0.32, depthWrite: false, clippingPlanes: [ghostPlane] });
const ghosts = [];
const GHOSTED = new Set(['M_Enamel', 'M_Plaque']);   // only the near teeth (and their plaque) turn see-through
const NEVER_CUT = new Set(['M_Tongue', 'M_Saliva', 'M_Enamel_front', 'M_Plaque_front']); // tongue + front teeth stay whole and solid
const FRONT_TOOTH = /^(Tooth|Plaque)_(upper|lower)_[RL][123]_/;   // incisors, laterals, canines
function setCut(on) {
  for (const [name, m] of Object.entries(matCache)) {
    m.clippingPlanes = (on && !NEVER_CUT.has(name)) ? clipList : null;
    m.needsUpdate = true;
  }
  for (const g of ghosts) g.visible = on;
}

// ======================= state =======================
let hero, mixer, actions = {}, current, groundMeshes = [], germs = [], cleaned = 0, sideView = true;
const START_X = cellCenter(2.25), START_Z = cellCenter(3.25);   // a cell centre in the open, clear of the front teeth
const S = { x: START_X, z: START_Z, y: 2, vy: 0, onGround: false, face: -1, fx: 0, fz: -1, busy: false, moving: false };   // face -1 → toward throat (screen right)
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
    if (FRONT_TOOTH.test(o.name)) {           // front teeth: always opaque, never cut away or ghosted
      const k = o.material === matCache.M_Plaque ? 'M_Plaque_front' : 'M_Enamel_front';
      o.material = matCache[k] ??= toon({ ...PALETTE[k === 'M_Plaque_front' ? 'M_Plaque' : 'M_Enamel'] });
    }
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
const blobGeo = new THREE.SphereGeometry(1, 12, 9), eyeGeo = new THREE.SphereGeometry(1, 8, 6);
function makeGerm(size) {
  // built from many blobs, but merged into 3 meshes (body, eye whites, pupils) → far fewer draw calls
  const gp = new THREE.Group(), body = [], whites = [], pupils = [], m4 = new THREE.Matrix4();
  const n = 7 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const r = size * (0.35 + Math.random() * 0.35);
    m4.compose(new THREE.Vector3((Math.random() - .5) * size * .7, r * 0.8 + Math.random() * size * .5, (Math.random() - .5) * size),
               new THREE.Quaternion(), new THREE.Vector3(r, r, r));
    body.push(blobGeo.clone().applyMatrix4(m4));
  }
  for (const s of [-1, 1]) {        // grumpy little eyes facing the camera (+X)
    m4.compose(new THREE.Vector3(size * 0.42, size * 0.95, s * size * 0.2), new THREE.Quaternion(), new THREE.Vector3().setScalar(size * 0.17));
    whites.push(eyeGeo.clone().applyMatrix4(m4));
    m4.compose(new THREE.Vector3(size * 0.56, size * 0.93, s * size * 0.2), new THREE.Quaternion(), new THREE.Vector3().setScalar(size * 0.08));
    pupils.push(eyeGeo.clone().applyMatrix4(m4));
  }
  const b = new THREE.Mesh(mergeGeometries(body), germMat); b.castShadow = true; gp.add(b);
  gp.add(new THREE.Mesh(mergeGeometries(whites), eyeW), new THREE.Mesh(mergeGeometries(pupils), eyeB));
  for (const geometry of [...body, ...whites, ...pupils]) geometry.dispose();
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
    addXrayOutline(hero);
    mixer = new THREE.AnimationMixer(hero);
    for (const c of g.animations) actions[c.name] = mixer.clipAction(c);
    for (const n of ['Poke', 'OverheadStrike', 'MarchAndWave', 'HurtPunch', 'HurtSquirt']) { actions[n]?.setLoop(THREE.LoopOnce, 1); if (actions[n]) actions[n].clampWhenFinished = true; }
    mixer.addEventListener('finished', (e) => { if (e.action === current) { S.busy = false; } });
    S.y = groundBelow(S.z, 4); S.onGround = true;
    play('FightStance', 0);
    applyQuality();
    placeCamera(true);
    // warm up shaders used later (foam, splats) so the first hit doesn't stutter
    for (const c of ['#ffffff', '#d8f1ff', '#fff4c8']) { const w = new THREE.Mesh(foamGeo, foamMat(c)); w.position.copy(hero.position); scene.add(w); setTimeout(() => scene.remove(w), 50); }
    renderer.compile(scene, camera);

    flash('Scrub the germs! →');
    loadEnemy();
  }, undefined, (e) => { loadingMessage = 'Could not load the hero: ' + (e.message || e); });
}
// ======================= x-ray outline: hero stays visible behind teeth =======================
// Pass 1 (mask): the hero's hidden parts write 1 into the stencil buffer (no colour).
// Pass 2 (outline): a slightly inflated copy, drawn only where it is hidden AND outside the mask → a rim.
// Both run after the mouth but before the hero's normal draw, so "hidden" means hidden by the mouth, not by himself.
const XRAY_COLOR = '#b05cff', XRAY_WIDTH = 0.14;     // width in hero units
const xrayMask = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthFunc: THREE.GreaterDepth,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
const xrayLine = new THREE.MeshBasicMaterial({ color: XRAY_COLOR, depthWrite: false, depthFunc: THREE.GreaterDepth,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
// Both passes are nudged toward the camera by XRAY_BIAS world units, so tiny overlaps
// (boots sinking into the bumpy tongue) don't count as "hidden" – only real occluders like teeth do.
const XRAY_BIAS = 0.12;
function xrayShader(width) {
  return (sh) => {
    sh.uniforms.uWidth = { value: width }; sh.uniforms.uBias = { value: XRAY_BIAS };
    sh.vertexShader = 'uniform float uWidth;\nuniform float uBias;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize( normal ) * uWidth;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  mvPosition.xyz += normalize( -mvPosition.xyz ) * uBias;\n  gl_Position = projectionMatrix * mvPosition;');
  };
}
xrayMask.onBeforeCompile = xrayShader(0.0);
xrayLine.onBeforeCompile = xrayShader(XRAY_WIDTH);
xrayMask.customProgramCacheKey = () => 'xrayMask';
xrayLine.customProgramCacheKey = () => 'xrayLine';
const xrayLines = { [XRAY_COLOR]: xrayLine };
function addXrayOutline(root, color = XRAY_COLOR) {
  const line = xrayLines[color] ??= (() => { const m = xrayLine.clone(); m.color.set(color); m.onBeforeCompile = xrayShader(XRAY_WIDTH); m.customProgramCacheKey = () => 'xrayLine'; return m; })();
  const bodies = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.xray && !o.userData.noXray && o.material.name !== 'Outline') bodies.push(o); });
  for (const o of bodies) {
    o.renderOrder = 30;                                    // the hero's normal draw comes after the x-ray passes
    for (const [mat, order] of [[xrayMask, 20], [line, 21]]) {
      const c = o.clone(false);                            // shares geometry (and skeleton for skinned meshes)
      c.material = mat; c.renderOrder = order; c.castShadow = false; c.receiveShadow = false;
      c.userData.xray = true; c.raycast = () => {};
      o.parent.add(c);
    }
  }
  root.traverse((o) => { if (o.isMesh && o.material.name === 'Outline') o.renderOrder = 30; });
}

function play(name, fade = 0.2, force = false) {
  const next = actions[name]; if (!next || (next === current && !force)) return;
  if (next === current) { next.reset().play(); return; }
  next.reset(); next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1); next.play();
  if (current) current.crossFadeTo(next, fade, false);
  current = next;
}

// ======================= input =======================
const keys = new Set();
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
  if (!hero || !enemyLoaded || S.busy || !S.onGround || HERO.hp <= 0) return;
  if (name !== 'MarchAndWave') {
    if (TURN.who !== 'hero') { flash("⏳ Wait – it's the enemy's turn"); return; }
    if (TURN.attackUsed) { flash('Already attacked – retreat or end your turn'); return; }
    TURN.attackUsed = true;
  }
  S.busy = true; play(name, 0.08);
  if (name === 'MarchAndWave') return;
  const delay = name === 'Poke' ? 380 : 700, reach = name === 'Poke' ? 0.6 : 0.45, rad = name === 'Poke' ? 0.5 : 0.62;
  later(delay, () => {
    const hz = S.z + S.fz * reach, hx = S.x + S.fx * reach; let hits = 0;
    if (E.alive && enemy && Math.hypot(E.z - hz, E.x - hx) < rad + 0.25 && Math.abs(E.y - S.y) < 0.8) hurtEnemy(name);
    for (const g of germs) {
      if (!g.alive) continue;
      if (Math.hypot(g.z - hz, g.x - hx) < rad && Math.abs(g.y - S.y) < 0.75) { g.alive = false; hits++; burst(g.g.position.clone().setY(g.y + 0.2)); }
    }
    if (hits) { cleaned += hits;  flash(cleaned === germs.length ? '✨ Sparkling clean! You win! ✨' : (hits > 1 ? `Combo ×${hits}!` : 'Scrubbed!')); }
    else burst(new THREE.Vector3(hx, S.y + 0.4, hz), 6, '#d8f1ff');
  });
}
let msgT;
function flash(message) {
  flashMessage = message;
  clearTimeout(msgT);
  msgT = setTimeout(() => { flashMessage = ''; }, 1400);
}

const parts = []; const foamGeo = new THREE.SphereGeometry(0.035, 8, 6);
// foam particles share one unlit material per colour (no per-particle materials → no shader compiles, no GC)
const foamMats = {};
const foamMat = (c) => foamMats[c] ??= new THREE.MeshBasicMaterial({ color: c });
function burst(at, n = 24, color = '#ffffff') {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(foamGeo, foamMat(color));
    const s0 = 0.6 + Math.random() * 1.6;
    m.position.copy(at); m.scale.setScalar(s0);
    parts.push({ m, s0, v: new THREE.Vector3((Math.random() - .5) * 0.8, Math.random() * 2.2 + 0.6, (Math.random() - .5) * 2.4), life: 0.8 + Math.random() * 0.5 });
    scene.add(m);
  }
}

function later(ms, callback) { return setTimeout(callback, ms); }

// ======================= soda-bottle enemy =======================
const ENEMY_SCALE = 0.33 * heroScale / 0.31;                      // a bit taller than the hero (bottle ≈ 0.95 units)
const SQUIRT_CELLS = 3, PUNCH_CELLS = 1;       // attack ranges in grid cells
const E_WALK = 0.95, E_COOLDOWN = 3.2;
const E = { x: 0, z: 0, y: 0, face: 1, fx: 0, fz: 1, hp: 100, alive: false, busy: false, cool: 1.5, forced: null,
  kb: null, stuck: 0, moving: false, dead: 0 };
const HERO = { hp: 100, hurt: false };
let enemy, eMixer, eActions = {}, eCurrent, eNeck;
const tintable = { hero: [], enemy: [] };

function loadEnemy() {
  loader.load(ENEMY_URL, (g) => {
    if (disposed) { disposeObject(g.scene); return; }
    enemy = g.scene; enemy.scale.setScalar(ENEMY_SCALE);
    enemy.traverse((o) => {
      if (o.isBone && o.name === 'neck') eNeck = o;
      if (!o.isMesh) return;
      o.castShadow = true;
      const conv = (m) => {
        if (m.name === 'Outline') return new THREE.MeshBasicMaterial({ color: 0x05060a, side: THREE.FrontSide, name: 'Outline' });
        if (m.name === 'S_Plastic') { o.castShadow = false; o.userData.noXray = true;
          return toon({ color: '#d8ecff', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.FrontSide, name: m.name }); }
        const c = m.name === 'S_Soda' ? '#5a1c08' : m.color;
        const e = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
        const t = toon({ color: c, emissive: e ? m.emissive : 0x000000, emissiveIntensity: e ? 1.5 : 0, side: THREE.FrontSide, name: m.name });
        tintable.enemy.push(t); return t;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    scene.add(enemy);
    addXrayOutline(enemy, '#ff5d5d');
    eMixer = new THREE.AnimationMixer(enemy);
    for (const c of g.animations) eActions[c.name] = eMixer.clipAction(c);
    for (const n of ['S_Squirt', 'S_Punch', 'S_Hit']) { eActions[n]?.setLoop(THREE.LoopOnce, 1); if (eActions[n]) eActions[n].clampWhenFinished = true; }
    eMixer.addEventListener('finished', (e) => { if (e.action === eCurrent) E.busy = false; });
    hero.traverse((o) => { if (o.isMesh && o.material.isMeshToonMaterial) tintable.hero.push(o.material); });
    spawnEnemy(cellCenter(S.z - 5 * CELL));
    startTurn('hero'); TURN.n = 1;
    enemyLoaded = true;
    applyQuality();
    renderer.compile(scene, camera);
  }, undefined, (e) => { enemyLoadFailed = true; loadingMessage = 'Could not load the soda enemy: ' + (e.message || e); });
}
function ePlay(name, fade = 0.15, force = false) {
  const next = eActions[name]; if (!next || (next === eCurrent && !force)) return;
  if (next === eCurrent) { next.reset().play(); return; }
  next.reset(); next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1); next.play();
  if (eCurrent) eCurrent.crossFadeTo(next, fade, false);
  eCurrent = next;
}
function spawnEnemy(z) {
  E.x = cellCenter(LANE_X); E.z = THREE.MathUtils.clamp(z, Z_MIN + 0.5, Z_MAX - 0.5);
  E.y = groundBelow(E.z, 4, E.x); E.hp = 100; E.alive = true; E.busy = false; E.dead = 0; E.cool = 1.5; E.kb = null;
  enemy.visible = true; enemy.scale.setScalar(ENEMY_SCALE); ePlay('S_Idle', 0);
}

// ======================= turns =======================
// One turn each, max 1 minute. On your turn: walk anywhere, attack ONCE, then you can still walk (retreat).
// Enemy turn: the bottle walks up, attacks once (squirt from 3 cells or punch from 1), then retreats.
const TURN_TIME = 60;
const TURN = { who: 'hero', left: TURN_TIME, attackUsed: false, phase: null, plan: null, wait: 0, retreat: null, n: 1 };
function startTurn(who) {
  TURN.who = who; TURN.left = TURN_TIME; TURN.attackUsed = false; TURN.retreat = null; TURN.n++;
  if (who === 'enemy') {
    TURN.phase = 'think'; TURN.wait = 0.9; TURN.goal = null; TURN.prog = null; TURN.t = 0; TURN.retried = false; keys.clear();
    flash('🥤 Enemy turn');
  } else { TURN.phase = null; TURN.plan = null; flash('🦷 Your turn – move, attack once, retreat'); }

}
function endTurn() {
  if (TURN.who === 'hero') {
    if (E.alive) startTurn('enemy');
    else { startTurn('hero'); flash('The soda is fizzed out – your turn again'); }
  } else startTurn('hero');
}
function endTurnButton() { if (TURN.who === 'hero' && !S.busy && hero && enemy) endTurn(); }
function updateTurn(dt) {
  if (!hero || !enemy) return;
  TURN.left -= dt;
  if (TURN.left <= 0) {
    if (TURN.who === 'hero' && !S.busy) { flash("⏰ Time's up!"); endTurn(); }
    else if (TURN.who === 'enemy' && !E.busy) endTurn();
  }
}
// in range for an attack right now? (distances in world units; CELL = 0.5)
function inRange(kind, loose = false) {
  const d = Math.hypot(S.x - E.x, S.z - E.z) / CELL, dy = Math.abs(S.y - E.y);
  if (kind === 'punch') return d <= Math.min(PUNCH_CELLS + 0.6, PUNCH_CELLS + 0.4 / CELL) && dy < 0.45;
  return loose ? d >= 1.8 && d <= 4.6                          // squirt: any height; 3 cells ideally, 2–4.5 if blocked
               : d >= SQUIRT_CELLS - 0.45 && d <= SQUIRT_CELLS + 0.45;
}
// best cell to walk to: at the right ring of cells around the hero, walkable, closest to the enemy
function pickSpot(kind, any = false) {
  const hx = cellCenter(S.x), hz = cellCenter(S.z);
  const rings = kind === 'punch' ? [1] : kind === 'squirt' ? [3, 2, 4] : [5, 4, 6];
  let best = null, bestD = Infinity;
  for (const r of rings) {
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const x = hx + i * CELL, z = hz + j * CELL;
      if (x < X_MIN || x > X_MAX || z < Z_MIN || z > Z_MAX) continue;
      const g = groundBelow(z, Math.max(S.y, E.y) + 0.6, x);
      if (g < -40 || Math.abs(g - E.y) > 0.6) continue;                 // must be ground at about our height
      if (kind === 'punch' && Math.abs(g - S.y) > 0.4) continue;
      const d = Math.hypot(x - E.x, z - E.z) + (kind === 'retreat' ? 0 : Math.abs(i) * 0.15);   // prefer the hero's lane
      if (d < bestD) { bestD = d; best = { x, z }; }
    }
    if (best && !any) break;
  }
  return best || { x: E.x, z: E.z };
}
// true when the enemy has been trying to walk for ~0.8 s without getting meaningfully closer to its goal
function noProgress(dt) {
  const g = TURN.goal ?? TURN.retreat; if (!g) return false;
  const d = Math.hypot(g.x - E.x, g.z - E.z);
  if (!TURN.prog || d < TURN.prog.best - 0.04) { TURN.prog = { best: d, t: 0 }; return false; }
  return (TURN.prog.t += dt) > 0.8;
}
function enemyPlan() {
  // close already → punch; otherwise mostly squirt from range (it's safer), sometimes rush in for a punch
  const cells = Math.hypot(S.x - E.x, S.z - E.z) / CELL;
  if (cells <= 2.2) return 'punch';
  return Math.random() < 0.6 ? 'squirt' : 'punch';
}

// a quick red/white flash on whoever gets hit
function tint(list, color) {
  for (const m of list) { m.userData.e0 ??= { c: m.emissive.clone(), i: m.emissiveIntensity }; m.emissive.set(color); m.emissiveIntensity = 0.9; }
  later(110, () => { for (const m of list) { m.emissive.copy(m.userData.e0.c); m.emissiveIntensity = m.userData.e0.i; } });
}

// Test buttons: the enemy walks into the right range, then attacks straight away.
// They end your turn and make the enemy use that attack on its turn.
function testEnemyAttack(kind) {
  if (!enemy || !hero) return;
  if (TURN.who !== 'hero' || S.busy) { flash("⏳ Wait for your turn"); return; }
  if (!E.alive) spawnEnemy(cellCenter(S.z - 5 * CELL));
  E.forced = kind; E.stuck = 0;
  startTurn('enemy'); TURN.wait = 0.4;
  flash(kind === 'squirt' ? `🥤 Enemy turn: squirt from ${SQUIRT_CELLS} cells` : '👊 Enemy turn: punch');
}
function attackSpot(cells) {
  // stand on the hero's lane, `cells` cells away, on whichever side the enemy already is (or the open side)
  let side = Math.sign(E.z - S.z) || -1;
  const z = (sd) => cellCenter(S.z + sd * cells * CELL);
  const ok = (zz) => zz > Z_MIN && zz < Z_MAX && (() => { const g = groundBelow(zz, S.y + STEP * 0.8 + 0.4, cellCenter(S.x)); return g > -40 && Math.abs(g - S.y) < 0.5; })();
  if (!ok(z(side)) && ok(z(-side))) side = -side;
  return { x: cellCenter(S.x), z: z(side) };
}

function enemyAttack(kind) {
  E.busy = true; E.cool = E_COOLDOWN; E.forced = null; E.moving = false;
  faceHero();
  if (kind === 'punch') {
    ePlay('S_Punch', 0.08);
    later(520, () => {                     // glove lands at frame 13
      if (!E.alive) return;
      const d = Math.hypot(S.x - E.x, S.z - E.z);
      if (d < PUNCH_CELLS * CELL + 0.45 && Math.abs(S.y - E.y) < 0.55) hurtHero('punch', 14);
      else burst(new THREE.Vector3(E.x + E.fx * 0.4, E.y + 0.35, E.z + E.fz * 0.4), 6, '#ffd2d2');
    });
  } else {
    ePlay('S_Squirt', 0.08);
    E.squirt = { from: 0.62, to: 1.22, acc: 0, hit: false };
  }
}
function faceHero() { const dx = S.x - E.x, dz = S.z - E.z, d = Math.hypot(dx, dz) || 1; E.fx = dx / d; E.fz = dz / d; if (dz) E.face = dz > 0 ? 1 : -1; }

// ---- soda stream: brown droplets from the cap, flying in an arc at the hero's chest ----
const sodaDrops = []; const SODA_COLS = ['#4a1606', '#6b2a0c', '#8a4316', '#b9763d'];
const capPos = new THREE.Vector3(), capDir = new THREE.Vector3();
function sprayDroplet() {
  if (eNeck) { eNeck.updateWorldMatrix(true, false); capPos.set(0, 1.18, 0); eNeck.localToWorld(capPos); }
  else capPos.set(E.x, E.y + 0.95, E.z);
  const tx = S.x, ty = S.y + 0.42, tz = S.z, T = 0.32 + Math.random() * 0.06;
  const v = new THREE.Vector3((tx - capPos.x) / T, (ty - capPos.y + 0.5 * 9 * T * T) / T, (tz - capPos.z) / T);
  v.x += (Math.random() - .5) * 0.25; v.y += (Math.random() - .5) * 0.3; v.z += (Math.random() - .5) * 0.25;
  const m = new THREE.Mesh(foamGeo, foamMat(SODA_COLS[(Math.random() * 3) | 0]));
  const s0 = 0.55 + Math.random() * 0.75; m.scale.setScalar(s0); m.position.copy(capPos); scene.add(m);
  sodaDrops.push({ m, v, s0, life: 1.1 });
}
function sodaSplash(at, n = 10) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(foamGeo, foamMat(SODA_COLS[(Math.random() * 4) | 0])); const s0 = 0.4 + Math.random() * 0.8;
    m.position.copy(at); m.scale.setScalar(s0); scene.add(m);
    parts.push({ m, s0, v: new THREE.Vector3((Math.random() - .5) * 1.6, Math.random() * 1.8 + 0.3, (Math.random() - .5) * 1.6), life: 0.4 + Math.random() * 0.4 });
  }
}
function updateSoda(dt) {
  const sq = E.squirt;
  if (sq && eCurrent === eActions.S_Squirt) {
    const at = eCurrent.time;
    if (at >= sq.from && at <= sq.to) { sq.acc += dt; while (sq.acc > 0.014) { sq.acc -= 0.014; sprayDroplet(); } }
    if (at > sq.to + 0.6) E.squirt = null;
  }
  const chest = new THREE.Vector3(S.x, S.y + 0.42, S.z);
  for (let i = sodaDrops.length - 1; i >= 0; i--) {
    const p = sodaDrops[i]; p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt);
    let gone = p.life <= 0;
    if (!gone && p.m.position.distanceTo(chest) < 0.3) {
      gone = true; if (Math.random() < 0.5) sodaSplash(p.m.position, 3);
      if (E.squirt && !E.squirt.hit) { E.squirt.hit = true; hurtHero('squirt', 10); }
    }
    if (!gone && p.m.position.y < Math.min(S.y, E.y) - 0.02) { gone = true; sodaSplash(p.m.position, 2); }
    if (gone) { scene.remove(p.m); sodaDrops.splice(i, 1); }
  }
}

// ---- getting hurt ----
function hurtHero(kind, dmg) {
  if (!hero || HERO.hp <= 0) return;
  HERO.hp -= dmg;  tint(tintable.hero, '#ff3030');
  // turn toward the attacker so we see the hit from the front, then get pushed away from him
  const dx = E.x - S.x, dz = E.z - S.z, d = Math.hypot(dx, dz) || 1;
  S.fx = dx / d; S.fz = dz / d; if (dz) S.face = dz > 0 ? 1 : -1;
  hero.rotation.y = Math.atan2(S.fx, S.fz);
  S.kb = { x: -S.fx * (kind === 'punch' ? 1.6 : 0.9), z: -S.fz * (kind === 'punch' ? 1.6 : 0.9) };

  S.busy = true; play(kind === 'punch' ? 'HurtPunch' : 'HurtSquirt', 0.06, true);
  if (kind === 'squirt') sodaSplash(new THREE.Vector3(S.x, S.y + 0.45, S.z), 16);
  else burst(new THREE.Vector3(S.x - S.fx * 0.05, S.y + 0.35, S.z + S.fz * 0.12), 10, '#fff4c8');
  closeUp('hero', kind === 'punch' ? '👊 Punched in the tummy!' : '🥤 Soda in the face!');
  if (HERO.hp <= 0) later(1300, () => {
    flash('💦 Fizzed out! Back to the start'); HERO.hp = 100;
    S.x = START_X; S.z = START_Z; S.y = groundBelow(S.z, 4); S.kb = null; S.busy = false; play('FightStance', 0.1);
    spawnEnemy(cellCenter(S.z - 6 * CELL)); startTurn('hero');
  });
}
function hurtEnemy(how) {
  const dmg = how === 'Poke' ? 20 : 34;
  E.hp -= dmg;  tint(tintable.enemy, '#ffffff');
  E.busy = true; E.squirt = null; E.forced = null; E.cool = Math.max(E.cool, 1.2);
  const dx = E.x - S.x, dz = E.z - S.z, d = Math.hypot(dx, dz) || 1;
  E.fx = -dx / d; E.fz = -dz / d;
  E.kb = { x: dx / d * (how === 'Poke' ? 1.2 : 1.8), z: dz / d * (how === 'Poke' ? 1.2 : 1.8) };
  ePlay('S_Hit', 0.05, true);
  sodaSplash(new THREE.Vector3(E.x, E.y + 0.55, E.z), 14);
  if (E.hp <= 0) { E.alive = false; E.dead = 0.001; closeUp('enemy', '🎉 Soda bottle defeated!'); }
  else closeUp('enemy', how === 'Poke' ? '🪥 Poke!' : '💥 Smash!');
}
function applyKnockback(o, dt) {
  if (!o.kb) return;
  const nx = THREE.MathUtils.clamp(o.x + o.kb.x * dt, X_MIN, X_MAX), nz = THREE.MathUtils.clamp(o.z + o.kb.z * dt, Z_MIN, Z_MAX);
  const g = groundBelow(nz, o.y + STEP * 0.8, nx);
  if (g > -40 && g < o.y + STEP && g > o.y - 0.7) { o.x = nx; o.z = nz; }
  const k = Math.exp(-dt * 6); o.kb.x *= k; o.kb.z *= k;
  if (Math.hypot(o.kb.x, o.kb.z) < 0.05) o.kb = null;
}

// ---- enemy brain ----
function updateEnemy(dt, t) {
  if (!enemy || !hero) return;
  if (!E.alive) {                                   // defeated: pop into fizz, respawn a bit later
    if (E.dead > 0) {
      E.dead += dt;
      if (E.dead > 0.7) { const s = Math.max(0, 1 - (E.dead - 0.7) * 3); enemy.scale.setScalar(ENEMY_SCALE * s); if (s <= 0 && enemy.visible) { enemy.visible = false; sodaSplash(new THREE.Vector3(E.x, E.y + 0.4, E.z), 30); } }
      if (E.dead > 5) spawnEnemy(cellCenter(S.z - 6 * CELL) < Z_MIN + 1 ? cellCenter(S.z + 6 * CELL) : cellCenter(S.z - 6 * CELL));
    }
    eMixer.update(dt); return;
  }
  applyKnockback(E, dt);
  E.cool -= dt;
  let mx = 0, mz = 0;
  const dx = S.x - E.x, dz = S.z - E.z, dist = Math.hypot(dx, dz), cells = dist / CELL;
  if (!E.busy && HERO.hp > 0) {
    let goal = null, arrive = null;
    if (TURN.who === 'enemy' && !S.busy) {
      if (TURN.phase === 'think') {
        if ((TURN.wait -= dt) <= 0) { TURN.plan = E.forced || enemyPlan(); E.forced = null; TURN.phase = 'approach'; E.stuck = 0;  }
      } else if (TURN.phase === 'approach') {
        // attack as soon as we're in range for the plan – no need to hit an exact cell
        if (inRange(TURN.plan)) { TURN.phase = 'attacking';  enemyAttack(TURN.plan); }
        else {
          TURN.goal ??= pickSpot(TURN.plan);
          goal = TURN.goal;
          arrive = () => { if (inRange(TURN.plan, true)) { TURN.phase = 'attacking';  enemyAttack(TURN.plan); } else TURN.goal = null; };
          if (noProgress(dt) || (TURN.t += dt) > 9) {     // blocked (ledge, tooth, edge…): adapt
            const alt = TURN.plan === 'punch' ? 'squirt' : 'punch';
            if (inRange(TURN.plan, true) || inRange(alt, true)) { if (!inRange(TURN.plan, true)) TURN.plan = alt; const alt2 = TURN.plan;
              TURN.phase = 'attacking';  enemyAttack(alt2); }
            else if (false) { TURN.plan = alt; TURN.phase = 'attacking';  enemyAttack(alt); }
            else if (!TURN.retried) { TURN.retried = true; TURN.plan = 'squirt'; TURN.goal = pickSpot('squirt', true); TURN.prog = null; }
            else { flash("🥤 The soda can't reach you!"); TURN.phase = 'done'; TURN.wait = 0.6;  }
          }
        }
      } else if (TURN.phase === 'attacking') {             // the attack animation has finished
        TURN.retreat = pickSpot('retreat'); TURN.phase = 'retreat'; TURN.prog = null; TURN.t = 0;
      } else if (TURN.phase === 'retreat') {
        goal = TURN.retreat;
        arrive = () => { TURN.phase = 'done'; TURN.wait = 0.7;  };
        if (noProgress(dt) || (TURN.t += dt) > 6) arrive();
      } else if (TURN.phase === 'done') {
        if ((TURN.wait -= dt) <= 0) endTurn();
      }
    }
    if (goal) {
      const gx = goal.x - E.x, gz = goal.z - E.z, gd = Math.hypot(gx, gz);
      if (gd < 0.04) { E.x = goal.x; E.z = goal.z; arrive?.(); }
      else { mx = gx / gd; mz = gz / gd; }
    }
  }
  E.moving = !!(mx || mz);
  if (E.moving) {
    E.fx = mx; E.fz = mz; const sp = E_WALK * 1.25;
    const nx = THREE.MathUtils.clamp(E.x + mx * sp * dt, X_MIN, X_MAX), nz = THREE.MathUtils.clamp(E.z + mz * sp * dt, Z_MIN, Z_MAX);
    const g = groundBelow(nz, E.y + STEP * 0.8, nx);
    if (g > -40 && g < E.y + STEP && g > E.y - 0.7) { E.x = nx; E.z = nz; E.stuck = 0; }
    else E.stuck += dt;
  } else if (!E.busy) faceHero();
  // don't walk through the hero
  const sep = Math.hypot(S.x - E.x, S.z - E.z);
  if (sep < 0.38 && sep > 1e-4) { const k = (0.38 - sep) / sep; E.x -= (S.x - E.x) * k; E.z -= (S.z - E.z) * k; }
  const g = groundBelow(E.z, E.y + STEP * 0.7, E.x);
  if (g > -40) E.y = THREE.MathUtils.lerp(E.y, g, 0.5);
  if (!E.busy) ePlay(E.moving ? 'S_Walk' : 'S_Idle', 0.2);
  if (E.moving) eActions.S_Walk?.setEffectiveTimeScale(1.7);
  enemy.position.set(E.x, E.y, E.z);
  const want = Math.atan2(E.fx, E.fz);
  enemy.rotation.y += Math.atan2(Math.sin(want - enemy.rotation.y), Math.cos(want - enemy.rotation.y)) * Math.min(1, dt * 12);
  eMixer.update(dt);
}

// ---- close-up camera on whoever is hurt, with a short slow-motion ----
const CU = { who: null, t: 0, dur: 1.7, side: 1 };
const cuPos = new THREE.Vector3(), cuLook = new THREE.Vector3();
function closeUp(who, text) {
  CU.who = who; CU.t = 0;
  const vz = who === 'hero' ? S.z : E.z, az = who === 'hero' ? E.z : S.z;
  CU.side = Math.sign(az - vz) || 1;                    // look a little from the attacker's side
  if (text) flash(text);
}
function applyCloseUp(rdt) {
  if (!CU.who) { timeScale = 1; return; }
  CU.t += rdt;
  const p = CU.t / CU.dur;
  if (p >= 1) { CU.who = null; timeScale = 1; return; }
  // ease in fast, hold, ease out
  const w = THREE.MathUtils.smoothstep(CU.t, 0, 0.18) * (1 - THREE.MathUtils.smoothstep(CU.t, CU.dur - 0.45, CU.dur));
  timeScale = THREE.MathUtils.lerp(1, 0.35, THREE.MathUtils.smoothstep(CU.t, 0, 0.1) * (1 - THREE.MathUtils.smoothstep(CU.t, 0.9, 1.3)));
  const vx = CU.who === 'hero' ? S.x : E.x, vy = CU.who === 'hero' ? S.y : E.y, vz = CU.who === 'hero' ? S.z : E.z;
  const h = CU.who === 'hero' ? 0.42 : 0.5;
  // look from the attacker's side, in front of the victim, so we see the face / the impact
  const ax = CU.who === 'hero' ? E.x : S.x, az = CU.who === 'hero' ? E.z : S.z;
  const gap = THREE.MathUtils.clamp(Math.hypot(ax - vx, az - vz), 0.3, 1.6);
  cuLook.set(vx, vy + h, vz + CU.side * Math.min(0.35, gap * 0.3));
  const swing = CU.who === 'hero' ? 1.6 : 0.8;          // less swing for the enemy: the front teeth sit on the hero's side
  cuPos.set(vx + 2.4, vy + h + 0.5, vz + CU.side * swing);
  camera.position.lerpVectors(camPos, cuPos, w);
  const look = new THREE.Vector3().lerpVectors(camLook, cuLook, w);
  camera.lookAt(look);
  // keep the cut-away in front of the victim so nothing blocks the view
  const cx = Math.max(S.x, vx) + CUT_AHEAD; cutPlane.constant = cx; ghostPlane.constant = -cx;
}

// ======================= camera =======================
// The left edge of the view never goes past the lips (matches the reference framing).
const LEFT_EDGE_Z = 9.9, RIGHT_EDGE_Z = Z_MIN - 1.5;
const CAM_DEFAULT = 11.5;
const cam = { dist: CAM_DEFAULT, panZ: 0, panY: 0, follow: true, freeZ: 4, freeY: 2 };
const camLook = new THREE.Vector3(), camPos = new THREE.Vector3();
function halfWidth(d) { const a = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9; return d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * a; }
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
  u.scale.set(0.5, 0.81, 0.5);          // thin it out, a touch longer, still hanging from the soft palate
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

// ======================= quality settings (Auto / Low / Medium / High) =======================
const PRESETS = {
  low:    { dpr: 0.75, shadows: false, transmission: false, ghosts: true, fewLights: true,  shadowRes: 512 },
  medium: { dpr: 1,    shadows: true,  transmission: false, ghosts: true, fewLights: true,  shadowRes: 1024 },
  high:   { dpr: Math.min(devicePixelRatio, 1.5), shadows: true, transmission: false, ghosts: true, fewLights: false, shadowRes: 2048 },
  ultra:  { dpr: Math.min(devicePixelRatio, 2), shadows: true, transmission: true, ghosts: true, fewLights: false, shadowRes: 2048 },   // manual only: refractive saliva
};
const LEVELS = ['low', 'medium', 'high'];
const Q = { ...PRESETS.medium };
let qualityMode = quality, autoLevel = 'medium';
const gpuName = (() => { try { const gl = renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; } })();
if (/mali|adreno|powervr|swiftshader/i.test(gpuName) || (navigator.maxTouchPoints > 0 && innerWidth < 900)) autoLevel = 'low';
const tooSlow = new Set();          // levels Auto tried and found too slow on this device
// soft fake shadow under the hero, used when real shadows are off
const blobShadow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.renderOrder = 1; scene.add(m); return m;
})();
function applyQuality() {
  const lvl = qualityMode === 'auto' ? autoLevel : qualityMode;
  Object.assign(Q, PRESETS[lvl]);
  renderer.setPixelRatio(Q.dpr); resize(viewWidth, viewHeight);
  renderer.shadowMap.enabled = Q.shadows;
  key.castShadow = Q.shadows;
  if (key.shadow.mapSize.x !== Q.shadowRes) { key.shadow.mapSize.set(Q.shadowRes, Q.shadowRes); key.shadow.map?.dispose(); key.shadow.map = null; }
  blobShadow.visible = !Q.shadows;
  const sal = matCache.M_Saliva;
  if (sal) { sal.transmission = Q.transmission ? 1 : 0; sal.opacity = Q.transmission ? 0.95 : 0.42; sal.needsUpdate = true; }
  for (const g of ghosts) g.visible = Q.ghosts && sideView;
  warm.visible = fill.visible = !Q.fewLights;
  hemi.intensity = Q.fewLights ? 1.15 : 0.8;          // cheap ambient makes up for the lights that are switched off
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
}
function setQuality(mode) {
  if (!['auto', ...Object.keys(PRESETS)].includes(mode)) throw new RangeError('Unknown mouth-clean quality: ' + mode);
  qualityMode = mode;
  autoT = autoFrames = autoCool = 0;
  applyQuality();
}
function cycleQuality() {
  const order = ['auto', 'low', 'medium', 'high', 'ultra'];
  setQuality(order[(order.indexOf(qualityMode) + 1) % order.length]);
}
// Auto mode: step quality down if FPS stays low, back up if there's lots of headroom
let autoT = 0, autoFrames = 0, autoCool = 0;
function autoTune(dt) {
  if (qualityMode !== 'auto') return;
  if (document.hidden || dt > 0.25) { autoT = 0; autoFrames = 0; return; }   // hitch or hidden: not a real FPS sample
  autoT += dt; autoFrames++; autoCool -= dt;
  if (autoT < 2.5) return;
  const fps = autoFrames / autoT; autoT = 0; autoFrames = 0;
  if (autoCool > 0) return;
  const i = LEVELS.indexOf(autoLevel);
  if (fps < 40 && i > 0) { tooSlow.add(autoLevel); autoLevel = LEVELS[i - 1]; applyQuality(); autoCool = 4; }
  else if (fps > 54 && i < 2 && !tooSlow.has(LEVELS[i + 1])) { autoLevel = LEVELS[i + 1]; applyQuality(); autoCool = 6; }
}

// ======================= loop =======================
let viewWidth = 2, viewHeight = 2;
function resize(width, height) {
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) return;
  viewWidth = width;
  viewHeight = height;
  const ratio = renderer.getPixelRatio();
  if (canvas.width === Math.floor(width * ratio) && canvas.height === Math.floor(height * ratio)) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function update(deltaMs) {
  const dt = Math.min(deltaMs / 1000, 0.05) * timeScale;
  elapsed += dt * 1000;
  const t = elapsed / 1000;
  for (const [id, timer] of timers) {
    if (timer.at <= elapsed) { timers.delete(id); timer.callback(); }
  }
  if (hero) {
    // screen-right = toward the throat (-Z); "down" on screen = toward the camera (+X)
    const right = keys.has('d') || keys.has('arrowright'), left = keys.has('a') || keys.has('arrowleft');
    const up = keys.has('w') || keys.has('arrowup'), down = keys.has('s') || keys.has('arrowdown');
    let mz = (left ? 1 : 0) - (right ? 1 : 0);          // +1 → toward the lips
    let mx = (down ? 1 : 0) - (up ? 1 : 0);             // +1 → toward the camera
    if (TURN.who !== 'hero') { mx = 0; mz = 0; }
    if (S.busy && S.onGround) { mx = 0; mz = 0; }          // no walking while attacking / hurt
    const ml = Math.hypot(mx, mz);
    S.moving = ml > 0;
    const canMove = !S.busy || !S.onGround;
    if (ml && canMove) {
      mx /= ml; mz /= ml;
      S.fx = mx; S.fz = mz;
      if (mz) S.face = mz > 0 ? 1 : -1;
      const run = keys.has('shift'), sp = run ? RUN : WALK;
      const nz = THREE.MathUtils.clamp(S.z + mz * sp * dt, Z_MIN, Z_MAX);
      const nx = THREE.MathUtils.clamp(S.x + mx * sp * 0.8 * dt, X_MIN, X_MAX);
      // along the track: block steps that are too high (jump instead)
      const gz = groundBelow(nz, S.y + STEP * 0.8, S.x);
      if (!(S.onGround && gz > S.y + STEP)) S.z = nz;
      // in depth: don't walk off the sides of the tongue or up a wall
      const gx = groundBelow(S.z, S.y + STEP * 0.8, nx);
      if (gx > -40 && gx < S.y + STEP && gx > S.y - 0.7) S.x = nx;
      actions.Walk?.setEffectiveTimeScale(run ? 2.6 : 1.6);
    }
    applyKnockback(S, dt);
    // grid snap: when he stops walking, glide smoothly into the centre of the nearest cell
    S.snapDist = 0;
    if (!ml && !S.busy && S.onGround) {
      const cx = THREE.MathUtils.clamp(cellCenter(S.x), X_MIN, X_MAX), cz = THREE.MathUtils.clamp(cellCenter(S.z), Z_MIN, Z_MAX);
      const dx = cx - S.x, dz = cz - S.z, d = Math.hypot(dx, dz);
      if (d > 0.002) {
        const gc = groundBelow(cz, S.y + STEP * 0.8, cx);               // only snap onto walkable ground
        if (gc > -40 && gc < S.y + STEP && gc > S.y - 0.7) {
          const k = Math.min(1, Math.max(dt * 9, (0.9 * dt) / d));     // ease in, but never slower than ~0.9 u/s
          S.x += dx * k; S.z += dz * k; S.snapDist = d;
        }
      } else { S.x = cx; S.z = cz; }
    }
    GRID_U.uHeroCell.value.set(cellCenter(S.x), cellCenter(S.z));
    // gravity / ground
    const g = groundBelow(S.z, S.y + STEP * 0.7); S.ground = g;
    if (S.onGround) {
      if (g < S.y - STEP * 0.6) { S.onGround = false; S.vy = 0; }   // walked off an edge
      else S.y = THREE.MathUtils.lerp(S.y, g, 0.6);
    }
    if (!S.onGround) {
      S.vy -= GRAV * dt; S.y += S.vy * dt;
      if (S.vy <= 0 && S.y <= g) { S.y = g; S.vy = 0; S.onGround = true; }
      if (S.y < -12) { S.x = START_X; S.z = START_Z; S.y = groundBelow(S.z, 4); S.vy = 0; S.onGround = true; flash('Whoops! Back to the start'); }
    }
    // animation state
    if (!S.busy) play(S.moving || S.snapDist > 0.07 ? 'Walk' : 'FightStance', 0.18);
    if (!S.moving && S.snapDist > 0.07) actions.Walk?.setEffectiveTimeScale(1.2);   // short settling steps

    hero.position.set(S.x, S.y, S.z);
    const wantYaw = Math.atan2(S.fx, S.fz);                    // model faces +Z
    hero.rotation.y += (Math.atan2(Math.sin(wantYaw - hero.rotation.y), Math.cos(wantYaw - hero.rotation.y))) * Math.min(1, dt * 14);
    // jump squash: lean a touch while airborne
    hero.rotation.x = 0;
    mixer.update(S.onGround ? dt : dt * 0.4);


    key.target.position.set(S.x, S.y, S.z); key.position.set(S.x + 12, S.y + 16, S.z + 6);

    CUT_X = S.x + CUT_AHEAD; cutPlane.constant = CUT_X; ghostPlane.constant = -CUT_X;
    if (sideView) {
      const t = camTarget(), want = (cam.follow ? S.z - S.face * 0.5 : cam.freeZ) + cam.panZ;
      cam.panZ += t.zc - want;           // don't let pan accumulate past the edges
      placeCamera(false);
      applyCloseUp(Math.min(deltaMs / 1000, 0.05));
    } else controls.update();
  }
  updateTurn(dt);
  updateEnemy(dt, t);
  updateSoda(dt);
  for (const g of germs) {
    if (g.alive) { g.g.scale.y = 1 + Math.sin(t * 3 + g.phase) * 0.06; g.g.rotation.y = Math.sin(t * 1.3 + g.phase) * 0.25; }
    else if (g.g.visible) { g.t += dt * 3; const s = Math.max(0, 1 - g.t); g.g.scale.setScalar(s); g.g.position.y += dt; if (s <= 0) g.g.visible = false; }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; p.v.y -= 8 * dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(p.s0 * Math.min(1, Math.max(0, p.life) * 1.6));   // shrink away instead of fading
    if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
  }
  throatGlow.intensity = 20 + Math.sin(t * 1.3) * 6;
  updateDrips(dt, t);
  if (hero) autoTune(deltaMs / 1000);
  if (hero && blobShadow.visible) { blobShadow.position.set(S.x, (S.ground ?? S.y) + 0.02, S.z); blobShadow.scale.setScalar(THREE.MathUtils.clamp(1 - (S.y - (S.ground ?? S.y)) * 0.6, 0.45, 1)); }
  if (uvula) uvula.rotation.x = Math.sin(t * 0.9) * 0.05, uvula.rotation.z = Math.sin(t * 0.7 + 1) * 0.04;
  if (!Number.isFinite(S.x + S.y + S.z)) { S.x = START_X; S.z = START_Z; S.y = groundBelow(S.z, 4); S.vy = 0; S.onGround = true; }
  if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) placeCamera(true);
}
setQuality(quality);
return {
  canvas, update, setQuality,
  render(width, height) { resize(width, height); renderer.render(scene, camera); },
  status() { return { loading: !hero || (!enemyLoaded && !enemyLoadFailed), message: loadingMessage, error: enemyLoadFailed ? loadingMessage : '', cleaned, total: germs.length, flash: flashMessage, qualityMode, qualityLevel: qualityMode === 'auto' ? autoLevel : qualityMode, heroHp: Math.max(0, HERO.hp), enemyHp: Math.max(0, E.hp), enemyAlive: E.alive, enemyReady: enemyLoaded, turn: TURN.who, turnSeconds: Math.max(0, Math.ceil(TURN.left)), attackUsed: TURN.attackUsed, enemyPhase: TURN.phase }; },
  pan(dx, dy) {
    const worldPerPixel = 2 * halfWidth(cam.dist) / viewWidth;
    cam.panZ += dx * worldPerPixel;
    cam.panY = THREE.MathUtils.clamp(cam.panY + dy * worldPerPixel, -6, 10);
  },
  zoom(factor) { if (Number.isFinite(factor) && factor > 0) zoom(factor); },
  key(key, down) {
    const mapped = { left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown' }[key];
    if (mapped) { if (down) keys.add(mapped); else keys.delete(mapped); }
    if (!down) return;
    if (key === 'enter') { if (TURN.attackUsed) endTurnButton(); else attack('Poke'); }
    if (key === 'poke') attack('Poke');
    if (key === 'end-turn') endTurnButton();
    if (key === 'test-punch') testEnemyAttack('punch');
    if (key === 'test-squirt') testEnemyAttack('squirt');
    if (key === 'smash') attack('OverheadStrike');
    if (key === 'grid') { GRID_U.uGridOn.value = GRID_U.uGridOn.value ? 0 : 1; flash(GRID_U.uGridOn.value ? 'Grid on' : 'Grid off'); }
    if (key === 'jump') jump();
    if (key === 'view') toggleView();
    if (key === 'quality') cycleQuality();
    if (key === 'zoom-in') zoom(1 / 1.2);
    if (key === 'zoom-out') zoom(1.2);
  },
  suspend() { keys.clear(); autoT = autoFrames = 0; },
  dispose() {
    disposed = true;
    timers.clear();
    controls.dispose();
    mixer?.stopAllAction();
    eMixer?.stopAllAction();
    scene.traverse((object) => object.shadow?.dispose());
    disposeObject(scene);
    tongueTex.dispose();
    foamGeo.dispose();
    for (const material of Object.values(foamMats)) material.dispose();
    blobGeo.dispose();
    eyeGeo.dispose();
    scene.environment?.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
};
}
