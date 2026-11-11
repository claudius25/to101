import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  WritableSignal,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { SliderField } from '../../ui/slider-field/slider-field';
import { DiceRoll, DiceService } from '../../services/dice.service';
import { DiceMachine } from './dice-machine';
import { Keypad } from './keypad';
import { Screens } from './screens';
import { ScreenRouter } from './views/router';
import { StudioLighting } from './lighting/studio-lighting';
import { Curfew, CurfewOverride } from './e-ink/curfew';
import { CURFEW_CONFIG } from './e-ink/curfew.config';
import { EinkDisplay } from './e-ink/eink-display';
import { SCREEN_CONFIG } from './screen.config';
import { DICE_CONFIG } from './dice.config';
import {
  CameraMode,
  DEVICE_VIEW_CONFIG,
  DEVICE_VIEW_RANGES,
  DeviceViewConfig,
} from './device-view.config';
import {
  Box3,
  Group,
  MathUtils,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = 'assets/aluminium-device-game.glb';
const ELEVATION_LIMIT = 89;
const SECRET_TAPS = 3;
const SECRET_TAP_WINDOW_MS = 800;

type Status = 'loading' | 'ready' | 'error';
type CopyState = 'idle' | 'copied' | 'failed';

function boxCorners(box: Box3): Vector3[] {
  const corners: Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corners.push(new Vector3(x, y, z));
      }
    }
  }
  return corners;
}

