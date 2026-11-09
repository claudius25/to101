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
} from '@angular/core';
import { SliderField } from '../../ui/slider-field/slider-field';
import { DiceRoll, DiceService } from '../../services/dice.service';
import { DiceMachine } from './dice-machine';
import { DICE_CONFIG } from './dice.config';
import {
  CameraMode,
  DEVICE_VIEW_CONFIG,
  DEVICE_VIEW_RANGES,
  DeviceViewConfig,
} from './device-view.config';
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  Object3D,
  OrthographicCamera,
  PMREMGenerator,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Sphere,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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

  protected readonly ranges = DEVICE_VIEW_RANGES;

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
  protected readonly rolling = signal(false);
  protected readonly rigWarning = signal('');

  private renderer: WebGLRenderer | null = null;
  private environment: Texture | null = null;
  private model: Object3D | null = null;
  private frameHandle = 0;
  private lastFrameMs = 0;
  private tapCount = 0;
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private activePointerId: number | null = null;

  private readonly machine = new DiceMachine();
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
    this.zone.runOutsideAngular(() => this.init());
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameHandle);

    const canvas = this.canvasRef().nativeElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.machine.onSettled = null;

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

    this.environment?.dispose();
    this.environment = null;
    this.scene.environment = null;
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
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setClearAlpha(0);

    // Brushed aluminium only reads correctly with an environment to reflect.
    const pmrem = new PMREMGenerator(renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environment;
    pmrem.dispose();

    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    const fill = new DirectionalLight(0xaab4ff, 0.8);
    fill.position.set(-3, 1, -2);
    this.scene.add(key, fill);

    this.loadModel();
    this.bindPointer(canvas);
    this.machine.onSettled = (roll) =>
      this.zone.run(() => {
        this.lastRoll.set(roll);
        this.rolling.set(false);
      });

    this.lastFrameMs = performance.now();
    this.frameHandle = requestAnimationFrame(this.renderFrame);
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null || !this.machine.ready) {
      return;
    }

    if (this.machine.currentState !== 'idle' || !this.hitsLever(event)) {
      return;
    }

    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.machine.press(this.dice.roll());
    this.zone.run(() => this.rolling.set(true));
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    this.activePointerId = null;
    this.machine.release();
  };

  private hitsLever(event: PointerEvent): boolean {
    const camera = this.activeCamera;
    const targets = DICE_CONFIG.interaction.pressAnywhere
      ? this.model
        ? [this.model]
        : []
      : this.machine.hitTargets;

    if (!camera || targets.length === 0) {
      return false;
    }

    const canvas = this.canvasRef().nativeElement;
    const bounds = canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(this.pointer, camera);
    return this.raycaster.intersectObjects(targets, true).length > 0;
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

        this.zone.run(() => {
          this.dimensions.set(`${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
          this.rigWarning.set(missing.length > 0 ? `Missing nodes: ${missing.join(', ')}` : '');
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
    this.activeCamera = this.updateCamera();
    renderer.render(this.scene, this.activeCamera);
  };

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
