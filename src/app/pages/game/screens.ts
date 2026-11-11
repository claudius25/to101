import {
  Box3,
  BufferAttribute,
  Camera,
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';

import { SCREEN_CONFIG, ScreenConfig, ScreenDefinition } from './screen.config';
import { findNode } from './rig-utils';

/** Live data the built-in dev painters draw. Mutated in place by the render loop. */
export interface ScreenInfo {
  lastKey: string;
  roll: string;
  rolling: boolean;
}

export interface ScreenPaintContext {
  ctx: CanvasRenderingContext2D;
  /** Canvas resolution, in pixels. */
  width: number;
  height: number;
  definition: ScreenDefinition;
  info: ScreenInfo;
  elapsedMs: number;
  /** True for the very last frame before the canvas is frozen into a texture. */
  frozen: boolean;
}

export type ScreenPainter = (frame: ScreenPaintContext) => void;

/** Raw pointer phases forwarded from an interactive overlay canvas. */
export type ScreenPointerPhase = 'down' | 'up' | 'cancel';

/** CSS box of an overlay canvas, in pixels relative to the WebGL canvas. */
interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Axis3 = 'x' | 'y' | 'z';

/** How a plane is oriented so its texture sits face-up on a given box face. */
const FACE_AXES: Record<Axis3, { u: Axis3; v: Axis3; rotation: [number, number, number] }> = {
  x: { u: 'z', v: 'y', rotation: [0, Math.PI / 2, 0] },
  y: { u: 'x', v: 'z', rotation: [-Math.PI / 2, 0, 0] },
  z: { u: 'x', v: 'y', rotation: [0, 0, 0] },
};

const LOCAL_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

/** Exact bounds of a node's own geometry, in that node's local space. */
function localBounds(node: Object3D): Box3 {
  const box = new Box3();
  const inverse = new Matrix4();
  const matrix = new Matrix4();
  const point = new Vector3();

  node.updateWorldMatrix(true, true);
  inverse.copy(node.matrixWorld).invert();

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

class Screen {
  /** Plane parented to the screen mesh, so it inherits the face's exact tilt. */
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  /** Draws the surface. `null` leaves the real screen showing through. */
  painter: ScreenPainter | null = null;
  onPointer: ((phase: ScreenPointerPhase, x: number, y: number) => void) | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private texture: CanvasTexture | null = null;
  private readonly corners: Vector3[] = [];
  private readonly point = new Vector3();
  private rect: ScreenRect | null = null;
  private visible = false;

  constructor(
    readonly definition: ScreenDefinition,
    private readonly config: ScreenConfig,
  ) {}

  get ready(): boolean {
    return this.mesh !== null && this.context !== null;
  }

  bind(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    canvas.style.display = 'none';

    if (this.definition.interactive) {
      canvas.style.pointerEvents = 'auto';
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', this.handleDown);
      canvas.addEventListener('pointerup', this.handleUp);
      canvas.addEventListener('pointercancel', this.handleCancel);
    }
  }

  /** Builds the snapshot plane over `node`'s outward face. */
  attach(node: Object3D): boolean {
    const canvas = this.canvas;
    if (!canvas) {
      return false;
    }

    const box = localBounds(node);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
      return false;
    }

    // The thinnest axis of a screen slab is the one its face looks along.
    const normal = (['x', 'y', 'z'] as Axis3[]).reduce((thinnest, axis) =>
      size[axis] <= size[thinnest] ? axis : thinnest,
    );
    const face = FACE_AXES[normal];
    const scale = node.getWorldScale(new Vector3());

    const inset = 1 - 2 * this.config.inset;
    const width = size[face.u] * inset;
    const height = size[face.v] * inset;

    canvas.width = this.pixels(width * Math.abs(scale[face.u]));
    canvas.height = this.pixels(height * Math.abs(scale[face.v]));

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;

    const mesh = new Mesh(
      new PlaneGeometry(width, height),
      // Unlit and untonemapped, so the texture matches the DOM canvas pixel for pixel.
      new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
    );
    mesh.name = `Overlay • ${this.definition.id}`;
    mesh.rotation.set(...face.rotation);
    mesh.position.copy(center);
    mesh.position[normal] =
      box.max[normal] + this.config.liftMetres / (Math.abs(scale[normal]) || 1);
    mesh.visible = false;
    // Never steal a tap from the keys or the lever underneath.
    mesh.raycast = () => undefined;
    mesh.renderOrder = 10;

    node.add(mesh);
    mesh.updateMatrixWorld(true);

    for (const [u, v] of LOCAL_CORNERS) {
      this.corners.push(new Vector3(u * width, v * height, 0));
    }

    this.mesh = mesh;
    this.texture = texture;
    return true;
  }

  paint(info: ScreenInfo, elapsedMs: number, frozen: boolean): void {
    const ctx = this.context;
    const canvas = this.canvas;
    if (!ctx || !canvas) {
      return;
    }

    if (!this.painter) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    this.painter({
      ctx,
      width: canvas.width,
      height: canvas.height,
      definition: this.definition,
      info,
      elapsedMs,
      frozen,
    });
  }

  /** Copies whatever is on the 2D canvas right now into the WebGL texture. */
  snapshot(): void {
    if (this.texture) {
      this.texture.needsUpdate = true;
    }
  }

  /** Lays the DOM canvas over the projection of the plane, in CSS pixels. */
  showDom(camera: Camera, viewWidth: number, viewHeight: number): void {
    const canvas = this.canvas;
    const mesh = this.mesh;
    if (!canvas || !mesh) {
      return;
    }

    mesh.updateWorldMatrix(true, false);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const corner of this.corners) {
      this.point.copy(corner).applyMatrix4(mesh.matrixWorld).project(camera);
      const x = (this.point.x * 0.5 + 0.5) * viewWidth;
      const y = (-this.point.y * 0.5 + 0.5) * viewHeight;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    this.applyRect({ left: minX, top: minY, width: maxX - minX, height: maxY - minY });

    if (!this.visible) {
      this.visible = true;
      canvas.style.display = 'block';
    }
  }

  hideDom(): void {
    if (!this.visible || !this.canvas) {
      return;
    }

    this.visible = false;
    this.canvas.style.display = 'none';
  }

  dispose(): void {
    this.hideDom();
    this.rect = null;

    const canvas = this.canvas;
    if (canvas && this.definition.interactive) {
      canvas.removeEventListener('pointerdown', this.handleDown);
      canvas.removeEventListener('pointerup', this.handleUp);
      canvas.removeEventListener('pointercancel', this.handleCancel);
    }
    this.onPointer = null;

    const mesh = this.mesh;
    if (mesh) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.mesh = null;
    }

    this.texture?.dispose();
    this.texture = null;
    this.corners.length = 0;
  }

  private readonly handleDown = (event: PointerEvent): void => {
    // Capture so a finger that slides off the screen still reports its release.
    this.canvas?.setPointerCapture(event.pointerId);
    event.preventDefault();
    this.report('down', event);
  };

  private readonly handleUp = (event: PointerEvent): void => {
    this.report('up', event);
  };

  private readonly handleCancel = (event: PointerEvent): void => {
    this.report('cancel', event);
  };

  /** Turns a client-space pointer event into canvas pixels. */
  private report(phase: ScreenPointerPhase, event: PointerEvent): void {
    const canvas = this.canvas;
    if (!canvas || !this.onPointer) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    this.onPointer(
      phase,
      ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    );
  }

  /** Only touches the style when the box actually moved, to avoid needless layout. */
  private applyRect(rect: ScreenRect): void {
    const previous = this.rect;
    const moved =
      !previous ||
      Math.abs(previous.left - rect.left) > 0.05 ||
      Math.abs(previous.top - rect.top) > 0.05 ||
      Math.abs(previous.width - rect.width) > 0.05 ||
      Math.abs(previous.height - rect.height) > 0.05;

    if (!moved || !this.canvas) {
      return;
    }

    this.rect = rect;
    const style = this.canvas.style;
    style.left = `${rect.left.toFixed(2)}px`;
    style.top = `${rect.top.toFixed(2)}px`;
    style.width = `${rect.width.toFixed(2)}px`;
    style.height = `${rect.height.toFixed(2)}px`;
  }

  private pixels(metres: number): number {
    const size = Math.round(metres * this.config.pixelsPerMetre);
    return Math.max(16, Math.min(this.config.maxTextureSize, size));
  }
}

