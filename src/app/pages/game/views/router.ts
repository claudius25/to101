import { ScreenPaintContext, ScreenPointerPhase } from '../screens';
import { EinkCard } from '../e-ink/eink-display';
import { ChapterGenesis } from './chapter-genesis';
import { ChapterMouthClean } from './chapter-mouth-clean';
import { ChapterOne } from './chapter-one';
import { ChapterTwo } from './chapter-two';
import { ChapterTidyBed } from './chapter-tidy-bed';
import { SettingsView } from './settings';
import { HitRegistry, ScreenView, ViewFrame, ViewId, ViewNav } from './view';
import { ActivitiesView } from './activities';
import { ActivityProgress } from '../activities/activity-progress';
import { AGE_RANGES } from '../activities/activities.config';
import { Hero } from '../hero';
import { DiceInterval, DiceRoll } from '../../../services/dice.service';
import { COMPLETE_ACTIVITY_TARGET, paintCompleteActivity } from './components/complete-activity';

/** Register every view here. Instances are created once and reused, so they keep state. */
const FACTORIES: Record<Exclude<ViewId, 'activities'>, (hero: Hero) => ScreenView> = {
  'chapter-genesis': (hero) => new ChapterGenesis(hero),
  'chapter-mouth-clean': () => new ChapterMouthClean(),
  'chapter-1': () => new ChapterOne(),
  'chapter-2': () => new ChapterTwo(),
  'chapter-tidy-bed': () => new ChapterTidyBed(),
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
  /** Fires with the e-ink message the stack wants shown, or null for none. */
  onBriefing: ((card: EinkCard | null) => void) | null = null;

  private readonly views = new Map<ViewId, ScreenView>();
  private readonly stack: ScreenView[] = [];
  private readonly hits = new HitRegistry();
  private pressed: string | null = null;
  private live = true;
  private curfewed = false;
  private paused = false;
  private readonly progress = new ActivityProgress();
  readonly hero = new Hero();

  constructor(initial: ViewId = 'activities') {
    this.open(this.progress.isUnlocked(initial) ? initial : 'activities');
  }

  dispose(): void {
    this.clearStack();
    for (const view of this.views.values()) view.dispose?.();
    this.views.clear();
  }

  get current(): ViewId {
    return this.top.id;
  }

  get depth(): number {
    return this.stack.length;
  }

  /** True while the glass screen is dark and deaf because of a curfew window. */
  get blocked(): boolean {
    return this.curfewed;
  }

  /** True when the top view wants a repaint every frame. */
  get animated(): boolean {
    return !this.paused && this.top.animated === true;
  }

  /** Human-readable stack, for the dev panel. */
  get path(): string {
    return this.stack.map((view) => view.id).join(' › ');
  }

  private get top(): ScreenView {
    return this.stack[this.stack.length - 1];
  }

  private get completionAvailable(): boolean {
    return this.top.completed === true && this.top.canContinue !== false;
  }

  private completeActivity(): void {
    if (!this.completionAvailable) return;
    if (this.top.completionNavigation === 'next-age') {
      this.nextAgeActivities();
    } else {
      this.activityMenu();
    }
  }

  go(id: ViewId): void {
    this.recordCompletion();
    if (!this.progress.isUnlocked(id)) return;
    this.clearStack();
    this.open(id);
  }

  reset(): void {
    this.dispose();
    this.progress.reset();
    this.hero.reset();
    this.open('activities');
  }

  nextAgeActivities(): void {
    this.openActivityMenu(1);
  }

  generateHeroSummary(): void {
    this.clearStack();
    this.views.get('chapter-genesis')?.dispose?.();
    this.views.delete('chapter-genesis');
    this.hero.generate();
    this.open('chapter-genesis');
    (this.top as ChapterGenesis).showSummary();
    this.recordCompletion();
    this.invalidate();
  }

  activityMenu(): void {
    this.openActivityMenu(0);
  }

  private openActivityMenu(ageOffset: number): void {
    const index = AGE_RANGES.findIndex(range =>
      range.activities.some(activity => activity.view === this.current),
    );
    const range = AGE_RANGES[index + ageOffset];
    this.go('activities');
    if (range) (this.top as ActivitiesView).selectAge(range.minAgeMonths);
    this.invalidate();
  }

  push(id: ViewId): void {
    this.recordCompletion();
    if (!this.progress.isUnlocked(id)) return;
    if (this.stack.some((view) => view.id === id)) {
      return;
    }
    this.open(id);
  }

  back(): void {
    this.recordCompletion();
    if (this.stack.length <= 1) {
      if (this.current !== 'activities') this.go('activities');
      return;
    }
    this.stack.pop()?.exit?.();
    this.changed();
  }

  /**
   * The glass is blocked: the device is inside a curfew window (see `e-ink/curfew.ts`).
   * The screen goes dark and swallows every tap and key. Keys still animate, they just
   * do not reach the views, and the stack is left exactly as it was.
   */
  setBlocked(blocked: boolean): void {
    this.curfewed = blocked;
    this.syncPaused();
  }

  /** The overlay is live: false once the device is rotated away from its home framing. */
  setLive(live: boolean): void {
    this.live = live;
    this.syncPaused();
  }

  /** Advances the top view. Does nothing while the screen is paused. */
  update(deltaMs: number): void {
    if (this.paused) {
      return;
    }
    this.top.update?.(deltaMs, this);
    this.recordCompletion();
  }

  private recordCompletion(): void {
    if (this.top.completed) {
      const range = AGE_RANGES.find((entry) => entry.activities.some((item) => item.view === this.current));
      const activity = range?.activities.find((item) => item.view === this.current);
      if (range && activity) this.progress.complete(range.id, activity.id);
    }
  }

  /** Re-emits the current stack, so callbacks wired after construction catch up. */
  announce(): void {
    this.changed();
  }

  get diceInterval(): DiceInterval | undefined {
    return this.top.diceInterval;
  }

  get diceReady(): boolean {
    return !this.paused && this.top.diceReady === true;
  }

  diceRolled(roll: DiceRoll): void {
    if (this.paused) return;
    this.top.diceRolled?.(roll);
  }

  /** Paints the whole stack bottom-up; only the top view's hotspots survive. */
  paint(frame: ScreenPaintContext): void {
    frame.ctx.setTransform(1, 0, 0, 1, 0, 0);
    frame.ctx.clearRect(0, 0, frame.width, frame.height);

    if (this.blocked) {
      // Nothing drawn: the real black glass of the device shows through.
      this.hits.reset();
      this.pressed = null;
      return;
    }

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

    for (const entry of this.stack) {
      this.hits.reset();
      entry.paint(view);
    }
    if (this.completionAvailable) paintCompleteActivity(view);
  }

  /** Pointer phases from the overlay canvas, in canvas pixels. */
  pointer(phase: ScreenPointerPhase, id: number, x: number, y: number): void {
    if (this.paused) {
      return;
    }

    // A view that handles its own touches (a game, say) takes the whole stream.
    if (!this.completionAvailable && this.top.pointer?.({ id, phase, x, y })) {
      return;
    }

    if (phase === 'move') {
      return;
    }

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
      if (target === COMPLETE_ACTIVITY_TARGET) {
        this.completeActivity();
      } else {
        this.top.press?.(target, this);
      }
    }
    this.invalidate();
  }

  /** A device key was pressed. The top view gets first refusal. */
  key(key: string): void {
    if (this.paused) {
      return;
    }

    if (key === 'enter' && this.completionAvailable) {
      this.completeActivity();
      return;
    }

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

  /** A device key was let go. Only the top view cares. */
  keyUp(key: string): void {
    if (this.paused) {
      return;
    }

    this.top.keyUp?.(key, this);
    this.invalidate();
  }

  private open(id: ViewId): void {
    let view = this.views.get(id);
    if (!view) {
      view = id === 'activities' ? new ActivitiesView(this.progress) : FACTORIES[id](this.hero);
      this.views.set(id, view);
    }

    // The outgoing top stops receiving input, so nothing stays stuck held.
    if (this.stack.length > 0) {
      this.top.suspend?.();
    }

    this.stack.push(view);
    view.enter?.(this);
    this.changed();
  }

  private clearStack(): void {
    while (this.stack.length > 0) {
      this.stack.pop()?.exit?.();
    }
  }

  private changed(): void {
    this.pressed = null;
    this.hits.reset();
    this.invalidate();
    this.onChange?.(this.path);
    // Topmost briefing wins, so a sheet without one leaves the chapter's message up.
    const briefing = [...this.stack].reverse().find((view) => view.briefing)?.briefing;
    this.onBriefing?.(briefing ?? null);
  }

  /** Paused means no updates, no input, and nothing held. */
  private syncPaused(): void {
    const paused = this.curfewed || !this.live;
    if (paused === this.paused) {
      return;
    }

    this.paused = paused;
    if (paused) {
      this.pressed = null;
      this.top.suspend?.();
    }
  }

  private invalidate(): void {
    this.onInvalidate?.();
  }
}
