import {
  ACESFilmicToneMapping,
  Box3,
  BufferAttribute,
  Color,
  DirectionalLight,
  Group,
  Light,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PMREMGenerator,
  RectAreaLight,
  Scene,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import {
  STUDIO_PRESET,
  StripLight,
  StudioPreset,
  Vec3,
} from './studio.config';

/** RectAreaLight needs its lookup tables uploaded once per page, before first use. */
let uniformsReady = false;

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

/**
 * The device's studio rig: five RectAreaLight strips placed by hand, two more aimed at
 * named parts, a glowing "ROLL THE DICE" label, and a three-point directional set.
 *
 * It owns everything about the look — tone mapping, the environment map and its
 * intensity, shadows — so nothing from an older rig can stack on top of these
 * intensities. Build it once the model has loaded:
 *
 *     lighting.prepare(renderer, scene);          // before the first frame
 *     lighting.attach(model, pivot);              // after the GLB is in the pivot
 *
 * The rig is added to the same frame as the model, so it stays rigid in device space.
 */
export class StudioLighting {
  readonly group = new Group();

  private environment: Texture | null = null;
  private ownsEnvironment = false;
  /** Cloned materials, kept so they can be disposed with the rig. */
  private readonly clones: Material[] = [];
  private scene: Scene | null = null;

  constructor(private readonly preset: StudioPreset = STUDIO_PRESET) {
    this.group.name = 'Studio rig';
  }

  /** Renderer and scene settings. Safe to call once, before the first frame. */
  prepare(renderer: WebGLRenderer, scene: Scene): void {
    if (!uniformsReady) {
      RectAreaLightUniformsLib.init();
      uniformsReady = true;
    }

    this.scene = scene;

    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.preset.toneMappingExposure;

    if (this.preset.shadows.enabled) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
    }

    // Brushed aluminium only reads correctly with an environment to reflect.
    if (!scene.environment) {
      const pmrem = new PMREMGenerator(renderer);
      this.environment = pmrem.fromScene(new RoomEnvironment(), this.preset.environmentBlur).texture;
      this.ownsEnvironment = true;
      scene.environment = this.environment;
      pmrem.dispose();
    }

    scene.environmentIntensity = this.preset.environmentIntensity;
  }

  /**
   * Builds the rig around `model` and parents it to `frame`, the object the model sits
   * in. Returns the names of any parts the preset asked for and could not find.
   */
  attach(model: Object3D, frame: Object3D): string[] {
    const missing: string[] = [];
    const bounds = boundsIn(model, frame);
    const size = bounds.getSize(new Vector3());
    const radius = bounds.getBoundingSphere(new Sphere()).radius || 1;
    // Everything in the preset is quoted against a device this long on Z.
    const scale = size.z > 0 ? size.z / this.preset.referenceLength : 1;

    for (const spec of this.preset.strips) {
      const position = toVector(spec.position).multiplyScalar(scale);
      const target = toVector(spec.target).multiplyScalar(scale);
      this.group.add(this.strip(spec, position, target, scale));
    }

    for (const spec of this.preset.partStrips) {
      const part = findPart(model, spec.part);
      if (!part) {
        missing.push(spec.part);
        console.warn(`Studio lighting: no part named "${spec.part}"; its strip is skipped.`);
        continue;
      }

      // The part's own bounds are already in device units, only the offset scales.
      const target = boundsIn(part, frame).getCenter(new Vector3());
      const position = target.clone().addScaledVector(toVector(spec.offset), scale);
      this.group.add(this.strip(spec, position, target, scale));
    }

    for (const accent of this.preset.accents) {
      const part = findPart(model, accent.part);
      if (!part) {
        missing.push(accent.part);
        console.warn(`Studio lighting: no part named "${accent.part}"; it stays unlit.`);
        continue;
      }
      this.glow(part, accent.color, accent.intensity);
    }

    for (const spec of this.preset.directionals) {
      const light = new DirectionalLight(new Color(spec.color), spec.intensity);
      light.position.copy(toVector(spec.position).multiplyScalar(scale));
      light.target.position.set(0, 0, 0);

      if (spec.castShadow && this.preset.shadows.enabled) {
        this.castShadows(light, radius);
      }

      this.group.add(light, light.target);
    }

    if (this.preset.floorBounce > 0) {
      const bounce = new RectAreaLight(0xffffff, this.preset.floorBounce, size.x * 2, size.z * 2);
      bounce.position.set(0, bounds.min.y - size.y, 0);
      bounce.lookAt(0, 0, 0);
      this.group.add(bounce);
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

    frame.add(this.group);
    return missing;
  }

  dispose(): void {
    this.group.traverse((node) => {
      (node as Partial<Light>).dispose?.();
    });
    this.group.removeFromParent();
    this.group.clear();

    for (const material of this.clones) {
      material.dispose();
    }
    this.clones.length = 0;

    if (this.ownsEnvironment) {
      this.environment?.dispose();
      if (this.scene?.environment === this.environment) {
        this.scene.environment = null;
      }
    }

    this.environment = null;
    this.ownsEnvironment = false;
    this.scene = null;
  }

  /**
   * Strips are aimed while the rig is still detached, so `lookAt` resolves against an
   * identity parent and the orientation it works out is the device-space one.
   */
  private strip(
    spec: Pick<StripLight, 'color' | 'intensity' | 'width' | 'height' | 'rotateZ'>,
    position: Vector3,
    target: Vector3,
    scale: number,
  ): RectAreaLight {
    const light = new RectAreaLight(
      new Color(spec.color),
      spec.intensity,
      spec.width * scale,
      spec.height * scale,
    );

    light.position.copy(position);
    light.lookAt(target.x, target.y, target.z);
    if (spec.rotateZ) {
      light.rotateZ(spec.rotateZ);
    }

    return light;
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
        this.clones.push(copy);
        return copy;
      });

      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });
  }
}
