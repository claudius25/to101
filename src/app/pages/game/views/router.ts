import { ScreenPaintContext } from '../screens';
import { ChapterOne } from './chapter-one';
import { ChapterTwo } from './chapter-two';
import { SettingsView } from './settings';
import { HitRegistry, ScreenView, ViewFrame, ViewId, ViewNav } from './view';

/** Register every view here. Instances are created once and reused, so they keep state. */
const FACTORIES: Record<ViewId, () => ScreenView> = {
  'chapter-1': () => new ChapterOne(),
  'chapter-2': () => new ChapterTwo(),
  settings: () => new SettingsView(),
};

/** Keypad key that opens and closes the settings sheet. */
const SETTINGS_KEY = 'settings';
/** Keypad key that backs out of whatever is on top. */
const BACK_KEY = 'close';

/**
 * Owns the stack of canvas views drawn on the glass screen, and turns raw taps and
 * device keys into view navigation.
 *
 * It is wired to the glass surface in `game.ts`:
 *   screens.setPainter('glass', (frame) => router.paint(frame));
 *   screens.onPointer = (id, phase, x, y) => router.pointer(phase, x, y);
 *   keypad.onPress = (key) => router.key(key);
 */
export class ScreenRouter implements ViewNav {
  /** Fires with the new stack path, e.g. "chapter-1 › settings". */
  onChange: ((path: string) => void) | null = null;
  /** Asks the surface to repaint now instead of on its next tick. */
  onInvalidate: (() => void) | null = null;

  private readonly views = new Map<ViewId, ScreenView>();
  private readonly stack: ScreenView[] = [];
  private readonly hits = new HitRegistry();
  private pressed: string | null = null;

  constructor(initial: ViewId = 'chapter-1') {
    this.open(initial);
  }

  get current(): ViewId {
    return this.top.id;
  }

  get depth(): number {
    return this.stack.length;
  }

  /** Human-readable stack, for the dev panel. */
  get path(): string {
    return this.stack.map((view) => view.id).join(' › ');
  }

  private get top(): ScreenView {
    return this.stack[this.stack.length - 1];
  }

  go(id: ViewId): void {
    while (this.stack.length > 0) {
      this.stack.pop()?.exit?.();
    }
    this.open(id);
  }

  push(id: ViewId): void {
    if (this.stack.some((view) => view.id === id)) {
      return;
    }
    this.open(id);
  }

  back(): void {
    if (this.stack.length <= 1) {
      return;
    }
    this.stack.pop()?.exit?.();
    this.changed();
  }

  /** Paints the whole stack bottom-up; only the top view's hotspots survive. */
  paint(frame: ScreenPaintContext): void {
    const view: ViewFrame = {
      ctx: frame.ctx,
      width: frame.width,
      height: frame.height,
      unit: frame.height / 100,
      elapsedMs: frame.elapsedMs,
      frozen: frame.frozen,
      info: frame.info,
      pressed: this.pressed,
      hit: this.hits,
    };

    frame.ctx.setTransform(1, 0, 0, 1, 0, 0);
    frame.ctx.clearRect(0, 0, frame.width, frame.height);

    for (const entry of this.stack) {
      this.hits.reset();
      entry.paint(view);
    }
  }

  /** Pointer phases from the overlay canvas, in canvas pixels. */
  pointer(phase: 'down' | 'up' | 'cancel', x: number, y: number): void {
    if (phase === 'down') {
      this.pressed = this.hits.find(x, y);
      if (this.pressed) {
        this.invalidate();
      }
      return;
    }

    const target = this.pressed;
    this.pressed = null;
    if (!target) {
      return;
    }

    // Same rule as a real button: it only fires if the finger lifts inside it.
    if (phase === 'up' && this.hits.find(x, y) === target) {
      this.top.press?.(target, this);
    }
    this.invalidate();
  }

  /** A device key was pressed. The top view gets first refusal. */
  key(key: string): void {
    if (this.top.key?.(key, this)) {
      this.invalidate();
      return;
    }

    if (key === SETTINGS_KEY) {
      if (this.current === 'settings') {
        this.back();
      } else {
        this.push('settings');
      }
      return;
    }

    if (key === BACK_KEY) {
      this.back();
    }
  }

  private open(id: ViewId): void {
    let view = this.views.get(id);
    if (!view) {
      view = FACTORIES[id]();
      this.views.set(id, view);
    }

    this.stack.push(view);
    view.enter?.(this);
    this.changed();
  }

  private changed(): void {
    this.invalidate();
    this.onChange?.(this.path);
  }

  private invalidate(): void {
    this.onInvalidate?.();
  }
}
