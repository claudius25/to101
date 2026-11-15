import { ChapterTidyBed } from './chapter-tidy-bed';
import { ViewFrame } from './view';

describe('Tidy bed divider controls', () => {
  let view: ChapterTidyBed;
  let frame: ViewFrame;
  beforeEach(() => {
    view = new ChapterTidyBed();
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    frame = { ctx: canvas.getContext('2d')!, width: 600, height: 400, unit: 4 } as ViewFrame;
    view.paint(frame);
  });

  it('should start at 25%, label both sides and hold a point as the divider moves', () => {
    const labels = spyOn(frame.ctx, 'fillText').and.callThrough();
    view.paint(frame);
    expect(labels).toHaveBeenCalledWith('After', 8, 87.2);
    expect(labels).toHaveBeenCalledWith('Before', 8, 112.8);
    view.pointer({ id: 1, phase: 'down', x: 100, y: 100 });
    view.update(60);
    view.paint(frame);
    const pixel = frame.ctx.getImageData(100, 101, 1, 1).data;
    expect(Array.from(pixel).slice(0, 3)).toEqual([53, 215, 125]);
    view.pointer({ id: 1, phase: 'up', x: 100, y: 101 });
    view.update(60);
    view.paint(frame);
    expect(Array.from(frame.ctx.getImageData(100, 100, 1, 1).data)).toEqual([255, 255, 255, 255]);
  });

  it('should let bottom keys hold points and release them on suspension', () => {
    const instruction = (view as unknown as { instruction: { visible: boolean } }).instruction;
    expect(instruction.visible).toBeTrue();
    expect(view.key('left')).toBeTrue();
    expect(instruction.visible).toBeFalse();
    expect(view.key('down')).toBeTrue();
    expect(view.key('right')).toBeTrue();
    view.update(60);
    view.paint(frame);
    expect(Array.from(frame.ctx.getImageData(300, 102, 1, 1).data).slice(0, 3)).toEqual([53, 215, 125]);
    view.keyUp('down');
    view.paint(frame);
    expect(Array.from(frame.ctx.getImageData(300, 102, 1, 1).data)).toEqual([255, 255, 255, 255]);
    view.suspend();
    view.update(60);
    view.paint(frame);
    expect(Array.from(frame.ctx.getImageData(100, 100, 1, 1).data)).toEqual([255, 255, 255, 255]);
  });

  it('should blink a point red on spider contact and retain the held-hit screen flash', () => {
    const state = view as unknown as {
      started: boolean;
      spawnIn: number;
      spiders: { lane: number; age: number; fall: number; crossed: boolean }[];
      pointHitMs: number[];
      hitMs: number;
    };
    state.started = true;
    state.spawnIn = 10;
    state.spiders.push({ lane: 0, age: 0.28, fall: 1, crossed: false });
    state.spiders.push({ lane: 1, age: 0.28, fall: 1, crossed: false });
    view.pointer({ id: 1, phase: 'down', x: 100, y: 100 });
    view.update(60);
    expect(state.pointHitMs[0]).toBeGreaterThan(0);
    expect(state.pointHitMs[1]).toBe(0);
    expect(state.hitMs).toBeGreaterThan(0);
    const arcs = spyOn(frame.ctx, 'arc').and.callThrough();
    view.paint(frame);
    expect(arcs).toHaveBeenCalled();
    const colors: string[] = [];
    const fill = frame.ctx.fill.bind(frame.ctx);
    spyOn(frame.ctx, 'fill').and.callFake(() => { colors.push(String(frame.ctx.fillStyle)); fill(); });
    view.paint(frame);
    expect(colors).toContain('#ef2745');
    // Releasing a hit point immediately restores white, even during its blink timer.
    view.pointer({ id: 1, phase: 'up', x: 100, y: 100 });
    colors.length = 0;
    view.paint(frame);
    expect(colors).not.toContain('#ef2745');
    expect(Array.from(frame.ctx.getImageData(100, 101, 1, 1).data))
      .toEqual([255, 255, 255, 255]);
    view.update(100);
    colors.length = 0;
    view.paint(frame);
    expect(colors).not.toContain('#ef2745');
  });
});
