import { createMouthClean, MouthCleanQuality, MouthCleanRuntime } from './mouth-clean-runtime';
import { ScreenView, ViewFrame, ViewPointer } from './view';
import { font } from './ui';
import { QuickInstruction } from './components/quick-instruction';

const INTRO_QUOTES = [
  'You only have to brush the teeth you want to keep.',
  "Plaque is back. And this time, it's personal.",
  'Your mouth is a battlefield. Your toothbrush is the weapon.',
  "Be true to your teeth, or they'll be false to you.",
  'Sugar is sweet. Cavities are not.',
  'A toothbrush a day keeps the dentist away. Almost.',
  'Floss like a boss!',
  'The plaque stops here!',
  'Not all heroes wear capes. Some wear toothpaste.',
  'Welcome to the mouth. Population: 700 species of bacteria. Good luck.',
] as const;

/** Renders the supplied Three.js world into the device's glass surface. */
export class ChapterMouthClean implements ScreenView {
  readonly id = 'chapter-mouth-clean' as const;
  readonly animated = true;
  readonly briefing = {
    text: '**Mouth clean**',
    fontSize: 15,
    character: 'assets/e-ink/doc.png',
  };

  /** Uniform model scale. The original hero scale was 0.31. */
  readonly heroScale = 0.52;
  readonly quality: MouthCleanQuality = 'auto';

  private runtime: MouthCleanRuntime | null = null;
  private error = '';
  private readonly instruction = new QuickInstruction(
    'Move with the arrows. Enter pokes, then ends your turn. Drag to pan. Pinch to zoom.',
  );
  private readonly touches = new Map<number, { x: number; y: number }>();

  enter(): void {
    this.instruction.reset();
    const quote = INTRO_QUOTES[Math.floor(Math.random() * INTRO_QUOTES.length)];
    this.briefing.text = `**${quote}**`;
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
    if (status?.enemyReady) {
      ctx.font = font(frame, 3.5, 600);
      ctx.fillText(
        `HP ${status.heroHp}  |  Soda ${status.enemyHp}  |  ${status.turn === 'hero' ? 'Your turn' : 'Soda turn'} ${status.turnSeconds}s`,
        unit * 3,
        unit * 9,
      );
      ctx.fillText(
        status.turn === 'hero'
          ? status.attackUsed
            ? 'Enter ends turn'
            : 'Enter pokes'
          : `Soda ${status.enemyPhase ?? 'thinking'}`,
        unit * 3,
        unit * 14,
      );
    }
    if (this.error || status?.error || status?.loading) {
      ctx.fillText(
        this.error || status?.error || status?.message || '',
        unit * 3,
        unit * 38,
        width - unit * 6,
      );
    }
    if (status?.flash) ctx.fillText(status.flash, unit * 3, unit * 69, width - unit * 6);
    this.instruction.paint(frame);
  }

  pointer(event: ViewPointer): boolean {
    if (this.instruction.pointer(event)) return true;
    if (event.phase === 'up' || event.phase === 'cancel') {
      this.touches.delete(event.id);
      return true;
    }
    if (event.phase === 'down') {
      this.instruction.dismiss();
      this.touches.set(event.id, { x: event.x, y: event.y });
      return true;
    }
    if (!this.touches.has(event.id)) return true;
    const before = this.gesture();
    this.touches.set(event.id, { x: event.x, y: event.y });
    const after = this.gesture();
    this.runtime?.pan(after.x - before.x, after.y - before.y);
    if (before.distance > 0 && after.distance > 0) {
      this.runtime?.zoom(before.distance / after.distance);
    }
    return true;
  }

  private gesture(): { x: number; y: number; distance: number } {
    const [first, second] = [...this.touches.values()];
    if (!second) return { ...first, distance: 0 };
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      distance: Math.hypot(second.x - first.x, second.y - first.y),
    };
  }

  key(key: string): boolean {
    if (!['left', 'right', 'up', 'down', 'enter'].includes(key)) return false;
    this.instruction.dismiss();
    this.runtime?.key(key, true);
    return true;
  }

  keyUp(key: string): void {
    this.runtime?.key(key, false);
  }

  suspend(): void {
    this.touches.clear();
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
