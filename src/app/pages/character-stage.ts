import { AfterViewInit, Component, ElementRef, inject, NgZone, OnDestroy, signal, viewChild } from '@angular/core';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

@Component({
  selector: 'app-character-stage',
  template: `
    <main>
      <header>
        <h1>Character stage</h1>
        <p>Drag to orbit · Scroll or pinch to zoom</p>
      </header>
      <div class="viewport" #viewport>
        @if (status(); as message) {
          <p class="status" role="status">{{ message }}</p>
        }
      </div>
    </main>
  `,
  styles: `
    :host { display: block; color: #e8edf4; background: #171e28; min-height: 100dvh; }
    main { padding: clamp(1rem, 4vw, 3rem); max-width: 72rem; margin: auto; }
    h1 { margin: 0; font-size: 1.5rem; }
    header p { margin: .5rem 0 1rem; color: #b7c4d4; }
    .viewport { position: relative; height: clamp(22rem, 75dvh, 60rem); overflow: hidden;
      border: 1px solid #536175; border-radius: .75rem; background: #293647; }
    .status { position: absolute; z-index: 1; inset: 1rem auto auto 1rem;
      margin: 0; padding: .65rem .85rem; background: #171e28; border-radius: .4rem; }
  `,
})
export class CharacterStage implements AfterViewInit, OnDestroy {
  protected readonly status = signal('Loading character…');
  private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
  private readonly zone = inject(NgZone);
  private cleanup?: () => void;
  private destroyed = false;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => void this.mount());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup?.();
  }

  private async mount(): Promise<void> {
    const host = this.viewport().nativeElement;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      this.status.set('WebGL is unavailable in this browser.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D character preview');
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x293647);
    scene.fog = new THREE.Fog(0x293647, 7, 16);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 40);
    camera.position.set(0.6, 1.35, 4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.maxDistance = 8;
    controls.minDistance = 0.55;
    controls.update();

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.47, 0.16, 64),
      new THREE.MeshStandardMaterial({ color: 0x647783, roughness: 0.85 }),
    );
    platform.position.y = -0.08;
    const grid = new THREE.GridHelper(24, 48, 0x64778b, 0x425369);
    grid.position.y = -0.161;
    const key = new THREE.DirectionalLight(0xffecd8, 2.1);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight(0xb3d3ff, 1.1);
    rim.position.set(-3, 3, -4);
    scene.add(platform, grid, key, rim, new THREE.HemisphereLight(0xf1f6ff, 0x566070, 1.65));

    const resize = new ResizeObserver(() => {
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resize.observe(host);

    let avatar: VRM | undefined;
    let lastFrame: number | undefined;
    this.cleanup = () => {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      VRMUtils.deepDispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };

    renderer.setAnimationLoop((time) => {
      const delta = lastFrame === undefined ? 0 : Math.min((time - lastFrame) / 1000, 0.05);
      lastFrame = time;
      avatar?.update(delta);
      controls.update();
      renderer.render(scene, camera);
    });

    try {
      const loader = new GLTFLoader().register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync('assets/character-stage/armyman.vrm');
      const loaded = gltf.userData['vrm'] as VRM | undefined;
      if (this.destroyed || !loaded) {
        VRMUtils.deepDispose(gltf.scene);
        if (!this.destroyed) this.status.set('The file did not contain a VRM avatar.');
        return;
      }

      VRMUtils.rotateVRM0(loaded);
      const bounds = new THREE.Box3().setFromObject(loaded.scene, true);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      loaded.scene.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      scene.add(loaded.scene);
      avatar = loaded;

      const verticalAngle = THREE.MathUtils.degToRad(camera.fov / 2);
      const horizontalTangent = Math.tan(verticalAngle) * camera.aspect;
      const distance = Math.max(size.y / (2 * Math.tan(verticalAngle)), size.x / (2 * horizontalTangent));
      controls.target.set(0, size.y / 2, 0);
      camera.position.copy(controls.target).add(new THREE.Vector3(0.12, 0.06, 1).multiplyScalar(distance * 1.22 + size.z / 2));
      controls.maxDistance = Math.max(8, camera.position.distanceTo(controls.target));
      controls.update();
      this.status.set('');
    } catch (error) {
      if (!this.destroyed) {
        console.error('VRM load failed', error);
        this.status.set('Could not load the character.');
      }
    }
  }
}
