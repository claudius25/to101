import {
  BabyDeliveryMode,
  BabyDeliveryQuality,
  BabyDeliveryRetro,
  BabyDeliveryRuntime,
  BabyDeliveryStatus,
  BabyDeliveryView,
  createBabyDelivery,
} from './baby-delivery-runtime';
import { ScreenView, ViewFrame, ViewPointer } from './view';
import { font, roundedRect, wrap } from './ui';
import { QuickInstruction } from './components/quick-instruction';
import { Storyboard } from './components/storyboard';

const BEFORE_STORY = [
  '01-birthday-wish.png',
  '02-one-more-delivery.png',
  '03-the-stare.png',
  '04-boss-close-up.png',
  '05-reluctant-yes.png',
  '06-baby-handoff.png',
  '07-takeoff.png',
].map((panel) => `assets/baby-delivery/before-storyboard/${panel}`);

const INTRO_QUOTES = [
  'Special delivery! Handle with care.',
  'Every baby arrives by air mail.',
  'Smooth skies make sleepy babies.',
  'Fragile: contains one brand-new human.',
  'Mind the chimneys. Mind the crows. Mind the baby.',
  'No returns. No exchanges. Deliver with love.',
] as const;

/** HUD and card styling. Sizes are in `frame.unit` (1% of the screen height). */
export const BABY_DELIVERY_HUD = {
  ink: '#2b2220',
  muted: '#8a7b70',
  cream: '#fffdf9',
  line: '#eadfd1',
  orange: '#f0711c',
  sleepCalm: ['#8fb8e8', '#b9a7e8'],
  sleepFussy: ['#f2a07a', '#f2c14e'],
  sleepLullaby: ['#c9a7f0', '#f3b6e0'],
  /** Touch steering reaches full deflection after this many units of drag. */
  dragRange: 9,
};

type CardButton = 'start-level' | 'start-endless' | 'camera' | 'again' | 'endless' | 'menu';

/** The stork flies the newborn to its new home: a 3D runner drawn into the glass surface. */
export class ChapterBabyDelivery implements ScreenView {
  readonly id = 'chapter-baby-delivery' as const;
  readonly animated = true;
  /** Last activity of its age: once every activity there is done, continue to the next age. */
  readonly completionNavigation = 'next-age' as const;
  readonly briefing = {
    text: '**Special delivery!**',
    fontSize: 15,
    character: 'assets/e-ink/life-stages/age-0-crane-baby.png',
  };
  readonly quality: BabyDeliveryQuality = 'auto';
  /** Retro pixel-art look for the 3D scene. */
  readonly retro: Partial<BabyDeliveryRetro> = { on: true, pixelSize: 3, palette: 'village', dither: true };

  /** Camera choice, kept while the app is open: chase, or the overhead racer view (left/right only). */
  private view: BabyDeliveryView = 'chase';
  private runtime: BabyDeliveryRuntime | null = null;
  private delivered = false;
  private error = '';
  private selection = 0;
  private readonly storyboard = new Storyboard(BEFORE_STORY, 'Continue to game');
  private touch: { id: number; x0: number; y0: number } | null = null;
  private readonly instruction = new QuickInstruction(
    'Arrows steer, Enter pauses. Fly smoothly to keep the baby asleep.',
  );

  get completed(): boolean {
    return this.delivered;
  }

  enter(): void {
    this.delivered = false;
    this.selection = 0;
    this.touch = null;
    this.instruction.reset();
    this.storyboard.reset();
    const quote = INTRO_QUOTES[Math.floor(Math.random() * INTRO_QUOTES.length)];
    this.briefing.text = `**${quote}**`;
    if (this.runtime || this.error) {
      this.runtime?.menu();
      return;
    }
    try {
      this.runtime = createBabyDelivery({ quality: this.quality, retro: this.retro, view: this.view });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not start the 3D scene.';
    }
  }

  update(deltaMs: number): void {
    this.runtime?.update(deltaMs);
    const status = this.runtime?.status();
    if (status?.result?.success && status.mode === 'level') this.delivered = true;
  }

