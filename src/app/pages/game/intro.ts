import {
  BufferAttribute,
  BufferGeometry,
  Box3,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ClampToEdgeWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three';

import { INTRO_CONFIG, IntroConfig } from './intro.config';
import { findNode } from './rig-utils';

/** Phase of the reveal. The game only accepts input once it reads `open`. */
export type IntroState = 'waiting' | 'flipping' | 'open';

/** Share of the device thickness a vertex may sit above the lowest one and still count. */
const BACK_PLANE_TOLERANCE = 0.002;

/** Share of the run spent winding up. The remaining two thirds are the settle. */
const ACCELERATION_SHARE = 1 / 3;

const HALF_TURN = 180;
const FULL_TURN = 360;

/** Footprint of the traced back face, in model units. */
interface Footprint {
  minX: number;
  minZ: number;
  width: number;
  length: number;
}

/**
 * Face-down device, one tap, two axes of reveal.
 *
 * `attach` traces the device's own back face into a plate carrying the launcher
 * artwork, so the print follows the real silhouette — rounded corners included —
 * instead of a rectangle laid over it. From then on the class is just a clock: the
 * render loop hands it the frame timestamp, then reads `pitch`, `roll` and `lift` as
 * offsets to add to the device pose, and `blurPx` as the motion blur for the canvas.
 *
 * Every offset unwinds to exactly zero on the last frame, so the reveal lands on the
 * game's own framing with the front face toward the camera.
 */
export class Intro {
  /** Fired once, on the frame the device settles upright. */
  onFinished: (() => void) | null = null;

  private phase: IntroState = 'waiting';
  /** Stamped from the same clock the render loop reads. */
  private startTime = 0;
  private duration = INTRO_CONFIG.flip.durationMs;

  private pitchDeg = HALF_TURN;
  private rollDeg = 0;
  private liftMetres = 0;
  private blur = 0;
  /** Peak hop height, once the real device has been measured. */
  private hopMetres = 0;

  private plate: Mesh<BufferGeometry, MeshStandardMaterial> | null = null;
  private texture: Texture | null = null;
  private footprint: Footprint | null = null;

  constructor(private readonly config: IntroConfig = INTRO_CONFIG) {
    this.duration = config.flip.durationMs;

    // Started before the device is even asked for: the artwork is wanted the instant
    // the much heavier GLB lands.
    new TextureLoader().load(
      config.art.url,
      (texture) => this.receiveArt(texture),
      undefined,
      () => undefined,
    );
  }

  get state(): IntroState {
    return this.phase;
  }

  /** True while the device waits, face-down, for its first tap. */
  get pending(): boolean {
    return this.phase === 'waiting';
  }

  /** True once the reveal has landed and the game owns the device. */
  get finished(): boolean {
    return this.phase === 'open';
  }

  /** End-over-end offset, in degrees, to add to the device's pitch. */
  get pitch(): number {
    return this.pitchDeg;
  }

  /** Long-axis offset, in degrees, to add to the device's roll. */
  get roll(): number {
    return this.rollDeg;
  }

  /** Hop above the device's resting height, in metres. */
  get lift(): number {
    return this.liftMetres;
  }

  /** Motion blur for the current frame, in CSS pixels. Zero at rest and on landing. */
  get blurPx(): number {
    return this.blur;
  }

  /**
   * Prints the artwork across the device's back and measures it for the hop. Returns
   * the fragments it missed, in the same shape as the other rig modules.
   */
  attach(model: Object3D): string[] {
    return this.buildPlate(model) ? [] : [this.config.bodyNode];
  }

  /**
   * Begins the reveal, timed from `now`. Repeated taps while it plays are ignored.
   *
   * `durationMs` overrides the configured run, which is how the dev panel replays the
   * same flip at the studio's quarter speed.
   */
  start(now: number, durationMs = this.config.flip.durationMs): boolean {
    if (this.phase === 'flipping') {
      return false;
    }

    this.phase = 'flipping';
    this.startTime = now;
    this.duration = Math.max(1, durationMs);
    this.setPose(0, 0);
    return true;
  }

  /** Advances the flip. `now` must come from the same clock as `start`. */
  update(now: number): void {
    if (this.phase !== 'flipping') {
      return;
    }

    const t = MathUtils.clamp((now - this.startTime) / this.duration, 0, 1);
    const accelerating = t < ACCELERATION_SHARE;
    // One continuous arc: a quadratic wind-up into a quartic settle, which meet
    // halfway through the turn at matching speed.
    const phase = accelerating ? t / ACCELERATION_SHARE : (1 - t) / (1 - ACCELERATION_SHARE);
    const eased = accelerating ? 0.5 * phase ** 2 : 1 - 0.5 * phase ** 4;
    const speed = accelerating ? phase : phase ** 3;

    this.setPose(eased, speed);

    if (t === 1) {
      // Snapped rather than left to the arithmetic, so the device lands dead on the
      // game's pose. The state is cleared before the callback, so the game is only
      // ever entered once.
      this.pitchDeg = 0;
      this.rollDeg = 0;
      this.liftMetres = 0;
      this.blur = 0;
      this.phase = 'open';
      this.onFinished?.();
    }
  }

  dispose(): void {
    this.onFinished = null;

    const plate = this.plate;
    if (plate) {
      plate.removeFromParent();
      plate.geometry.dispose();
      plate.material.dispose();
      this.plate = null;
    }

    this.texture?.dispose();
    this.texture = null;
  }

  /**
   * The pose at a point on the arc. The pitch carries on through a second half-turn
   * rather than winding back, so both axes finish on a whole turn.
   */
  private setPose(eased: number, speed: number): void {
    this.pitchDeg = HALF_TURN * (1 + eased);
    this.rollDeg = FULL_TURN * eased;
    this.liftMetres = this.hopMetres * Math.sin(Math.PI * eased);
    this.blur = this.config.blur.maxPx * speed;
  }

  /**
   * Traces every triangle sitting on the device's lowest plane and facing away from
   * the front, then re-issues them as a plate lifted a hair clear of the metal.
   */
  private buildPlate(model: Object3D): boolean {
    const body = findNode(model, this.config.bodyNode);
    if (!body) {
      return false;
    }

    model.updateMatrixWorld(true);
    const toModel = new Matrix4().copy(model.matrixWorld).invert();
    const toPart = new Matrix4();
    const point = new Vector3();
    const bounds = new Box3();
    const parts: { points: Float32Array; order: ArrayLike<number> | null }[] = [];

    // Everything is lifted into the model's own space first: the body sits under a
    // non-uniform scale, which would otherwise stretch the artwork across the print.
    body.traverse((child) => {
      const mesh = child as Mesh;
      const position = mesh.isMesh
        ? (mesh.geometry.getAttribute('position') as BufferAttribute | undefined)
        : undefined;
      if (!position) {
        return;
      }

      toPart.multiplyMatrices(toModel, mesh.matrixWorld);
      const points = new Float32Array(position.count * 3);
      for (let index = 0; index < position.count; index++) {
        point.fromBufferAttribute(position, index).applyMatrix4(toPart);
        points[index * 3] = point.x;
        points[index * 3 + 1] = point.y;
        points[index * 3 + 2] = point.z;
        bounds.expandByPoint(point);
      }

      const indices = mesh.geometry.getIndex();
      parts.push({ points, order: indices ? indices.array : null });
    });

    const thickness = bounds.max.y - bounds.min.y;
    if (thickness <= 0) {
      return false;
    }

    // The hop is authored against a reference device, so it follows this one's length.
    const { metres, referenceLength } = this.config.hop;
    const deviceLength = bounds.max.z - bounds.min.z;
    this.hopMetres = referenceLength > 0 ? metres * (deviceLength / referenceLength) : 0;

    const ceiling = bounds.min.y + Math.max(thickness * BACK_PLANE_TOLERANCE, 1e-7);
    const lift = thickness * this.config.art.lift;
    const faces: number[] = [];
    const edgeA = new Vector3();
    const edgeB = new Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const { points, order } of parts) {
      const count = order ? order.length : points.length / 3;
      for (let index = 0; index + 2 < count; index += 3) {
        const a = (order ? order[index] : index) * 3;
        const b = (order ? order[index + 1] : index + 1) * 3;
        const c = (order ? order[index + 2] : index + 2) * 3;

        if (points[a + 1] > ceiling || points[b + 1] > ceiling || points[c + 1] > ceiling) {
          continue;
        }

        // Keep only the outward side, so a coplanar inner floor cannot sneak in.
        const ax = points[a];
        const ay = points[a + 1];
        const az = points[a + 2];
        edgeA.set(points[b] - ax, points[b + 1] - ay, points[b + 2] - az);
        edgeB.set(points[c] - ax, points[c + 1] - ay, points[c + 2] - az);
        if (edgeA.cross(edgeB).y >= 0) {
          continue;
        }

        for (const corner of [a, b, c]) {
          const x = points[corner];
          const z = points[corner + 2];
          faces.push(x, bounds.min.y - lift, z);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
      }
    }

    if (faces.length === 0) {
      return false;
    }

    const width = maxX - minX;
    const length = maxZ - minZ;
    if (width <= 0 || length <= 0) {
      return false;
    }

    this.footprint = { minX, minZ, width, length };

    // u runs along the device's short axis, v along its long axis, both read upright
    // from behind. The centred crop itself is left to the texture's own transform.
    const uvs = new Float32Array((faces.length / 3) * 2);
    const normals = new Float32Array(faces.length);
    for (let vertex = 0; vertex < faces.length / 3; vertex++) {
      uvs[vertex * 2] = (faces[vertex * 3] - minX) / width;
      uvs[vertex * 2 + 1] = (faces[vertex * 3 + 2] - minZ) / length;
      normals[vertex * 3 + 1] = -1;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(faces, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));

    const { emissive, roughness, metalness } = this.config.art;
    const plate = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: 0xffffff,
        emissive: new Color(0xffffff),
        emissiveIntensity: emissive,
        roughness,
        metalness,
      }),
    );
    plate.name = 'Back • launcher print';
    // Shown by `receiveArt`: an unprinted plate would only dull the metal.
    plate.visible = false;
    plate.castShadow = false;
    plate.receiveShadow = false;
    plate.raycast = () => undefined;

    model.add(plate);
    this.plate = plate;
    this.applyArt();
    return true;
  }

  private receiveArt(texture: Texture): void {
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.anisotropy = 8;
    this.texture = texture;
    this.applyArt();
  }

  /** Crops the artwork to the back face, centred, with its proportions intact. */
  private applyArt(): void {
    const plate = this.plate;
    const texture = this.texture;
    const footprint = this.footprint;
    const image = texture?.image as { width?: number; height?: number } | undefined;

    if (!plate || !texture || !footprint || !image?.width || !image.height) {
      return;
    }

    const art = image.width / image.height;
    const face = footprint.width / footprint.length;
    const scaleU = art >= face ? face / art : 1;
    const scaleV = art >= face ? 1 : art / face;

    texture.repeat.set(scaleU, scaleV);
    texture.offset.set((1 - scaleU) / 2, (1 - scaleV) / 2);
    texture.needsUpdate = true;

    plate.material.map = texture;
    plate.material.emissiveMap = texture;
    plate.material.needsUpdate = true;
    plate.visible = true;
  }
}
