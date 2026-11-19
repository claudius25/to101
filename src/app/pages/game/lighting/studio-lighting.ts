import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  BackSide,
  Box3,
  BufferAttribute,
  CircleGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  Light,
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFSoftShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  Scene,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  CanvasTexture,
  Texture,
  ToneMapping,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

import {
  MaterialRecipe,
  STUDIO_PRESET,
  StudioEnvironment,
  StudioPreset,
  Vec3,
} from './studio.config';

const TONE_MAPPING: Record<StudioPreset['toneMapping'], ToneMapping> = {
  neutral: NeutralToneMapping,
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
};

function toVector(value: Vec3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

/**
 * Exact bounds of `node`'s geometry expressed in `frame`'s local space.
 *
 * `Box3.setFromObject` works in world space, which is no good here: the frame holding
 * the device is rotated by the dev panel, and a rotated world-space box would hand the
 * rig the wrong centre and the wrong length.
 */
function boundsIn(node: Object3D, frame: Object3D): Box3 {
  const box = new Box3();
  const inverse = new Matrix4();
  const matrix = new Matrix4();
  const point = new Vector3();

  node.updateWorldMatrix(true, true);
  frame.updateWorldMatrix(true, false);
  inverse.copy(frame.matrixWorld).invert();

  node.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) {
      return;
    }

    const position = mesh.geometry.getAttribute('position') as BufferAttribute | undefined;
    if (!position) {
      return;
    }

    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    for (let index = 0; index < position.count; index++) {
      box.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(matrix));
    }
  });

  return box;
}

/**
 * First node whose name starts with `prefix`. GLTFLoader sanitises `name` (bullets and
 * spaces are rewritten), so the original is read from `userData.name` where present.
 */
function findPart(root: Object3D, prefix: string): Object3D | null {
  let found: Object3D | null = null;

  root.traverse((node) => {
    if (found) {
      return;
    }

    const raw = node.userData['name'];
    const name = typeof raw === 'string' ? raw : node.name;
    if (name && name.startsWith(prefix)) {
      found = node;
    }
  });

  return found;
}

/** Fine bead-blast grain: a tiling normal map and a matching roughness map, made once. */
function makeGrain(): { normal: DataTexture; roughness: DataTexture } {
  const size = 256;
  const height = new Float32Array(size * size);
  for (let index = 0; index < height.length; index++) {
    height[index] = Math.random();
  }

  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];
  const smooth = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += at(x + dx, y + dy);
        }
      }
      smooth[y * size + x] = sum / 9;
    }
  }

  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const s = (x: number, y: number): number =>
    smooth[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      let nx = -(s(x + 1, y) - s(x - 1, y)) * 2.2;
      let ny = -(s(x, y + 1) - s(x, y - 1)) * 2.2;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      normal.set(
        [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255],
        index * 4,
      );
      const r = 200 + (smooth[index] - 0.5) * 120; // roughnessMap reads G
      roughness.set([r, r, r, 255], index * 4);
    }
  }

  const texture = (data: Uint8Array): DataTexture => {
    const map = new DataTexture(data, size, size);
    map.wrapS = map.wrapT = RepeatWrapping;
    map.generateMipmaps = true;
    map.minFilter = LinearMipmapLinearFilter;
    map.magFilter = LinearFilter;
    map.repeat.set(5, 5);
    map.needsUpdate = true;
    return map;
  };

  return { normal: texture(normal), roughness: texture(roughness) };
}

/**
 * Concentric machining rings, drawn by the shader on the flat caps of round parts.
 * The pattern is scaled per mesh (`uScale`, `uAxis`), set in `onBeforeRender`, because
 * the glTF meshes are a few millimetres across in their own space.
 */
