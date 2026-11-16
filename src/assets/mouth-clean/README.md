# 🦷 Tooth Explorer – Game Kit

Everything needed to put the Tooth Explorer hero and the Mouth level into your own game.

```
ToothExplorer_GameKit/
├── assets/
│   ├── ToothExplorer.glb        ← the hero: rigged + 5 animations (4.6 MB)
│   └── MouthScene.glb           ← the mouth level: teeth, gums, tongue, throat, saliva, plaque (4.6 MB)
├── blender/
│   └── ToothExplorer_rigged.blend   ← source file (2 scenes: "Scene" = hero, "MouthScene" = level)
├── web/                         ← the playable level, loading the .glb files above (use this to integrate)
│   ├── index.html               ← HUD, buttons, styles
│   └── game.js                  ← all game logic (three.js r170)
├── web-standalone/              ← same game with the models embedded – just double-click index.html
├── viewer-standalone/           ← the animation inspector for the hero – double-click index.html
├── renders/                     ← reference renders from Blender
└── README.md
```

---

## 1. Quick start

**Play it right away:** open `web-standalone/index.html` (needs internet once, to load three.js from the CDN).

**Run the integration version** (`web/`), which loads the real `.glb` files. Browsers block `fetch` from `file://`, so serve the **kit folder** over http:

```bash
cd ToothExplorer_GameKit
npx serve .            # or:  python -m http.server 8000
# then open  http://localhost:3000/web/   (or :8000/web/)
```

---

## 2. The hero – `assets/ToothExplorer.glb`

| Property | Value |
|---|---|
| Height | ~2.4 units (boots → helmet top), origin at the **feet**, centred |
| Facing | **+Z** in glTF / three.js (in Blender: −Y) |
| Rig | 1 skin, 16 joints (see below), max 4 influences per vertex |
| Materials | 16 named materials (see §5) – includes an `Outline` material for the ink line |

### Skeleton
```
root
└── hips
    ├── spine
    │   ├── head                      ← Helmet is parented here
    │   ├── upper_arm.L → forearm.L → hand.L   ← Toothbrush is parented to hand.L
    │   └── upper_arm.R → forearm.R → hand.R
    ├── thigh.L → shin.L → foot.L     ← Boot.L
    └── thigh.R → shin.R → foot.R     ← Boot.R
```
`.L` = the character's left = **+X**. Backpack is parented to `spine`.

### Animations (24 fps)
| Clip name | Length | Loop? | Notes |
|---|---|---|---|
| `Walk` | 1.04 s | loop | in place; in the level it's sped up ×1.6 (walk) / ×2.6 (run) |
| `FightStance` | 1.38 s | loop | idle guard, toothbrush raised like a sword |
| `Poke` | 1.04 s | **once** | lunge + thrust. Hit frame ≈ **0.38 s** |
| `OverheadStrike` | 1.38 s | **once** | raise → smash. Hit frame ≈ **0.70 s** |
| `MarchAndWave` | 2.04 s | loop / once | marching in place + waving |

All clips start and end in compatible poses, so cross-fades of 0.1–0.25 s look clean.
For one-shot attacks use `LoopOnce` + `clampWhenFinished`, then fade back to `FightStance` or `Walk`.

### Ink outline
Every hero mesh has an extra "inverted hull" (flipped normals, slightly inflated) using the material `Outline`.
To make it render as a black line:
- render it **front faces only** (`side = FrontSide`) with a flat unlit black colour;
- every other hero material should also be `FrontSide`.
If your engine has its own outline post-effect, you can simply hide/delete the `Outline` primitives.

---

## 3. The mouth – `assets/MouthScene.glb`

Units match Blender metres. Coordinates below are **glTF / three.js (Y-up)**.

| Thing | Where |
|---|---|
| Lips (front opening) | z ≈ +9.2 |
| Front teeth | z ≈ +6 … +7.6 |
| Tongue top surface | y ≈ 1.2 … 1.6 (front/middle), slopes down at the back |
| Throat entrance & uvula | z ≈ −10 … −11 |
| Throat tunnel end | z ≈ −32 (dark, fades to black) |
| Width (cheek to cheek) | x ≈ −10.8 … +10.8 |

### Node names (use them for gameplay)
| Prefix | What | Gameplay use |
|---|---|---|
| `Tongue` | the floor | **walkable ground** (raycast down onto it) |
| `Throat` | tunnel (inside faces) | walkable floor deeper in |
| `Tooth_lower_*` | lower teeth (40 teeth total) | platforms (jump onto them) |
| `Tooth_upper_*` | upper teeth | scenery / ceiling |
| `Gum_Upper`, `Gum_Lower`, `Lips`, `MouthCavity`, `ThroatArch`, `Uvula` | scenery | – |
| `Plaque_*` | yellow plaque clumps on teeth | decor (or targets) |
| `Saliva_Drip_*` | drip positions on upper teeth | the game hides these and spawns animated drool at their top point |
| `Saliva_Falling_*` | two static droplets | hidden in the game (optional) |
| `Tongue_Bubbles` | wet bubbles on the tongue | decor |