@Component({
  selector: 'app-game',
  imports: [SliderField],
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly dice = inject(DiceService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly screenRefs = viewChildren<ElementRef<HTMLCanvasElement>>('screenCanvas');

  protected readonly ranges = DEVICE_VIEW_RANGES;
  /** Drives the overlay canvases in the template; order matches the bind order below. */
  protected readonly screenDefs = SCREEN_CONFIG.screens;

  protected readonly cameraMode = signal<CameraMode>(DEVICE_VIEW_CONFIG.camera.mode);
  protected readonly azimuth = signal(DEVICE_VIEW_CONFIG.camera.azimuth);
  protected readonly elevation = signal(DEVICE_VIEW_CONFIG.camera.elevation);
  protected readonly roll = signal(DEVICE_VIEW_CONFIG.camera.roll);
  protected readonly fov = signal(DEVICE_VIEW_CONFIG.camera.fov);
  protected readonly margin = signal(DEVICE_VIEW_CONFIG.camera.margin);
  protected readonly deviceX = signal(DEVICE_VIEW_CONFIG.device.pitch);
  protected readonly deviceY = signal(DEVICE_VIEW_CONFIG.device.yaw);
  protected readonly deviceZ = signal(DEVICE_VIEW_CONFIG.device.roll);
  protected readonly autoRotate = signal(DEVICE_VIEW_CONFIG.camera.autoRotate);
  protected readonly panelOpen = signal(false);
  protected readonly status = signal<Status>('loading');
  protected readonly copyState = signal<CopyState>('idle');

  /** Live view of the panel values, shaped exactly like device-view.config.ts. */
  protected readonly settings = computed<DeviceViewConfig>(() => ({
    camera: {
      mode: this.cameraMode(),
      fov: this.fov(),
      azimuth: Math.round(this.azimuth()),
      elevation: this.elevation(),
      roll: this.roll(),
      margin: this.margin(),
      autoRotate: this.autoRotate(),
    },
    device: {
      pitch: this.deviceX(),
      yaw: this.deviceY(),
      roll: this.deviceZ(),
    },
  }));

  protected readonly snippet = computed(() => JSON.stringify(this.settings(), null, 2));
  protected readonly errorMessage = signal('');
  protected readonly dimensions = signal('');
  protected readonly viewport = signal('');
  protected readonly lastRoll = signal<DiceRoll | null>(null);
  protected readonly lastKey = signal('');
  protected readonly rolling = signal(false);
  protected readonly rigWarning = signal('');
  /** True while the DOM overlays are shown; false once they are frozen into textures. */
  protected readonly screensLive = signal(false);
  /** Current view stack on the glass screen, e.g. "chapter-1 › settings". */
  protected readonly screenPath = signal('');
  /** Curfew windows, and the dev override that previews them off the clock. */
  protected readonly curfewRules = CURFEW_CONFIG.rules;
  protected readonly curfewOverride = signal<CurfewOverride>('auto');
  protected readonly curfewRule = signal('');

  private renderer: WebGLRenderer | null = null;
  private model: Object3D | null = null;
  private frameHandle = 0;
  private lastFrameMs = 0;
  private tapCount = 0;
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  /** Finger to key id, so two or three caps can be held down together. */
  private readonly keyPointers = new Map<number, string>();
  private leverPointerId: number | null = null;

  private readonly machine = new DiceMachine();
  private readonly keypad = new Keypad();
  private readonly screens = new Screens();
  private readonly router = new ScreenRouter();
  private readonly lighting = new StudioLighting();
  private readonly curfew = new Curfew();
  private readonly eink = new EinkDisplay(this.curfew);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private activeCamera: PerspectiveCamera | OrthographicCamera | null = null;

  private readonly scene = new Scene();
  /** Rotating this instead of the model keeps the pivot on the device's centre. */
  private readonly pivot = new Group();
  private readonly perspectiveCamera = new PerspectiveCamera(35, 1, 0.01, 100);
  private readonly orthographicCamera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);

  private localCorners: Vector3[] = [];
  private worldCorners: Vector3[] = [];
  private radius = 1;

  private readonly direction = new Vector3();
  private readonly axisX = new Vector3();
  private readonly axisY = new Vector3();
  private readonly axisZ = new Vector3();
  private readonly up = new Vector3();

  ngAfterViewInit(): void {
    this.bindScreens();
    this.zone.runOutsideAngular(() => this.init());
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameHandle);

    const canvas = this.canvasRef().nativeElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.machine.onSettled = null;
    this.keypad.onPress = null;
    this.keypad.onRelease = null;
    this.keyPointers.clear();
    this.leverPointerId = null;
    this.router.onChange = null;
    this.router.onInvalidate = null;
    this.eink.onReady = null;
    this.screens.dispose();

    if (this.tapTimer !== null) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
    }

    if (this.model) {
      this.pivot.remove(this.model);
      this.disposeObject(this.model);
      this.model = null;
    }

    this.scene.remove(this.pivot);

    this.lighting.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }

  protected onToggle(target: WritableSignal<boolean>, event: Event): void {
    target.set((event.target as HTMLInputElement).checked);
  }

  /** Three taps in the top-left corner, in quick succession, toggle the dev panel. */
  protected onCornerTap(): void {
    if (this.tapTimer !== null) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
    }

    this.tapCount += 1;
    if (this.tapCount >= SECRET_TAPS) {
      this.tapCount = 0;
      this.panelOpen.update((open) => !open);
      return;
    }

    this.tapTimer = setTimeout(() => {
      this.tapCount = 0;
      this.tapTimer = null;
    }, SECRET_TAP_WINDOW_MS);
  }

  /** Restores whatever is currently committed to device-view.config.ts. */
  protected reset(): void {
    const { camera, device } = DEVICE_VIEW_CONFIG;
    this.cameraMode.set(camera.mode);
    this.azimuth.set(camera.azimuth);
    this.elevation.set(camera.elevation);
    this.roll.set(camera.roll);
    this.fov.set(camera.fov);
    this.margin.set(camera.margin);
    this.autoRotate.set(camera.autoRotate);
    this.deviceX.set(device.pitch);
    this.deviceY.set(device.yaw);
    this.deviceZ.set(device.roll);
  }

  protected async copySettings(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.snippet());
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }

    setTimeout(() => this.copyState.set('idle'), 2000);
  }

  /** Hands each template canvas to the overlay it backs, in config order. */
  private bindScreens(): void {
    const elements = this.screenRefs();
    this.screenDefs.forEach((definition, index) => {
      const element = elements[index];
      if (element) {
        this.screens.bind(definition.id, element.nativeElement);
      }
    });
  }

  /** Hands each surface to the module that draws it. */
  private bindViews(): void {
    this.screens.setPainter('eink', (frame) => this.eink.paint(frame));
    this.screens.setPainter('glass', (frame) => this.router.paint(frame));
    this.screens.onPointer = (id, phase, pointerId, x, y) => {
      if (id === 'glass') {
        this.router.pointer(phase, pointerId, x, y);
      }
    };
    this.eink.onReady = () => this.screens.invalidate();
    this.router.onInvalidate = () => this.screens.invalidate();
    this.router.onChange = (path) => this.zone.run(() => this.screenPath.set(path));
    this.router.onBriefing = (card) => {
      this.eink.card = card;
      this.screens.invalidate();
    };
    this.router.announce();
  }

  private init(): void {
    const canvas = this.canvasRef().nativeElement;

    try {
      this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      this.fail('WebGL is not available on this device.');
      return;
    }

    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearAlpha(0);

    // Owns tone mapping, the environment map and every light in the scene.
    this.lighting.prepare(renderer, this.scene);

    this.loadModel();
    this.bindPointer(canvas);
    this.machine.onSettled = (roll) =>
      this.zone.run(() => {
        this.lastRoll.set(roll);
        this.rolling.set(false);
      });
    this.keypad.onPress = (id) => {
      this.router.key(id);
      this.zone.run(() => this.lastKey.set(id));
    };
    this.keypad.onRelease = (id) => this.router.keyUp(id);
    this.screens.onModeChange = (live) => {
      this.router.setLive(live);
      this.zone.run(() => this.screensLive.set(live));
    };
    this.bindViews();

    this.lastFrameMs = performance.now();
    this.frameHandle = requestAnimationFrame(this.renderFrame);
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const hit = this.pick(event);
    if (!hit) {
      return;
    }

    // Keys sit proud of the device, so they win a tie against "press anywhere".
    const keyId = this.keypad.keyAt(hit);
    if (keyId) {
      // Several keys can be down at once — holding them is a game input — but one
      // key only answers to the finger that got there first.
      for (const held of this.keyPointers.values()) {
        if (held === keyId) {
          return;
        }
      }

      event.preventDefault();
      this.keyPointers.set(event.pointerId, keyId);
      this.keypad.press(keyId);
      return;
    }

    if (this.leverPointerId !== null) {
      return;
    }

    if (!this.machine.ready || this.machine.currentState !== 'idle') {
      return;
    }

    if (!this.machine.ownsLever(hit) && !DICE_CONFIG.interaction.pressAnywhere) {
      return;
    }

    event.preventDefault();
    this.leverPointerId = event.pointerId;
    this.machine.press(this.dice.roll());
    this.zone.run(() => this.rolling.set(true));
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const keyId = this.keyPointers.get(event.pointerId);
    if (keyId !== undefined) {
      this.keyPointers.delete(event.pointerId);
      this.keypad.release(keyId);
      return;
    }

    if (this.leverPointerId !== event.pointerId) {
      return;
    }

    this.leverPointerId = null;
    this.machine.release();
  };

  /** Nearest model object under the pointer, or null. */
  private pick(event: PointerEvent): Object3D | null {
    const camera = this.activeCamera;
    const model = this.model;

    if (!camera || !model) {
      return null;
    }

    const canvas = this.canvasRef().nativeElement;
    const bounds = canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(this.pointer, camera);
    return this.raycaster.intersectObject(model, true)[0]?.object ?? null;
  }

  private loadModel(): void {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        const bounds = new Box3().setFromObject(model);
        model.position.sub(bounds.getCenter(new Vector3()));

        const centered = new Box3().setFromObject(model);
        const size = centered.getSize(new Vector3());
        this.localCorners = boxCorners(centered);
        this.worldCorners = this.localCorners.map((corner) => corner.clone());
        this.radius = centered.getBoundingSphere(new Sphere()).radius || 1;

        this.pivot.add(model);
        this.scene.add(this.pivot);
        this.model = model;

        const missing = this.machine.attach(model);
        const missingKeys = this.keypad.attach(model);
        const missingScreens = this.screens.attach(model);
        const missingLights = this.lighting.attach(model, this.pivot);
        const absent = [...missing, ...missingKeys, ...missingScreens, ...missingLights];

        this.zone.run(() => {
          this.dimensions.set(`${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
          this.rigWarning.set(absent.length > 0 ? `Missing nodes: ${absent.join(', ')}` : '');
          this.status.set('ready');
        });
      },
      undefined,
      () => this.fail(`Could not load ${MODEL_URL}`),
    );
  }

  private readonly renderFrame = (): void => {
    this.frameHandle = requestAnimationFrame(this.renderFrame);

    const renderer = this.renderer;
    if (!renderer) {
      return;
    }

    const now = performance.now();
    // Clamp so a backgrounded tab does not resume with one enormous step.
    const deltaMs = Math.min(now - this.lastFrameMs, 100);
    this.lastFrameMs = now;

    if (this.autoRotate()) {
      const next = this.azimuth() + 0.3;
      this.azimuth.set(next > 180 ? next - 360 : next);
    }

    this.syncSize();
    this.applyDeviceRotation();
    this.machine.update(deltaMs);
    this.keypad.update(deltaMs);
    this.activeCamera = this.updateCamera();
    this.updateScreens(deltaMs, this.activeCamera);
    renderer.render(this.scene, this.activeCamera);
  };

  /**
   * The DOM overlays only line up with the screen faces while the device sits at the
   * framing in `device-view.config.ts`. Anywhere else they are hidden and the last frame
   * they drew is shown as a texture on the device instead.
   */
  private updateScreens(deltaMs: number, camera: PerspectiveCamera | OrthographicCamera): void {
    if (!this.screens.ready) {
      return;
    }

    this.updateCurfew();

    const roll = this.lastRoll();
    const info = this.screens.info;
    info.lastKey = this.lastKey();
    info.roll = roll ? `${roll.total} (${roll.wheelOne}+${roll.wheelTwo})` : '';
    info.rolling = this.rolling();

    const canvas = this.canvasRef().nativeElement;
    const live = this.status() === 'ready' && this.atHomePose();
    this.router.update(deltaMs);
    this.screens.continuous = this.router.animated;
    this.screens.update(deltaMs, live, camera, canvas.clientWidth, canvas.clientHeight);
  }

  /**
   * Reads the clock once a frame. Inside a curfew window the e-ink strip shows the
   * warning and the glass screen is blocked: keys and the lever keep their animations,
   * they simply stop reaching the views.
   */
  private updateCurfew(): void {
    this.curfew.override = this.curfewOverride();

    const rule = this.curfew.active();
    const blocked = rule !== null;
    if (this.router.blocked !== blocked) {
      this.screens.invalidate();
    }
    this.router.setBlocked(blocked);

    const label = rule ? `${rule.id} · ${rule.from}–${rule.to}` : 'none';
    if (this.curfewRule() !== label) {
      this.zone.run(() => this.curfewRule.set(label));
    }
  }

  /** True while every orbit and device angle is still within tolerance of the defaults. */
  private atHomePose(): boolean {
    if (this.autoRotate()) {
      return false;
    }

    const { camera, device } = DEVICE_VIEW_CONFIG;
    const tolerance = SCREEN_CONFIG.homeToleranceDeg;
    // Shortest way round the circle, so -180 and 180 count as the same angle.
    const near = (value: number, target: number): boolean =>
      Math.abs(((((value - target + 180) % 360) + 360) % 360) - 180) <= tolerance;

    return (
      near(this.azimuth(), camera.azimuth) &&
      near(this.elevation(), camera.elevation) &&
      near(this.roll(), camera.roll) &&
      near(this.deviceX(), device.pitch) &&
      near(this.deviceY(), device.yaw) &&
      near(this.deviceZ(), device.roll)
    );
  }

  /** Spins the device itself and re-projects its corners so the fit stays tight. */
  private applyDeviceRotation(): void {
    const rotation = this.pivot.rotation;
    rotation.set(
      MathUtils.degToRad(this.deviceX()),
      MathUtils.degToRad(this.deviceY()),
      MathUtils.degToRad(this.deviceZ()),
    );

    for (let index = 0; index < this.localCorners.length; index++) {
      this.worldCorners[index].copy(this.localCorners[index]).applyEuler(rotation);
    }
  }

  /**
   * The stage can be hidden (landscape lock) or resized at any time, so the drawing
   * buffer is reconciled with the CSS box every frame rather than via an observer.
   */
  private syncSize(): void {
    const renderer = this.renderer;
    if (!renderer) {
      return;
    }

    const canvas = this.canvasRef().nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    if (
      canvas.width !== Math.floor(width * pixelRatio) ||
      canvas.height !== Math.floor(height * pixelRatio)
    ) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      this.zone.run(() => this.viewport.set(`${canvas.width}×${canvas.height} @${pixelRatio}x`));
    }
  }

  /** Orbits the camera around the device centre and pulls it in to the tightest framing. */
  private updateCamera(): PerspectiveCamera | OrthographicCamera {
    const canvas = this.canvasRef().nativeElement;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const aspect = width / height;

    const azimuth = MathUtils.degToRad(this.azimuth());
    const elevation = MathUtils.degToRad(
      MathUtils.clamp(this.elevation(), -ELEVATION_LIMIT, ELEVATION_LIMIT),
    );
    const cosElevation = Math.cos(elevation);

    this.direction
      .set(Math.sin(azimuth) * cosElevation, Math.sin(elevation), Math.cos(azimuth) * cosElevation)
      .normalize();

    this.axisZ.copy(this.direction);
    this.up.set(0, 1, 0).applyAxisAngle(this.axisZ, MathUtils.degToRad(this.roll()));
    this.axisX.crossVectors(this.up, this.axisZ).normalize();
    this.axisY.crossVectors(this.axisZ, this.axisX).normalize();

    return this.cameraMode() === 'orthographic'
      ? this.updateOrthographic(aspect)
      : this.updatePerspective(aspect);
  }

  private updatePerspective(aspect: number): PerspectiveCamera {
    const camera = this.perspectiveCamera;
    camera.fov = this.fov();
    camera.aspect = aspect;

    const tanVertical = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const tanHorizontal = tanVertical * aspect;

    // Smallest distance at which every bounding-box corner still sits inside the frustum.
    let distance = 0;
    for (const corner of this.worldCorners) {
      const x = Math.abs(corner.dot(this.axisX));
      const y = Math.abs(corner.dot(this.axisY));
      const z = corner.dot(this.axisZ);
      distance = Math.max(distance, z + x / tanHorizontal, z + y / tanVertical);
    }

    distance = Math.max(distance * this.margin(), this.radius * 0.01);
    camera.near = Math.max(0.001, distance - this.radius * 1.5);
    camera.far = distance + this.radius * 3;
    camera.position.copy(this.direction).multiplyScalar(distance);
    camera.up.copy(this.axisY);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return camera;
  }

  private updateOrthographic(aspect: number): OrthographicCamera {
    const camera = this.orthographicCamera;

    let halfWidth = 1e-4;
    let halfHeight = 1e-4;
    for (const corner of this.worldCorners) {
      halfWidth = Math.max(halfWidth, Math.abs(corner.dot(this.axisX)));
      halfHeight = Math.max(halfHeight, Math.abs(corner.dot(this.axisY)));
    }

    const top = Math.max(halfHeight, halfWidth / aspect) * this.margin();
    const right = top * aspect;
    const distance = this.radius * 4;

    camera.left = -right;
    camera.right = right;
    camera.top = top;
    camera.bottom = -top;
    camera.near = 0.01;
    camera.far = distance + this.radius * 4;
    camera.position.copy(this.direction).multiplyScalar(distance);
    camera.up.copy(this.axisY);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return camera;
  }

  private disposeObject(root: Object3D): void {
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) {
        return;
      }

      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.dispose();
      }
    });
  }

  private fail(message: string): void {
    this.zone.run(() => {
      this.errorMessage.set(message);
      this.status.set('error');
    });
  }
}