function machine(material: MeshStandardMaterial, rings: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uRings'] = { value: rings };
    shader.uniforms['uScale'] = { value: 1 };
    shader.uniforms['uAxis'] = { value: new Vector3(0, 1, 0) };
    material.userData['shader'] = shader;

    shader.vertexShader =
      'varying vec3 vLocalPosition;\nvarying vec3 vLocalNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vLocalPosition = position;\n  vLocalNormal = normal;',
      );

    shader.fragmentShader =
      'varying vec3 vLocalPosition;\nvarying vec3 vLocalNormal;\nuniform float uRings;\nuniform float uScale;\nuniform vec3 uAxis;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n  float machinedRing = 0.0;',
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          {
            // only faces that look along the part's axis: the flat cap, not the barrel
            float cap = smoothstep( 0.9, 0.98, abs( dot( normalize( vLocalNormal ), uAxis ) ) );
            float r = length( vLocalPosition - uAxis * dot( vLocalPosition, uAxis ) ) * uScale;
            float ring = sin( r * uRings * 6.2832 ) * 0.5 + 0.5;
            float fine = sin( r * uRings * 2.7 * 6.2832 ) * 0.5 + 0.5;
            roughnessFactor = clamp( roughnessFactor + cap * ( ( ring - 0.5 ) * 0.22 + ( fine - 0.5 ) * 0.1 - 0.06 ), 0.04, 1.0 );
            machinedRing = cap * ( ring * 0.7 + fine * 0.3 );
          }`,
        )
        .replace(
          '#include <lights_fragment_begin>',
          'diffuseColor.rgb *= 1.0 - 0.16 * machinedRing;\n#include <lights_fragment_begin>',
        );
  };
  material.customProgramCacheKey = () => `machined-${rings}`;
}

/**
 * The device's studio: one baked environment of softboxes for all the light, re-dressed
 * materials, a glowing "ROLL THE DICE" label, and optional punctual lights.
 *
 * It owns everything about the look — tone mapping, the environment and its intensity,
 * shadows — so nothing from an older rig can stack on top. Build it once the model has
 * loaded, and keep it turning with the device:
 *
 *     lighting.prepare(renderer, scene);          // before the first frame
 *     lighting.attach(model, pivot);              // after the GLB is in the pivot
 *     lighting.update();                          // every frame, before render
 */
export class StudioLighting {
  readonly group = new Group();

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private frame: Object3D | null = null;
  private environment: WebGLRenderTarget | null = null;
  private grain: { normal: DataTexture; roughness: DataTexture } | null = null;
  /** Materials and textures the rig made, kept so they can be disposed with it. */
  private readonly owned: (Material | Texture)[] = [];

  private readonly worldQuaternion = new Quaternion();
  private diceBlinkMs = 0;
  private readonly diceLabelMaterials: {
    material: MeshStandardMaterial;
    color: Color;
    emissive: Color;
    intensity: number;
  }[] = [];

  constructor(private readonly preset: StudioPreset = STUDIO_PRESET) {
    this.group.name = 'Studio rig';
  }

  /** Renderer and scene settings, and the baked studio. Call once, before the first frame. */
  prepare(renderer: WebGLRenderer, scene: Scene): void {
    this.renderer = renderer;
    this.scene = scene;

    renderer.toneMapping = TONE_MAPPING[this.preset.toneMapping];
    renderer.toneMappingExposure = this.preset.toneMappingExposure;
    renderer.shadowMap.enabled = this.preset.shadows.enabled;
    if (this.preset.shadows.enabled) {
      renderer.shadowMap.type = PCFSoftShadowMap;
    }

    this.environment?.dispose();
    this.environment = this.bakeStudio(renderer, this.preset.environment);
    scene.environment = this.environment.texture;
    scene.environmentIntensity = this.preset.environmentIntensity;
  }

  /**
   * Re-dresses the model's materials and parents the rig to `frame`, the object the model
   * sits in. Returns the names of any parts the preset asked for and could not find.
   */
  attach(model: Object3D, frame: Object3D): string[] {
    const missing: string[] = [];
    this.frame = frame;
    if (!this.grain) {
      this.grain = makeGrain();
      this.owned.push(this.grain.normal, this.grain.roughness);
    }

    this.dress(model);

    for (const accent of this.preset.accents) {
      const part = findPart(model, accent.part);
      if (!part) {
        missing.push(accent.part);
        console.warn(`Studio lighting: no part named "${accent.part}"; it stays unlit.`);
        continue;
      }
      this.glow(part, accent.color, accent.intensity);
    }

    this.diceLabelMaterials.length = 0;
    findPart(model, 'Label • ROLL THE DICE')?.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const source of materials) {
        const material = source as MeshStandardMaterial;
        if (!material.isMeshStandardMaterial) continue;
        this.diceLabelMaterials.push({
          material,
          color: material.color.clone(),
          emissive: material.emissive.clone(),
          intensity: material.emissiveIntensity,
        });
      }
    });

    if (this.preset.directionals.length > 0) {
      const bounds = boundsIn(model, frame);
      const size = bounds.getSize(new Vector3());
      const radius = bounds.getBoundingSphere(new Sphere()).radius || 1;
      const scale = size.z > 0 ? size.z / this.preset.referenceLength : 1;

      for (const spec of this.preset.directionals) {
        const light = new DirectionalLight(new Color(spec.color), spec.intensity);
        light.position.copy(toVector(spec.position).multiplyScalar(scale));
        light.target.position.set(0, 0, 0);
        if (spec.castShadow && this.preset.shadows.enabled) {
          this.castShadows(light, radius);
        }
        this.group.add(light, light.target);
      }

      if (this.preset.shadows.enabled) {
        model.traverse((node) => {
          const mesh = node as Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
      }
    }

    frame.add(this.group);
    this.update();
    return missing;
  }

  /**
   * Turns the studio with the device's frame, so the highlights stay on the keypad and the
   * rollers however the device is posed. Cheap: one matrix decomposition per frame.
   */
  update(): void {
    const scene = this.scene;
    const frame = this.frame;
    if (!scene || !frame || !this.preset.followDevice) {
      return;
    }

    frame.updateWorldMatrix(true, false);
    frame.getWorldQuaternion(this.worldQuaternion);
    // From three r17x on, the environment is sampled with the exact inverse of
    // `environmentRotation` (the transpose of its matrix), so turning the studio with the device
    // is just the frame's own world rotation — exact for any combination of pitch, yaw and roll.
    scene.environmentRotation.setFromQuaternion(this.worldQuaternion);
  }

  /** Blink only the lever lettering while a roll is available. */
  updateDiceReadiness(ready: boolean, deltaMs: number): void {
    this.diceBlinkMs = ready ? this.diceBlinkMs + deltaMs : 0;
    const white = ready && this.diceBlinkMs % 1000 < 500;
    for (const label of this.diceLabelMaterials) {
      label.material.color.copy(label.color);
      label.material.emissive.copy(label.emissive);
      label.material.emissiveIntensity = label.intensity;
      if (white) {
        label.material.color.set('#fff');
        label.material.emissive.set('#fff');
        label.material.emissiveIntensity = 1;
      }
    }
  }

  dispose(): void {
    this.diceLabelMaterials.length = 0;
    this.group.traverse((node) => {
      (node as Partial<Light>).dispose?.();
    });
    this.group.removeFromParent();
    this.group.clear();

    for (const item of this.owned) {
      item.dispose();
    }
    this.owned.length = 0;
    this.grain = null;

    if (this.scene && this.environment && this.scene.environment === this.environment.texture) {
      this.scene.environment = null;
      this.scene.environmentRotation.set(0, 0, 0);
    }
    this.environment?.dispose();
    this.environment = null;
    this.frame = null;
    this.scene = null;
    this.renderer = null;
  }

  /** Renders the softboxes once into a pre-filtered environment map. */
  private bakeStudio(renderer: WebGLRenderer, spec: StudioEnvironment): WebGLRenderTarget {
    const studio = new Scene();
    const room = new Mesh(
      new SphereGeometry(20, 32, 16),
      new MeshBasicMaterial({
        side: BackSide,
        color: new Color(spec.room.color).multiplyScalar(spec.room.intensity),
      }),
    );
    studio.add(room);

    let gradient: CanvasTexture | null = null;
    for (const box of spec.softboxes) {
      const material = new MeshBasicMaterial({
        color: new Color(box.color).multiplyScalar(box.intensity),
        side: DoubleSide,
      });
      if (box.gradient) {
        gradient ??= this.verticalGradient();
        material.map = gradient;
      }
      const geometry =
        box.shape === 'disc'
          ? new CircleGeometry(box.width / 2, 48)
          : new PlaneGeometry(box.width, box.height);
      const panel = new Mesh(geometry, material);
      panel.position.copy(toVector(box.position));
      panel.lookAt(0, 0, 0);
      studio.add(panel);
    }

    if (spec.floor) {
      const floor = new Mesh(
        new CircleGeometry(14, 48),
        new MeshBasicMaterial({
          side: DoubleSide,
          color: new Color(spec.floor.color).multiplyScalar(spec.floor.intensity),
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -spec.floor.depth;
      studio.add(floor);
    }

    const pmrem = new PMREMGenerator(renderer);
    const target = pmrem.fromScene(studio, spec.blur);
    pmrem.dispose();

    studio.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
      }
    });
    gradient?.dispose();
    return target;
  }

  private verticalGradient(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const fill = context.createLinearGradient(0, 0, 0, 256);
    fill.addColorStop(0, '#fff');
    fill.addColorStop(0.55, '#888');
    fill.addColorStop(1, '#000');
    context.fillStyle = fill;
    context.fillRect(0, 0, 4, 256);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  /** Swaps every material on the model for its studio version. */
  private dress(model: Object3D): void {
    const made = new Map<Material, Material>();

    model.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) {
        return;
      }

      const before = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const after = before.map((material) => {
        let next = made.get(material);
        if (!next) {
          next = this.redress(material);
          made.set(material, next);
        }
        return next;
      });
      mesh.material = Array.isArray(mesh.material) ? after : after[0];

      // Machined caps: scale the rings to this mesh's own size and axis.
      const machined = after.filter((material) => material.userData['machined']);
      if (machined.length > 0) {
        mesh.geometry.computeBoundingBox();
        const extent = mesh.geometry.boundingBox!.getSize(new Vector3()).toArray();
        // The axis is the dimension that differs most from the other two, which span the cap.
        const odd = [0, 1, 2].map(
          (i) =>
            Math.abs(extent[i] - (extent[(i + 1) % 3] + extent[(i + 2) % 3]) / 2) /
            Math.max(...extent),
        );
        const axisIndex = odd.indexOf(Math.max(...odd));
        const axis = new Vector3().setComponent(axisIndex, 1);
        const scale =
          1 / (Math.max(extent[(axisIndex + 1) % 3], extent[(axisIndex + 2) % 3]) * 0.5);
        mesh.onBeforeRender = () => {
          for (const material of machined) {
            const shader = material.userData['shader'];
            if (shader) {
              shader.uniforms['uScale'].value = scale;
              shader.uniforms['uAxis'].value.copy(axis);
            }
          }
        };
      }
    });

    for (const [old] of made) {
      old.dispose();
    }
  }

  private redress(source: Material): Material {
    const original = source as MeshStandardMaterial;
    const recipe: MaterialRecipe | undefined = this.preset.materials.find((entry) =>
      source.name.startsWith(entry.match),
    );

    const base = {
      name: source.name,
      side: source.side,
      color: recipe?.color
        ? new Color(recipe.color)
        : (original.color?.clone() ?? new Color(0xffffff)),
      metalness: recipe?.metalness ?? original.metalness ?? 0,
      roughness: recipe?.roughness ?? Math.max(0.12, original.roughness ?? 0.5),
      emissive: recipe?.emissive
        ? new Color(recipe.emissive)
        : (original.emissive?.clone() ?? new Color(0x000000)),
      emissiveIntensity: recipe?.emissiveIntensity ?? original.emissiveIntensity ?? 1,
      envMapIntensity: recipe?.envMapIntensity ?? 1,
    };

    const material =
      recipe?.kind === 'physical'
        ? new MeshPhysicalMaterial({
            ...base,
            clearcoat: recipe.clearcoat ?? 0,
            clearcoatRoughness: recipe.clearcoatRoughness ?? 0,
          })
        : new MeshStandardMaterial(base);

    if (recipe?.grain && this.grain) {
      material.normalMap = this.grain.normal;
      material.normalScale = new Vector2(recipe.grain, recipe.grain);
      if (recipe.grainRoughness) {
        material.roughnessMap = this.grain.roughness;
      }
    }

    if (recipe?.machined) {
      machine(material, recipe.machined);
      material.userData['machined'] = true;
    }

    this.owned.push(material);
    return material;
  }

  private castShadows(light: DirectionalLight, radius: number): void {
    const { mapSize, normalBias } = this.preset.shadows;
    const distance = light.position.length();
    const extent = radius * 1.25;

    light.castShadow = true;
    light.shadow.mapSize.set(mapSize, mapSize);
    light.shadow.normalBias = radius * normalBias;

    const camera = light.shadow.camera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.near = Math.max(distance - radius * 2, radius * 0.01);
    camera.far = distance + radius * 2;
    camera.updateProjectionMatrix();
  }

  /** Clones the part's material first, so nothing else sharing it starts glowing. */
  private glow(part: Object3D, color: string, intensity: number): void {
    part.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) {
        return;
      }

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = materials.map((material) => {
        const copy = material.clone() as MeshStandardMaterial;
        if (copy.emissive) {
          copy.emissive = new Color(color);
          copy.emissiveIntensity = intensity;
        }
        this.owned.push(copy);
        return copy;
      });

      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });
  }
}
