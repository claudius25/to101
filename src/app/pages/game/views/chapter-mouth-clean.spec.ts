import { createMouthClean, MouthCleanRuntime } from './mouth-clean-runtime';

// Exercise the supplied GLBs through the same runtime used by the chapter.
describe('Mouth clean runtime', () => {
  let runtime: MouthCleanRuntime;

  afterEach(() => runtime?.dispose());

  it('loads both models and renders movement and combat', async () => {
    runtime = createMouthClean();
    const deadline = performance.now() + 15000;
    while (runtime.status().loading && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(runtime.status().loading).withContext(runtime.status().message).toBeFalse();
    expect(runtime.status().total).toBeGreaterThan(0);
    runtime.render(640, 360);
    runtime.key('right', true);
    for (let frame = 0; frame < 10; frame++) runtime.update(16);
    runtime.key('right', false);
    runtime.key('enter', true);
    for (let frame = 0; frame < 40; frame++) runtime.update(16);
    runtime.suspend();
    runtime.render(640, 360);
    expect(runtime.canvas.width).toBe(640);
    expect(runtime.canvas.height).toBe(360);
    const output = document.createElement('canvas');
    output.width = 640;
    output.height = 360;
    const context = output.getContext('2d')!;
    context.drawImage(runtime.canvas, 0, 0);
    const pixels = context.getImageData(0, 0, 640, 360).data;
    let brightPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 50) brightPixels++;
    }
    expect(brightPixels).toBeGreaterThan(100);
  }, 20000);
});