Teeth naming: `Tooth_{upper|lower}_{R|L}{1-10}_{incisor|lateral|canine|premolar|molar}` (R = +X side).

**The mouth has no animations.**

---

## 4. How the level puts them together

These are the values from `web/game.js` – copy them to match the look & feel:

```js
const HERO_SCALE = 0.31;               // hero is tiny inside the huge mouth
const LANE_X     = 2.6;                // start depth (top of the tongue's near lobe)
const X_MIN = -4.6, X_MAX = 4.6;       // walk deeper / closer to the camera
const Z_MIN = -24.4, Z_MAX = 7.2;      // throat end … behind the front teeth
const WALK = 1.25, RUN = 2.2;          // units / second
const JUMP_V = 4.9, GRAV = 15;         // jump ≈ 0.8 units high
const STEP = 0.24;                     // max bump he walks up without jumping
```

* **Ground:** every frame, raycast straight down at the hero's (x, z) against `Tongue`, `Throat` and `Tooth_lower_*`; snap to the hit when grounded, otherwise apply gravity.
* **Side camera (2.5D):** perspective, FOV 38°, placed at `+X` (looking toward −X) at `hero + (11.5, 3.5, 0)` by default, following the hero along z/y. Screen-right = toward the throat (−Z). Left edge of the view is clamped to the lips (z ≈ 9.9).
* **Cut-away:** a clipping plane at `x = heroX + 0.65` removes everything between the camera and the hero (gums, lips, cheek, tongue is **not** cut). The near side teeth are drawn again as a 32 % transparent "ghost" copy (`M_Enamel`, `M_Plaque` only). The **front teeth** (incisors, laterals, canines: `Tooth_*_[RL][1-3]_*`) are never cut or ghosted – they stay solid.
* **X-ray outline:** when a solid object hides the hero, a purple (`#b05cff`) outline of him is drawn on top. Two extra passes per hero mesh, drawn after the mouth but before the hero (`renderOrder` 20 → 21 → 30): (1) a stencil mask of his hidden parts (`depthFunc: GreaterDepth`, no colour), (2) a copy inflated along the normals by 0.14 hero units, drawn only where hidden and outside the mask. Both are nudged 0.12 units toward the camera so tiny overlaps (boots in the bumpy tongue) don't trigger it. Needs `new WebGLRenderer({ stencil: true })`.
* **Attacks:** at the hit frame, check germs within reach in the facing direction (Poke: 0.6 ahead, radius 0.5; Overhead: 0.45 ahead, radius 0.62).
* **Click / tap to move:** short click (< 6 px, < 450 ms) → raycast from the camera into the ground meshes (or onto a germ). The hero walks there; a pointer pops when he arrives. Drag = pan the camera.
* **Saliva:** for each `Saliva_Drip_*` the top point becomes the anchor of a strand + teardrop bead that oozes for 9–14 s (max ~78 % of the gap to the floor), drops, snaps back, rests 6–14 s.

---

## 5. Materials

Blender node setups don't all survive glTF, so the game **replaces the mouth materials by name** with cel-shaded (toon) ones. Recommended colours:

| Material | Colour | Notes |
|---|---|---|
| `M_Enamel` (teeth) | `#fff3dc` | toon |
| `M_Gum` | `#f0435a` | toon, double-sided |
| `M_Tongue` | `#ff6f7d` | toon + surface detail: a 256 px tileable canvas texture (R = small papillae, G = big bumps, B = blotches) projected from above in world space (`xz × 0.32` and `× 0.11`), plus a darker centre groove and a deeper colour toward the throat. Only 2 texture lookups – avoid loop-based noise shaders, they compile very slowly on Intel/ANGLE. |
| `M_MouthWall` | `#c42638` | toon |
| `M_Throat` | vertex colour: `#7a0c12` → `#080102` with depth | computed in code from z |
| `M_Uvula` | `#ff7a86` | toon (the game slims it to 0.5× width, 0.81× height and adds a slow sway) |
| `M_Lip` | `#e8344a` | toon, double-sided |
| `M_Plaque` | `#ffc531` | toon |
| `M_Saliva` | clear, IOR 1.34, transmission 1, roughness 0.04, clearcoat 1, pink attenuation `#ffd6d6` | physically-based for a wet look |

Toon ramp used: 3 hard bands (≈ 27 % / 63 % / 100 %).
Hero materials are converted to toon too (keeping their glTF base colours; `Lamp_Lens` keeps its emission).

---

## 6. Engine notes