/**
 * Keeps the 2D overlays and their 3D stand-ins in sync.
 *
 * Call `bind` with the DOM canvases before `attach`, then `update` once per frame with
 * `live = true` while the device is at its home framing.
 */
export class Screens {
  /** Fired when the overlays flip between live DOM canvases and frozen textures. */
  onModeChange: ((live: boolean) => void) | null = null;
  /** Taps on an interactive surface, in that surface's canvas pixels. */
  onPointer: ((id: string, phase: ScreenPointerPhase, x: number, y: number) => void) | null = null;

  readonly info: ScreenInfo = { lastKey: '', roll: '', rolling: false };

  private readonly screens: Screen[];
  private live = false;
  private attached = false;
  private elapsedMs = 0;
  private sinceRepaintMs = 0;

  constructor(private readonly config: ScreenConfig = SCREEN_CONFIG) {
    this.screens = config.screens.map((definition) => new Screen(definition, config));
    for (const screen of this.screens) {
      screen.onPointer = (phase, x, y) => this.onPointer?.(screen.definition.id, phase, x, y);
    }
  }

  get ready(): boolean {
    return this.attached;
  }

  /** True while the DOM canvases are the ones on screen. */
  get isLive(): boolean {
    return this.live;
  }

  bind(id: string, canvas: HTMLCanvasElement): void {
    this.screens.find((screen) => screen.definition.id === id)?.bind(canvas);
  }

