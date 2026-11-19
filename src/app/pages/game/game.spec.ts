import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BoxGeometry, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';

import { Game } from './game';
import { Curfew } from './e-ink/curfew';
import { ScreenRouter } from './views/router';
import { WritableSignal } from '@angular/core';

describe('Game', () => {
  let component: Game;
  let fixture: ComponentFixture<Game>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Game],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Game);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('bypasses sleep windows only when skipSleep=true is in the URL', () => {
    const game = component as unknown as {
      curfew: Curfew;
      curfewOverride: WritableSignal<string>;
      router: ScreenRouter;
      updateCurfew(): void;
    };
    const params = spyOnProperty(TestBed.inject(ActivatedRoute).snapshot, 'queryParamMap', 'get');
    game.curfewOverride.set('bedtime');
    params.and.returnValue(convertToParamMap({ skipSleep: 'true' }));
    game.updateCurfew();
    expect(game.router.blocked).toBeFalse();
    expect(game.curfew.active(new Date(2026, 10, 19, 22))).toBeNull();
    expect(game.curfew.active(new Date(2026, 10, 20, 2))).toBeNull();
    for (const value of [undefined, 'false']) {
      params.and.returnValue(convertToParamMap(value ? { skipSleep: value } : {}));
      game.updateCurfew();
      expect(game.router.blocked).toBeTrue();
    }
  });

  it('should keep camera centering steady while the intro silhouette rotates', () => {
    const game = component as unknown as {
      model: Object3D;
      landingProjectionPoints: Vector3[];
      centerProjection(camera: PerspectiveCamera, width: number, height: number): void;
    };
    const previous = game.model;
    const device = new Mesh(new BoxGeometry(1, 3, 1));
    game.model = device;
    game.landingProjectionPoints.push(new Vector3(-0.5, -1.5, 0), new Vector3(0.5, 1.5, 1));
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    game.centerProjection(camera, 800, 800);
    const offset = camera.view!.offsetY;
    for (const rotation of [0, 1, 2, 3, 4, 5, 6]) {
      device.rotation.set(rotation, 0, rotation);
      device.position.y = Math.sin(rotation);
      game.centerProjection(camera, 800, 800);
      expect(camera.view!.offsetY).toBeCloseTo(offset, 8);
    }
    game.model = previous;
    game.landingProjectionPoints.length = 0;
    device.geometry.dispose();
  });

  it('should vertically center the projected device with a tilted perspective camera', () => {
    const device = new Mesh(new BoxGeometry(1, 3, 1));
    device.position.y = 1;
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const game = component as unknown as {
      model: Object3D;
      centerProjection(camera: PerspectiveCamera, width: number, height: number): void;
    };
    const previous = game.model;
    game.model = device;
    game.centerProjection(camera, 800, 800);
    const ys: number[] = [];
    for (const x of [-0.5, 0.5]) {
      for (const y of [-1.5, 1.5]) {
        for (const z of [-0.5, 0.5]) {
          ys.push(new Vector3(x, y, z).applyMatrix4(device.matrixWorld).project(camera).y);
        }
      }
    }
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0, 6);
    game.model = previous;
    device.geometry.dispose();
  });

  it('should render a canvas and the dev panel controls', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('canvas.game__canvas')).toBeTruthy();
    expect(host.querySelectorAll('.dev input[type="range"]').length).toBeGreaterThanOrEqual(4);
  });
});