### three.js
Everything is in `web/game.js`. Minimal loading code:
```js
const loader = new GLTFLoader();
const mouth = (await loader.loadAsync('assets/MouthScene.glb')).scene;
const heroGltf = await loader.loadAsync('assets/ToothExplorer.glb');
const hero = heroGltf.scene; hero.scale.setScalar(0.31);
const mixer = new THREE.AnimationMixer(hero);
const actions = Object.fromEntries(heroGltf.animations.map(c => [c.name, mixer.clipAction(c)]));
actions.FightStance.play();
// each frame: mixer.update(dt)
```

### Unity
* Import the `.glb` files with **glTFast** (`com.unity.cloud.gltfast`) or UnityGLTF.
* Rig is **Generic** (not Humanoid). Clips appear with the names above; set `Poke`/`OverheadStrike` to not loop.
* Unity is **left-handed**: the importer converts automatically; the hero faces **+Z** after import.
* Outline: use an "inverted hull" shader with `Cull Front` on the `Outline` material, or remove those submeshes and use a URP outline renderer feature.
* Scale the hero by ~0.31 relative to the mouth (or scale the mouth ×3.2).

### Godot 4
* Drop the `.glb` files into the project – native import. The hero gets an `AnimationPlayer` with the 5 clips.
* Turn on **Loop** for `Walk`, `FightStance`, `MarchAndWave` in the import dock.
* Toon look: `StandardMaterial3D` → Diffuse Mode **Toon**, Specular Mode **Toon**; for the `Outline` material: Cull Mode **Front**, Shading **Unshaded**, black.
* Use `RayCast3D` straight down for ground (Tongue / Throat / lower teeth), or add `StaticBody3D` + trimesh collision to those meshes on import.

### Unreal Engine 5
* Import with the **Interchange glTF** importer (drag the `.glb` into the Content Browser). The hero imports as a Skeletal Mesh + Skeleton + 5 Animation Sequences.
* Set import scale to 100 (metres → cm) if you want real-world size.
* Outline: two-sided off on the `Outline` material + *Unlit* black, or use a post-process outline.

---

## 7. Editing in Blender

`blender/ToothExplorer_rigged.blend` (Blender 5.1):
* **Scene "Scene"** – the hero: `ToothBody` + face pieces (skinned), gear (bone-parented), `ToothRig` armature. All 5 actions are stored as NLA tracks.
* **Scene "MouthScene"** – the mouth level. All mouth objects live in the `MouthExport` collection; the hero appears here as a linked collection instance (`Hero_Instance`).

**Re-exporting:**
* *Hero:* select `ToothRig` + all hero meshes → File › Export › glTF 2.0 → GLB, *Apply Modifiers* ON, *Animation mode: Actions*, *Skinning* ON.
* *Mouth:* make `MouthExport` the active collection → export with *Limit to › Active Collection* + *Include Nested* ON, *Apply Modifiers* ON. (For the web version a Decimate modifier was temporarily added: Tongue 0.22, Gums 0.3, Plaque 0.25, Saliva 0.4, Lips/Arch 0.5.)

---

## 8. Performance

Measured on an Intel UHD laptop GPU (1280×551 window, display scaling 150 %):

| | FPS | triangles / frame | draw calls |
|---|---|---|---|
| Original build | **1.7** | 1,625,000 | 424 |
| **Low** preset | **60** (vsync max) | 358,000 | 121 |
| **Medium** preset | **60** (vsync max) | 366,000 | 134 |
| **High** preset | ~46 | 436,000 | 186 |
| Ultra preset (refractive saliva) | ~32 | 680,000 | 220 |

What made the difference:
1. **Decimated the mouth** – teeth 17.9k → 1.6k triangles each (40 teeth), tongue/gums/plaque reduced too: whole mouth ~1M → 178k triangles (`MouthScene.glb` 4.7 → 2.9 MB).
2. **No refractive saliva** except on Ultra – a `transmission` material makes three.js render the whole scene a second time every frame. High uses a glossy see-through saliva instead.
3. **Fewer lights** on Low/Medium (warm + side fill off, replaced by a brighter hemisphere light – nearly free). The hero headlamp spotlight, halo and beam were removed.
4. **Pixel ratio** 0.75 (Low) / 1.0 (Medium) / ≤1.5 (High) instead of the screen's 1.5–2.0.
5. **Shadows:** Medium/High use one directional shadow map; Low uses a cheap soft "blob" shadow under the hero.
6. **Germs merged** into 3 meshes each (was ~11) → ~170 fewer draw calls.
7. **Fewer raycasts:** the blob shadow reuses the ground hit from the gravity step (game-logic time 6–11 ms → ~3.3 ms per frame).

**Auto mode** (default) starts at Medium (Low on phones / Mali / Adreno GPUs), steps down if FPS < 40 for 2.5 s, steps up if FPS > 54 (never to Ultra), and remembers levels that were too slow. The ⚙️ button cycles Auto → Low → Medium → High → Ultra.

**Benchmark:** open the game with `?bench=1` in the URL (served over http) – it measures each preset for ~5 s and POSTs JSON results to `/result` (or logs them to the console).

---

Have fun scrubbing! 🪥✨