  setPainter(id: string, painter: ScreenPainter): void {
    const screen = this.screens.find((candidate) => candidate.definition.id === id);
    if (screen) {
      screen.painter = painter;
    }
  }

  /** Repaints the live canvases on the next frame instead of waiting for the tick. */
  invalidate(): void {
    this.sinceRepaintMs = Infinity;
  }

  /** Hangs an overlay plane off each screen mesh. Returns the fragments it missed. */
  attach(root: Object3D): string[] {
    const missing: string[] = [];

    for (const screen of this.screens) {
      const node = findNode(root, screen.definition.node);
      if (!node || !screen.attach(node)) {
        missing.push(screen.definition.node);
      }
    }

    this.attached = this.screens.some((screen) => screen.ready);
    return missing;
  }

  update(deltaMs: number, live: boolean, camera: Camera, width: number, height: number): void {
    if (!this.attached) {
      return;
    }

    this.elapsedMs += deltaMs;
    const changed = live !== this.live;
    this.live = live;

    if (changed) {
      this.onModeChange?.(live);
    }

    if (!live) {
      if (changed) {
        // Freeze: one final paint, copied into the texture, then the planes take over.
        for (const screen of this.screens) {
          screen.paint(this.info, this.elapsedMs, true);
          screen.snapshot();
          screen.hideDom();
          if (screen.mesh) {
            screen.mesh.visible = true;
          }
        }
      }
      return;
    }

    this.sinceRepaintMs += deltaMs;
    const repaint = changed || this.sinceRepaintMs >= this.config.repaintIntervalMs;
    if (repaint) {
      this.sinceRepaintMs = 0;
    }

    for (const screen of this.screens) {
      if (repaint) {
        screen.paint(this.info, this.elapsedMs, false);
      }
      if (screen.mesh) {
        screen.mesh.visible = false;
      }
      screen.showDom(camera, width, height);
    }
  }

  dispose(): void {
    for (const screen of this.screens) {
      screen.dispose();
    }
    this.attached = false;
    this.live = false;
    this.onModeChange = null;
    this.onPointer = null;
  }
}
