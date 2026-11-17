import { ChapterMouthClean } from './chapter-mouth-clean';
import { createMouthClean, MouthCleanRuntime } from './mouth-clean-runtime';

// Exercise the supplied GLBs through the same runtime used by the chapter.
describe('Mouth clean runtime', () => {
  let runtime: MouthCleanRuntime;

  afterEach(() => runtime?.dispose());

  it('loads all three models and renders movement and turn-based combat', async () => {
    const errors = spyOn(console, 'error').and.callThrough();
    runtime = createMouthClean({ heroScale: 0.52, quality: 'medium' });
    const deadline = performance.now() + 15000;
    while (runtime.status().loading && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(runtime.status().loading).withContext(runtime.status().message).toBeFalse();
    expect(runtime.status().total).toBeGreaterThan(0);
    expect(runtime.status().enemyReady).toBeTrue();
    expect(runtime.status().enemyAlive).toBeTrue();
    expect(runtime.status().enemyHp).toBe(100);
    expect(runtime.status().heroHp).toBe(100);
    runtime.render(640, 360);
    runtime.key('right', true);
    for (let frame = 0; frame < 10; frame++) runtime.update(16);
    runtime.key('right', false);
    runtime.key('enter', true);
    for (let frame = 0; frame < 80; frame++) runtime.update(16);
    expect(runtime.status().attackUsed).toBeTrue();
    runtime.key('enter', true);
    expect(runtime.status().turn).toBe('enemy');
    for (let frame = 0; frame < 1800 && runtime.status().turn === 'enemy'; frame++) runtime.update(50);
    expect(runtime.status().turn).toBe('hero');
    runtime.suspend();
    runtime.render(640, 360);
    expect(runtime.canvas.width).toBe(640);
    expect(runtime.canvas.height).toBe(360);
    runtime.setQuality('high');
    runtime.render(640, 360);
    expect(runtime.status().qualityLevel).toBe('high');
    expect(runtime.canvas.width).toBe(Math.floor(640 * Math.min(devicePixelRatio, 1.5)));
    runtime.setQuality('ultra');
    runtime.render(640, 360);
    expect(runtime.status().qualityLevel).toBe('ultra');
    expect(runtime.canvas.width).toBe(Math.floor(640 * Math.min(devicePixelRatio, 2)));
    runtime.setQuality('low');
    runtime.update(16);
    runtime.render(640, 360);
    expect(runtime.status().qualityLevel).toBe('low');
    expect(runtime.canvas.width).toBe(480);
    expect(runtime.canvas.height).toBe(270);
    const output = document.createElement('canvas');
    output.width = 640;
    output.height = 360;
    const context = output.getContext('2d')!;
    context.drawImage(runtime.canvas, 0, 0, 640, 360);
    const pixels = context.getImageData(0, 0, 640, 360).data;
    let brightPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 50) brightPixels++;
    }
    expect(brightPixels).toBeGreaterThan(100);
    const hpBeforePunch = runtime.status().heroHp;
    runtime.key('test-punch', true);
    expect(runtime.status().turn).toBe('enemy');
    for (let frame = 0; frame < 1800 && runtime.status().turn === 'enemy'; frame++) {
      runtime.update(50);
    }
    expect(runtime.status().turn).toBe('hero');
    expect(runtime.status().heroHp).toBeLessThan(hpBeforePunch);
    expect(runtime.status().attackUsed).toBeFalse();
    const hpBeforeSquirt = runtime.status().heroHp;
    runtime.key('test-squirt', true);
    expect(runtime.status().turn).toBe('enemy');
    for (let frame = 0; frame < 1800 && runtime.status().turn === 'enemy'; frame++) {
      runtime.update(50);
      if (frame % 10 === 0) runtime.render(320, 180);
    }
    expect(runtime.status().turn).toBe('hero');
    expect(runtime.status().heroHp).toBeLessThan(hpBeforeSquirt);
    runtime.render(640, 360);
    runtime.setQuality('auto');
    expect(runtime.status().qualityMode).toBe('auto');
    expect(errors).not.toHaveBeenCalled();
  }, 60000);
});


describe('Mouth clean screen gestures', () => {
  let chapter: ChapterMouthClean;
  let controls: jasmine.SpyObj<MouthCleanRuntime>;

  beforeEach(() => {
    chapter = new ChapterMouthClean();
    controls = jasmine.createSpyObj<MouthCleanRuntime>('runtime', ['pan', 'zoom', 'key', 'suspend']);
    Object.assign(chapter, { runtime: controls });
  });

  it('pans on drag and leaves taps without a movement command', () => {
    chapter.pointer({ id: 1, phase: 'down', x: 100, y: 100 });
    expect(controls.pan).not.toHaveBeenCalled();
    expect(controls.key).not.toHaveBeenCalled();
    chapter.pointer({ id: 1, phase: 'move', x: 130, y: 120 });
    expect(controls.pan).toHaveBeenCalledWith(30, 20);
    expect(controls.zoom).not.toHaveBeenCalled();
    chapter.key('right');
    chapter.keyUp('right');
    expect(controls.key.calls.allArgs()).toEqual([['right', true], ['right', false]]);
  });

  it('zooms with a pinch and resumes a single finger drag without a jump', () => {
    chapter.pointer({ id: 1, phase: 'down', x: 100, y: 100 });
    chapter.pointer({ id: 2, phase: 'down', x: 200, y: 100 });
    chapter.pointer({ id: 2, phase: 'move', x: 300, y: 100 });
    expect(controls.zoom).toHaveBeenCalledWith(0.5);
    expect(controls.pan).toHaveBeenCalledWith(50, 0);
    chapter.pointer({ id: 2, phase: 'up', x: 300, y: 100 });
    controls.zoom.calls.reset();
    chapter.pointer({ id: 1, phase: 'move', x: 110, y: 100 });
    expect(controls.pan).toHaveBeenCalledWith(10, 0);
    expect(controls.zoom).not.toHaveBeenCalled();
  });

  it('clears gesture tracking when cancelled or suspended', () => {
    chapter.pointer({ id: 1, phase: 'down', x: 100, y: 100 });
    chapter.pointer({ id: 1, phase: 'cancel', x: 100, y: 100 });
    chapter.pointer({ id: 1, phase: 'move', x: 200, y: 100 });
    chapter.pointer({ id: 2, phase: 'down', x: 200, y: 100 });
    chapter.suspend();
    chapter.pointer({ id: 2, phase: 'move', x: 300, y: 100 });
    expect(controls.pan).not.toHaveBeenCalled();
    expect(controls.zoom).not.toHaveBeenCalled();
    expect(controls.suspend).toHaveBeenCalled();
  });
});
