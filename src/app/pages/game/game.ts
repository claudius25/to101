import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  WritableSignal,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
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
  SRGBColorSpace,
  Scene,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MODEL_URL = 'assets/aluminium-device-game.glb';
const ELEVATION_LIMIT = 89;

type CameraMode = 'perspective' | 'orthographic';
type Status = 'loading' | 'ready' | 'error';

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
  imports: [DecimalPipe],
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly cameraMode = signal<CameraMode>('orthographic');
  protected readonly azimuth = signal(0);
  protected readonly elevation = signal(80);
  protected readonly roll = signal(0);
  protected readonly fov = signal(35);
  protected readonly margin = signal(1);
  protected readonly deviceX = signal(0);
  protected readonly deviceY = signal(0);
  protected readonly deviceZ = signal(0);
  protected readonly autoRotate = signal(false);
  protected readonly panelOpen = signal(false);
  protected readonly status = signal<Status>('loading');
  protected readonly errorMessage = signal('');
  protected readonly dimensions = signal('');
  protected readonly viewport = signal('');

  private renderer: WebGLRenderer | null = null;
  private environment: Texture | null = null;
  private model: Object3D | null = null;
  private frameHandle = 0;

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

  protected onRange(target: WritableSignal<number>, event: Event): void {
    target.set(Number((event.target as HTMLInputElement).value));
  }

  protected onToggle(target: WritableSignal<boolean>, event: Event): void {
    target.set((event.target as HTMLInputElement).checked);
  }

  protected reset(): void {
    this.cameraMode.set('perspective');
    this.azimuth.set(0);
    this.elevation.set(20);
    this.roll.set(0);
    this.fov.set(35);
    this.margin.set(1);
    this.deviceX.set(0);
    this.deviceY.set(0);
    this.deviceZ.set(0);
    this.autoRotate.set(false);
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
    this.frameHandle = requestAnimationFrame(this.renderFrame);
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

        this.zone.run(() => {
          this.dimensions.set(`${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
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

    if (this.autoRotate()) {
      const next = this.azimuth() + 0.3;
      this.azimuth.set(next > 180 ? next - 360 : next);
    }

    this.syncSize();
    this.applyDeviceRotation();
    renderer.render(this.scene, this.updateCamera());
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
