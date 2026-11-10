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
  painter: ScreenPainter;

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
  ) {
    this.painter = definition.theme === 'paper' ? paintPaper : paintGlass;
  }

  get ready(): boolean {
    return this.mesh !== null && this.context !== null;
  }

  bind(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    canvas.style.display = 'none';
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
    mesh.position[normal] = box.max[normal] + this.config.liftMetres / (Math.abs(scale[normal]) || 1);
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

  readonly info: ScreenInfo = { lastKey: '', roll: '', rolling: false };

  private readonly screens: Screen[];
  private live = false;
  private attached = false;
  private elapsedMs = 0;
  private sinceRepaintMs = 0;

  constructor(private readonly config: ScreenConfig = SCREEN_CONFIG) {
    this.screens = config.screens.map((definition) => new Screen(definition, config));
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
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function seconds(elapsedMs: number): string {
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

/** Dev artwork for the e-ink strip: matte paper, hard black ink, no glow. */
function paintPaper(frame: ScreenPaintContext): void {
  const { ctx, width, height, definition, info, elapsedMs, frozen } = frame;
  const unit = height / 100;
  const ink = '#15150f';

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#e9e7df';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(21, 21, 15, 0.55)';
  ctx.lineWidth = unit * 1.5;
  ctx.strokeRect(unit * 3, unit * 3, width - unit * 6, height - unit * 6);

  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';

  ctx.font = `600 ${unit * 14}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(definition.label, unit * 8, unit * 18);

  ctx.textAlign = 'right';
  ctx.fillText(frozen ? 'FROZEN' : seconds(elapsedMs), width - unit * 8, unit * 18);

  ctx.textAlign = 'left';
  ctx.font = `700 ${unit * 32}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(info.rolling ? 'ROLLING' : 'TO 101', unit * 8, height * 0.52);

  ctx.font = `500 ${unit * 14}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(`KEY ${info.lastKey || '--'}`, unit * 8, height - unit * 16);

  ctx.textAlign = 'right';
  ctx.fillText(info.roll ? `DICE ${info.roll}` : 'DICE --', width - unit * 8, height - unit * 16);

  // A marching tick proves the canvas is live rather than a frozen texture.
  if (!frozen) {
    const span = width - unit * 16;
    const x = unit * 8 + ((elapsedMs / 12) % span);
    ctx.fillStyle = ink;
    ctx.fillRect(x, height - unit * 7, unit * 6, unit * 2);
  }
}

/** Dev artwork for the black glass screen: backlit panel, orange accents. */
function paintGlass(frame: ScreenPaintContext): void {
  const { ctx, width, height, definition, info, elapsedMs, frozen } = frame;
  const unit = height / 100;
  const accent = '#ff8a3d';

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const glow = ctx.createLinearGradient(0, 0, 0, height);
  glow.addColorStop(0, '#13172a');
  glow.addColorStop(1, '#05070f');
  ctx.fillStyle = glow;
  roundedRect(ctx, 0, 0, width, height, unit * 6);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 138, 61, 0.45)';
  ctx.lineWidth = unit * 1.2;
  roundedRect(ctx, unit * 3, unit * 3, width - unit * 6, height - unit * 6, unit * 5);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  ctx.fillStyle = accent;
  ctx.font = `600 ${unit * 7}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(`${definition.label} • CANVAS 2D`, unit * 9, unit * 13);

  ctx.textAlign = 'right';
  ctx.fillStyle = frozen ? '#ff5f6d' : 'rgba(233, 238, 255, 0.65)';
  ctx.fillText(frozen ? 'FROZEN' : 'LIVE', width - unit * 9, unit * 13);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e9eeff';
  ctx.font = `700 ${unit * 20}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(info.rolling ? 'ROLLING…' : 'READY', unit * 9, unit * 32);

  ctx.font = `500 ${unit * 9}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(233, 238, 255, 0.78)';
  const lines = [
    `t     ${seconds(elapsedMs)}`,
    `key   ${info.lastKey || '--'}`,
    `dice  ${info.roll || '--'}`,
    `px    ${width}×${height}`,
  ];
  lines.forEach((line, index) => {
    ctx.fillText(line, unit * 9, unit * 48 + index * unit * 12);
  });

  // Sweeping bar: steady while live, stuck mid-travel once frozen.
  const trackLeft = unit * 9;
  const trackWidth = width - unit * 18;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(trackLeft, height - unit * 14, trackWidth, unit * 4);
  const progress = (elapsedMs / 2400) % 1;
  ctx.fillStyle = accent;
  ctx.fillRect(trackLeft, height - unit * 14, trackWidth * progress, unit * 4);
}
