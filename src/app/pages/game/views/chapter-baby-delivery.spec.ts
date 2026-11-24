import { ChapterBabyDelivery } from './chapter-baby-delivery';
import { BabyDeliveryRuntime, createBabyDelivery } from './baby-delivery-runtime';
import { HitRegistry, ViewFrame } from './view';

async function loaded(runtime: BabyDeliveryRuntime): Promise<void> {
  const deadline = performance.now() + 20000;
  while (runtime.status().loading && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function portraitFrame(): ViewFrame {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 640;
  return {
    ctx: canvas.getContext('2d')!, width: 360, height: 640, unit: 6.4,
    hit: new HitRegistry(), pressed: null,
  } as ViewFrame;
}

// Exercise the stork, baby and prop kit GLBs through the same runtime the chapter uses.
describe('Baby delivery runtime', () => {
  let runtime: BabyDeliveryRuntime;

  afterEach(() => runtime?.dispose());

  it('loads its models and flies a steerable, pausable level run', async () => {
    runtime = createBabyDelivery({ quality: 'medium', sound: false, retro: { on: false } });
    await loaded(runtime);
    const ready = runtime.status();
    expect(ready.loading).withContext(ready.error).toBeFalse();
    expect(ready.error).toBe('');
    expect(ready.phase).toBe('menu');

    runtime.start('level');
    expect(runtime.status().phase).toBe('play');
    expect(runtime.status().goal).toBe(1000);
    runtime.key('right', true);
    for (let frame = 0; frame < 30; frame++) runtime.update(33);
    runtime.key('right', false);
    expect(runtime.status().distance).toBeGreaterThan(5);

    runtime.setPaused(true);
    const distance = runtime.status().distance;
    for (let frame = 0; frame < 10; frame++) runtime.update(33);
    expect(runtime.status().distance).toBe(distance);
    runtime.setPaused(false);

    runtime.render(360, 640);
    expect(runtime.canvas.width).toBe(360);
    expect(runtime.canvas.height).toBe(640);
    const output = document.createElement('canvas');
    output.width = 360;
    output.height = 640;
    const context = output.getContext('2d')!;
    context.drawImage(runtime.canvas, 0, 0);
    const pixels = context.getImageData(0, 0, 360, 640).data;
    let brightPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 60) brightPixels++;
    }
    expect(brightPixels).toBeGreaterThan(1000);

    runtime.start('endless');
    expect(runtime.status().mode).toBe('endless');
    expect(runtime.status().distance).toBe(0);
  });

  it('renders at a fraction of the screen resolution in retro mode', async () => {
    runtime = createBabyDelivery({ quality: 'medium', sound: false });
    await loaded(runtime);
    expect(runtime.status().retro).toEqual({ on: true, pixelSize: 3, palette: 'village', dither: true });
    runtime.render(360, 640);
    expect(runtime.canvas.width).toBe(120);
    expect(runtime.canvas.height).toBe(214);
    runtime.setRetro({ pixelSize: 4, palette: 'handheld' });
    runtime.render(360, 640);
    expect(runtime.canvas.width).toBe(90);
    expect(runtime.canvas.height).toBe(160);
    expect(() => runtime.setRetro({ pixelSize: 0 })).toThrowError(RangeError);
    runtime.setRetro({ on: false });
    runtime.render(360, 640);
    expect(runtime.canvas.width).toBe(360);
  });

  it('switches to the overhead view, where only left and right steer', async () => {
    runtime = createBabyDelivery({ quality: 'medium', sound: false, retro: { on: false } });
    await loaded(runtime);
    expect(runtime.status().view).toBe('chase');
    runtime.setView('top');
    expect(runtime.status().view).toBe('top');
    runtime.start('level');
    runtime.update(16);
    runtime.key('up', true);
    for (let i = 0; i < 30; i++) runtime.update(50);
    runtime.key('up', false);
    expect(runtime.status().phase).toBe('play');
    expect(() => runtime.setView('side' as never)).toThrowError(RangeError);
  });
});

describe('Baby delivery chapter', () => {
  it('advances through seven panels with Enter before handling the flight controls', async () => {
    const chapter = new ChapterBabyDelivery();
    chapter.enter();
    const { runtime, storyboard } = chapter as unknown as {
      runtime: BabyDeliveryRuntime;
      storyboard: { panels: HTMLImageElement[] };
    };
    expect(storyboard.panels.length).toBe(7);
    await Promise.all(storyboard.panels.map((panel) => panel.decode()));
    await loaded(runtime);
    chapter.update(16);

    const frame = portraitFrame();
    const drawImage = spyOn(frame.ctx, 'drawImage').and.callThrough();
    expect(chapter.key('right')).toBeFalse();
    for (const panel of storyboard.panels) {
      frame.hit.reset();
      chapter.paint(frame);
      expect(drawImage.calls.mostRecent().args).toEqual([panel, -140, 0, 640, 640]);
      const nextTarget = frame.hit.find(320, 608);
      expect(nextTarget).toBe('storyboard:next');
      if (panel === storyboard.panels[0]) chapter.press(nextTarget!);
      else expect(chapter.key('enter')).toBeTrue();
      expect(runtime.status().phase).toBe('menu');
    }
    frame.hit.reset();
    chapter.paint(frame);
    let startTarget: string | null = null;
    for (let y = 0; y < 640 && !startTarget; y += 4) {
      const target = frame.hit.find(180, y);
      if (target?.startsWith('delivery:start-level')) startTarget = target;
    }
    expect(startTarget).toBe('delivery:start-level');

    expect(chapter.key('enter')).toBeTrue();
    expect(runtime.status().phase).toBe('play');
    expect(runtime.status().mode).toBe('level');
    expect(chapter.key('left')).toBeTrue();
    chapter.keyUp('left');
    expect(chapter.key('close')).withContext('close falls through to the router').toBeFalse();
    expect(chapter.completed).toBeFalse();

    expect(chapter.key('enter')).toBeTrue();
    expect(runtime.status().paused).toBeTrue();
    chapter.dispose();
  });
});
