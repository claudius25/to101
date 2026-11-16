import { createMouthClean, MouthCleanQuality, MouthCleanRuntime } from './mouth-clean-runtime';
import { ScreenView, ViewFrame, ViewPointer } from './view';
import { font } from './ui';

/** Renders the supplied Three.js world into the device's glass surface. */
export class ChapterMouthClean implements ScreenView {
  readonly id = 'chapter-mouth-clean' as const;
  readonly animated = true;
  readonly briefing = {
    text: '**Mouth clean**\nMove with the arrows. Enter pokes. Tap a germ to walk up and scrub it.',
    fontSize: 15,
  };

  /** Uniform model scale. The original hero scale was 0.31. */
  readonly heroScale = 0.52;
  readonly quality: MouthCleanQuality = 'auto';

  private runtime: MouthCleanRuntime | null = null;
  private error = '';

  enter(): void {
    if (this.runtime || this.error) return;
    try {
      this.runtime = createMouthClean({ heroScale: this.heroScale, quality: this.quality });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not start the 3D scene.';
    }
  }

  update(deltaMs: number): void {
    this.runtime?.update(deltaMs);
  }

  paint(frame: ViewFrame): void {
    const { ctx, width, height, unit } = frame;
    ctx.fillStyle = '#0d0105';
    ctx.fillRect(0, 0, width, height);
    if (this.runtime) {
      this.runtime.render(width, height);
      ctx.drawImage(this.runtime.canvas, 0, 0, width, height);
    }
    const status = this.runtime?.status();
    ctx.fillStyle = '#fff3dc';
    ctx.font = font(frame, 4.5, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `Mouth clean · ${status?.cleaned ?? 0} / ${status?.total ?? 0}`,
      unit * 3,
      unit * 3,
    );
    if (this.error || status?.loading) {
      ctx.fillText(this.error || status?.message || '', unit * 3, unit * 38, width - unit * 6);
    }
    if (status?.flash) ctx.fillText(status.flash, unit * 3, unit * 69, width - unit * 6);
  }

  pointer(event: ViewPointer): boolean {
    if (event.phase === 'down') this.runtime?.move(event.x, event.y);
    return true;
  }

  key(key: string): boolean {
    if (!['left', 'right', 'up', 'down', 'enter'].includes(key)) return false;
    this.runtime?.key(key, true);
    return true;
  }

  keyUp(key: string): void {
    this.runtime?.key(key, false);
  }

  suspend(): void {
    this.runtime?.suspend();
  }

  exit(): void {
    this.dispose();
  }

  dispose(): void {
    this.suspend();
    this.runtime?.dispose();
    this.runtime = null;
  }
}