  // ------------------------------------------------------------------ input

  key(key: string): boolean {
    if (this.storyboard.active) return this.storyboard.key(key);
    const status = this.runtime?.status();
    if (!status || status.loading || status.error) return false;
    if (status.phase === 'play') {
      if (key === 'enter') {
        this.runtime?.setPaused(!status.paused);
        return true;
      }
      if (['left', 'right', 'up', 'down'].includes(key)) {
        this.instruction.dismiss();
        this.runtime?.key(key, true);
        return true;
      }
      return false;
    }
    const buttons = this.buttonsFor(status);
    if (!buttons.length) return false;
    if (['left', 'right', 'up', 'down'].includes(key)) {
      const step = key === 'up' || key === 'left' ? -1 : 1;
      this.selection = (this.selection + step + buttons.length) % buttons.length;
      return true;
    }
    if (key === 'enter') {
      this.activate(buttons[Math.min(this.selection, buttons.length - 1)]);
      return true;
    }
    return false;
  }

  keyUp(key: string): void {
    this.runtime?.key(key, false);
  }

  /** While flying, a drag anywhere steers. Menus fall through to the router's tap handling. */
  pointer(event: ViewPointer): boolean {
    if (this.storyboard.active) return false;
    if (this.instruction.pointer(event)) return true;
    const status = this.runtime?.status();
    if (status?.phase !== 'play' || status.paused) {
      this.touch = null;
      return false;
    }
    if (event.phase === 'down') {
      this.instruction.dismiss();
      this.touch = { id: event.id, x0: event.x, y0: event.y };
      return true;
    }
    if (!this.touch || this.touch.id !== event.id) return true;
    if (event.phase === 'up' || event.phase === 'cancel') {
      this.touch = null;
      this.runtime?.steer(null, null);
      return true;
    }
    const range = Math.max(1, this.lastUnit * BABY_DELIVERY_HUD.dragRange);
    this.runtime?.steer((event.x - this.touch.x0) / range, -(event.y - this.touch.y0) / range);
    return true;
  }

  press(target: string): void {
    if (this.storyboard.active) {
      this.storyboard.press(target);
      return;
    }
    if (!target.startsWith('delivery:')) return;
    this.activate(target.slice('delivery:'.length) as CardButton);
  }

  private activate(button: CardButton | undefined): void {
    if (!button || !this.runtime) return;
    if (button === 'camera') {
      this.view = this.view === 'top' ? 'chase' : 'top';
      this.runtime.setView(this.view);
      return;
    }
    this.selection = 0;
    if (button === 'menu') {
      this.runtime.menu();
      return;
    }
    const mode: BabyDeliveryMode =
      button === 'start-endless' || button === 'endless' ? 'endless' : 'level';
    if (button === 'again') {
      this.runtime.start(this.runtime.status().mode);
    } else {
      this.runtime.start(mode);
    }
    this.instruction.dismiss();
  }

  private buttonsFor(status: BabyDeliveryStatus): CardButton[] {
    if (status.phase === 'menu') return ['start-level', 'start-endless', 'camera'];
    if (status.phase === 'end') {
      return status.result?.success && status.mode === 'level'
        ? ['again', 'endless']
        : ['again', 'menu'];
    }
    return [];
  }

  // ------------------------------------------------------------------ painting

  private lastUnit = 1;

  paint(frame: ViewFrame): void {
    if (this.storyboard.paint(frame)) return;
    const { ctx, width, height, unit } = frame;
    this.lastUnit = unit;
    ctx.fillStyle = '#bfe0f2';
    ctx.fillRect(0, 0, width, height);
    if (this.runtime) {
      this.runtime.render(width, height);
      // keep the retro pixels square and sharp when scaling up to the glass surface
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = !this.runtime.status().retro.on;
      ctx.drawImage(this.runtime.canvas, 0, 0, width, height);
      ctx.imageSmoothingEnabled = smoothing;
    }
    const status = this.runtime?.status();
    if (this.error || !status || status.loading || status.error) {
      this.paintMessage(frame, this.error || status?.error || 'Warming up the stork…');
      return;
    }
    if (status.phase !== 'menu') this.paintHud(frame, status);
    if (status.phase === 'menu') this.paintMenu(frame);
    if (status.phase === 'end') this.paintEnd(frame, status);
    if (status.phase === 'play' && status.paused) this.paintMessage(frame, 'Paused · Enter to keep flying');
    this.instruction.paint(frame);
  }

  private paintMessage(frame: ViewFrame, text: string): void {
    const { ctx, width, height, unit } = frame;
    ctx.save();
    ctx.font = font(frame, 3.4, 600);
    const lines = wrap(ctx, text, width * 0.8);
    const boxHeight = unit * (4 + lines.length * 4.6);
    roundedRect(ctx, width * 0.07, height * 0.45 - boxHeight / 2, width * 0.86, boxHeight, unit * 2.5);
    ctx.fillStyle = 'rgba(255, 253, 249, 0.92)';
    ctx.fill();
    ctx.fillStyle = BABY_DELIVERY_HUD.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, index) =>
      ctx.fillText(line, width / 2, height * 0.45 - boxHeight / 2 + unit * (4.3 + index * 4.6)),
    );
    ctx.restore();
  }

  private pill(frame: ViewFrame, text: string, x: number, y: number, align: 'left' | 'right'): void {
    const { ctx, unit } = frame;
    ctx.font = font(frame, 2.8, 600);
    const textWidth = ctx.measureText(text).width;
    const w = textWidth + unit * 3.6;
    const h = unit * 4.6;
    const left = align === 'left' ? x : x - w;
    roundedRect(ctx, left, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255, 253, 249, 0.9)';
    ctx.fill();
    ctx.strokeStyle = BABY_DELIVERY_HUD.line;
    ctx.lineWidth = Math.max(1, unit * 0.2);
    ctx.stroke();
    ctx.fillStyle = BABY_DELIVERY_HUD.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + unit * 1.8, y + h / 2);
  }

  private paintHud(frame: ViewFrame, status: BabyDeliveryStatus): void {
    const { ctx, width, height, unit } = frame;
    const hud = BABY_DELIVERY_HUD;
    ctx.save();

    // sleep meter
    const barWidth = Math.min(width * 0.7, unit * 38);
    const barHeight = unit * 4;
    const barX = (width - barWidth) / 2;
    const barY = unit * 2.5;
    roundedRect(ctx, barX, barY, barWidth, barHeight, barHeight / 2);
    ctx.fillStyle = 'rgba(255, 253, 249, 0.9)';
    ctx.fill();
    if (status.soothing) {
      ctx.strokeStyle = 'rgba(185, 167, 232, 0.8)';
      ctx.lineWidth = unit * 0.7;
      ctx.stroke();
    }
    const colors = status.lullaby > 0 ? hud.sleepLullaby : status.sleep < 40 ? hud.sleepFussy : hud.sleepCalm;
    const fill = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    fill.addColorStop(0, colors[0]);
    fill.addColorStop(1, colors[1]);
    ctx.save();
    roundedRect(ctx, barX, barY, barWidth, barHeight, barHeight / 2);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(barX, barY, (barWidth * Math.max(0, Math.min(100, status.sleep))) / 100, barHeight);
    ctx.restore();
    ctx.fillStyle = '#3a3060';
    ctx.font = font(frame, 2.3, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const mood =
      status.lullaby > 0 ? '♪ lullaby ♪' : status.sleep > 70 ? '😴 sound asleep' : status.sleep > 40 ? '😪 stirring…' : '😣 waking up!';
    ctx.fillText(mood, width / 2, barY + barHeight / 2);

    // lullaby notes
    for (let index = 0; index < 3; index++) {
      const cx = width / 2 + (index - 1) * unit * 4.2;
      const cy = barY + barHeight + unit * 3;
      ctx.beginPath();
      ctx.arc(cx, cy, unit * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = index < status.notes ? '#f3e8fb' : 'rgba(255, 253, 249, 0.7)';
      ctx.fill();
      ctx.fillStyle = index < status.notes ? '#9b5cc4' : '#cbbfd8';
      ctx.font = font(frame, 2.2, 700);
      ctx.fillText('♪', cx, cy);
    }

    // feathers / score and distance
    this.pill(frame, `🪶 ${status.feathers} · ${status.score} pts`, unit * 2.5, unit * 12, 'left');
    this.pill(frame, `${status.distance} m`, width - unit * 2.5, unit * 12, 'right');

    // level progress
    if (status.mode === 'level') {
      const trackWidth = width * 0.72;
      const trackX = (width - trackWidth) / 2;
      const trackY = height - unit * 4.5;
      const progress = Math.max(0, Math.min(1, status.distance / (status.goal + 24)));
      roundedRect(ctx, trackX, trackY, trackWidth, unit * 1.4, unit * 0.7);
      ctx.fillStyle = 'rgba(255, 253, 249, 0.85)';
      ctx.fill();
      roundedRect(ctx, trackX, trackY, trackWidth * progress, unit * 1.4, unit * 0.7);
      ctx.fillStyle = hud.orange;
      ctx.fill();
      ctx.font = font(frame, 3, 500);
      ctx.fillText('🕊️', trackX + trackWidth * progress, trackY - unit * 1.4);
      ctx.fillText('🏠', trackX + trackWidth + unit * 1.5, trackY - unit * 1.4);
    }

    // floating "+10" labels and toasts
    for (const floater of status.floaters) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, floater.alpha);
      ctx.font = font(frame, 3.2 * floater.scale, 700);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(120, 90, 190, 0.9)';
      ctx.shadowBlur = unit * 1.2;
      ctx.fillText(floater.text, floater.x * width, floater.y * height);
      ctx.restore();
    }
    if (status.toast) {
      ctx.save();
      ctx.globalAlpha = status.toastAlpha;
      ctx.font = font(frame, 5, 700);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(80, 40, 10, 0.45)';
      ctx.shadowBlur = unit * 1.5;
      ctx.fillText(status.toast, width / 2, height * 0.3, width * 0.92);
      ctx.restore();
    }
    ctx.restore();
  }

  private card(frame: ViewFrame, top: number, cardHeight: number): { x: number; w: number } {
    const { ctx, width, unit } = frame;
    const w = Math.min(width * 0.88, unit * 50);
    const x = (width - w) / 2;
    roundedRect(ctx, x, top, w, cardHeight, unit * 3);
    ctx.fillStyle = 'rgba(255, 253, 249, 0.96)';
    ctx.fill();
    ctx.strokeStyle = BABY_DELIVERY_HUD.line;
    ctx.lineWidth = Math.max(1, unit * 0.25);
    ctx.stroke();
    return { x, w };
  }

  private buttons(frame: ViewFrame, labels: [CardButton, string][], x: number, y: number, w: number): void {
    const { ctx, unit, hit, pressed } = frame;
    labels.forEach(([id, label], index) => {
      const by = y + index * unit * 8;
      const bh = unit * 6.6;
      const primary = index === 0;
      const focused = index === this.selection;
      const target = `delivery:${id}`;
      roundedRect(ctx, x, by, w, bh, unit * 1.8);
      ctx.fillStyle = primary ? BABY_DELIVERY_HUD.orange : '#ffffff';
      if (pressed === target) ctx.fillStyle = primary ? '#ffb27a' : '#fbf3e8';
      ctx.fill();
      ctx.strokeStyle = focused ? '#2b2220' : BABY_DELIVERY_HUD.line;
      ctx.lineWidth = Math.max(1, unit * (focused ? 0.45 : 0.25));
      ctx.stroke();
      ctx.fillStyle = primary ? '#ffffff' : BABY_DELIVERY_HUD.ink;
      ctx.font = font(frame, 2.9, 600);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, by + bh / 2, w - unit * 2);
      hit.add(target, x, by, w, bh);
    });
  }

  private paintMenu(frame: ViewFrame): void {
    const { ctx, width, height, unit } = frame;
    ctx.save();
    ctx.font = font(frame, 2.6, 500);
    const blurb = wrap(
      ctx,
      'Fly the bundle to its new home and drop it through the golden ring above the chimney. Feathers soothe the baby.',
      Math.min(width * 0.88, unit * 50) - unit * 6,
    );
    const cardHeight = unit * (16 + blurb.length * 3.6 + 25);
    const top = Math.max(height * 0.64 - cardHeight / 2, unit * 22);
    const { x, w } = this.card(frame, top, cardHeight);
    ctx.fillStyle = BABY_DELIVERY_HUD.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = font(frame, 5.4, 700);
    ctx.fillText('Special Delivery', width / 2, top + unit * 3.5, w - unit * 4);
    ctx.font = font(frame, 2.6, 500);
    ctx.fillStyle = BABY_DELIVERY_HUD.muted;
    blurb.forEach((line, index) => ctx.fillText(line, width / 2, top + unit * (11 + index * 3.6)));
    this.buttons(
      frame,
      [
        ['start-level', 'Deliver the baby · Level 1'],
        ['start-endless', 'Endless flight'],
        ['camera', this.view === 'top' ? 'Camera: top view (← → only)' : 'Camera: chase'],
      ],
      x + unit * 3,
      top + unit * (13 + blurb.length * 3.6),
      w - unit * 6,
    );
    ctx.restore();
  }

  private paintEnd(frame: ViewFrame, status: BabyDeliveryStatus): void {
    const result = status.result;
    if (!result) return;
    const { ctx, width, height, unit } = frame;
    ctx.save();
    ctx.font = font(frame, 2.6, 500);
    const message = wrap(ctx, result.message, Math.min(width * 0.88, unit * 50) - unit * 6);
    const hasStars = status.mode === 'level' && result.success;
    const cardHeight = unit * (12 + (hasStars ? 6 : 0) + message.length * 3.6 + 14 + 17);
    const top = height * 0.52 - cardHeight / 2;
    const { x, w } = this.card(frame, top, cardHeight);
    let cursor = top + unit * 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = BABY_DELIVERY_HUD.ink;
    ctx.font = font(frame, 5, 700);
    ctx.fillText(result.success ? 'Delivered! 🍼' : `${result.title} 😭`, width / 2, cursor, w - unit * 4);
    cursor += unit * 7;
    if (hasStars) {
      ctx.font = font(frame, 4.6, 700);
      ctx.fillStyle = '#f2b53c';
      ctx.fillText('★'.repeat(result.stars) + '☆'.repeat(3 - result.stars), width / 2, cursor);
      cursor += unit * 6;
    }
    ctx.font = font(frame, 2.6, 500);
    ctx.fillStyle = BABY_DELIVERY_HUD.muted;
    message.forEach((line) => {
      ctx.fillText(line, width / 2, cursor);
      cursor += unit * 3.6;
    });
    cursor += unit * 1.5;
    const stats: [string, string][] = [
      [`${result.distance}`, 'metres'],
      [`${result.feathers}`, 'feathers'],
      [`${result.calm}%`, 'baby calm'],
      [`${result.score}`, 'score'],
    ];
    const cellW = (w - unit * 8) / 4;
    stats.forEach(([value, label], index) => {
      const cx = x + unit * 4 + cellW * (index + 0.5);
      ctx.fillStyle = BABY_DELIVERY_HUD.ink;
      ctx.font = font(frame, 3.6, 700);
      ctx.fillText(value, cx, cursor, cellW);
      ctx.fillStyle = BABY_DELIVERY_HUD.muted;
      ctx.font = font(frame, 1.9, 500);
      ctx.fillText(label, cx, cursor + unit * 4.6, cellW);
    });
    cursor += unit * 11;
    const labels: [CardButton, string][] =
      result.success && status.mode === 'level'
        ? [['again', 'Fly again'], ['endless', 'Endless flight']]
        : [['again', 'Fly again'], ['menu', 'Back to start']];
    this.buttons(frame, labels, x + unit * 3, cursor, w - unit * 6);
    ctx.restore();
  }

  // ------------------------------------------------------------------ lifecycle

  suspend(): void {
    this.touch = null;
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
