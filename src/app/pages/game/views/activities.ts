import { ACTIVITIES_CONFIG, AGE_RANGES } from '../activities/activities.config';
import { ageRange } from '../activities/age-range';
import { ActivityProgress } from '../activities/activity-progress';
import { AgeSlider } from './components/age-slider';
import { ScreenView, ViewFrame, ViewNav, ViewPointer } from './view';
import { font, roundedRect } from './ui';

const layout = ACTIVITIES_CONFIG.layout;
const viewportHeight = 100 - layout.topPadding - layout.bottomPadding;
const rowStride = layout.rowHeight + layout.gap;

export class ActivitiesView implements ScreenView {
  readonly id = 'activities' as const;
  private range = ageRange(ACTIVITIES_CONFIG.ageMonths);
  private age = Math.floor(ACTIVITIES_CONFIG.ageMonths / 12);
  private readonly ageSlider = new AgeSlider(
    Array.from({ length: 6 }, (_, age) => {
      const range = ageRange(age * 12);
      return { age, enabled: () => !!range && this.progress.isAgeUnlocked(range) };
    }),
    this.age,
  );
  private readonly icons = new Map<string, HTMLImageElement>();
  private focus = 0;
  private scroll = 0;
  private unit = 0;
  private drag?: { id: number; y: number; scroll: number; moved: boolean };

  constructor(private readonly progress: ActivityProgress) {
    this.selectAge(ACTIVITIES_CONFIG.ageMonths);
  }

  get selectedAge(): number {
    return this.age;
  }

  selectAge(ageMonths: number): void {
    const range = ageRange(ageMonths);
    if (!range || !this.progress.isAgeUnlocked(range)) return;
    this.age = Math.floor(ageMonths / 12);
    this.ageSlider.select(this.age);
    this.range = range;
    // Land on the first activity that is open and not done yet, so Enter carries on from there.
    const next = range.activities.findIndex((activity) => this.progress.canStart(activity.view));
    this.focus = Math.max(0, next);
    this.scroll = 0;
    this.revealFocus();
  }

  get animated(): boolean {
    return this.ageSlider.animated;
  }

  update(deltaMs: number): void {
    this.ageSlider.update(deltaMs);
  }

  enter(): void {
    for (const activity of AGE_RANGES.flatMap((range) => range.activities)) {
      if (this.icons.has(activity.icon)) continue;
      const image = new Image();
      image.src = activity.icon;
      this.icons.set(activity.icon, image);
    }
  }

  paint(frame: ViewFrame): void {
    const { ctx, width, height, unit, hit } = frame;
    ctx.fillStyle = '#101419';
    ctx.fillRect(0, 0, width, height);
    this.ageSlider.paint(frame);
    const activities = this.range?.activities ?? [];
    this.unit = unit;
    const top = unit * layout.topPadding;
    const bottom = height - unit * layout.bottomPadding;
    const x = unit * layout.sidePadding;
    const maxScroll = this.maxScroll;
    const barWidth = unit * 1.3;
    const cardWidth = width - 2 * x - (maxScroll > 0 ? barWidth + unit * 1.5 : 0);
    const cardHeight = unit * layout.rowHeight;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, width, bottom - top);
    ctx.clip();
    activities.forEach((activity, index) => {
      const y = top + unit * (index * rowStride - this.scroll);
      const visibleTop = Math.max(y, top);
      const visibleBottom = Math.min(y + cardHeight, bottom);
      if (visibleBottom <= visibleTop) return;
      const done = this.progress.has(this.range!.id, activity.id);
      const unlocked = this.progress.isUnlocked(activity.view);
      const target = `activity:${index}`;
      const focused = index === this.focus;
      const playable = unlocked && !done;
      const pressed = playable && frame.pressed === target;
      const radius = unit * 2.2;
      const inset = unit * 1.6;
      const iconSize = cardHeight - inset * 2;
      const iconX = x + inset;
      const iconY = y + inset;
      const centerY = y + cardHeight / 2;
      const labelX = iconX + iconSize + unit * 3.5;

      ctx.save();
      ctx.globalAlpha = unlocked ? 1 : 0.4;
      roundedRect(ctx, x, y, cardWidth, cardHeight, radius);
      ctx.fillStyle = pressed ? '#34312c' : '#1c2227';
      ctx.fill();

      ctx.save();
      roundedRect(ctx, iconX, iconY, iconSize, iconSize, radius);
      ctx.clip();
      ctx.fillStyle = done ? activity.color : '#d5d3cc';
      ctx.fillRect(iconX, iconY, iconSize, iconSize);

      const image = this.icons.get(activity.icon);
      if (image?.complete && image.naturalWidth > 0) {
        const scale =
          (iconSize / Math.max(image.naturalWidth, image.naturalHeight)) * layout.iconScale;
        const iconWidth = image.naturalWidth * scale;
        const iconHeight = image.naturalHeight * scale;
        ctx.filter = done ? 'none' : 'grayscale(1)';
        ctx.drawImage(
          image,
          iconX + (iconSize - iconWidth) / 2,
          iconY + (iconSize - iconHeight) / 2,
          iconWidth,
          iconHeight,
        );
      }
      ctx.restore();

      roundedRect(ctx, x, y, cardWidth, cardHeight, radius);
      ctx.strokeStyle = focused || pressed ? '#f6a45d' : '#465057';
      ctx.lineWidth = unit * layout.borderWidth * (focused || pressed ? 2 : 1);
      ctx.stroke();
      ctx.fillStyle = '#f4f3eb';
      ctx.font = font(frame, 5.5, 600);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        activity.label,
        labelX,
        centerY,
        x + cardWidth - labelX - unit * (done || !unlocked ? 12 : 3),
      );

      if (!unlocked && !done) {
        const lockX = x + cardWidth - unit * 7;
        const lockY = centerY;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#c2c7cc';
        ctx.lineWidth = unit * 0.6;
        ctx.beginPath();
        ctx.arc(lockX, lockY - unit, unit * 1.7, Math.PI, 0);
        ctx.stroke();
        roundedRect(ctx, lockX - unit * 2.3, lockY - unit, unit * 4.6, unit * 3.5, unit * 0.5);
        ctx.stroke();
      } else if (done) {
        ctx.beginPath();
        ctx.moveTo(x + cardWidth - unit * 8, centerY);
        ctx.lineTo(x + cardWidth - unit * 6, centerY + unit * 2);
        ctx.lineTo(x + cardWidth - unit * 3, centerY - unit * 2);
        ctx.strokeStyle = '#a6d8b8';
        ctx.lineWidth = unit * 0.8;
        ctx.stroke();
      }
      ctx.restore();
      if (playable) hit.add(target, x, visibleTop, cardWidth, visibleBottom - visibleTop);
    });
    ctx.restore();

    if (maxScroll > 0) {
      const trackHeight = bottom - top;
      const thumbHeight = Math.max(unit * 5, trackHeight ** 2 / (trackHeight + maxScroll * unit));
      const thumbY = top + (trackHeight - thumbHeight) * (this.scroll / maxScroll);
      const barX = width - x - barWidth;
      roundedRect(ctx, barX, top, barWidth, trackHeight, barWidth / 2);
      ctx.fillStyle = '#31363a';
      ctx.fill();
      roundedRect(ctx, barX, thumbY, barWidth, thumbHeight, barWidth / 2);
      ctx.fillStyle = '#797e82';
      ctx.fill();
    }
  }

  private get maxScroll(): number {
    const count = this.range?.activities.length ?? 0;
    return Math.max(0, count * rowStride - layout.gap - viewportHeight);
  }

  private revealFocus(): void {
    const top = this.focus * rowStride;
    const bottom = top + layout.rowHeight;
    this.scroll = Math.max(
      0,
      Math.min(top, this.maxScroll, Math.max(this.scroll, bottom - viewportHeight)),
    );
  }

  pointer({ id, phase, y }: ViewPointer): boolean {
    if (phase === 'down') {
      if (
        !this.drag &&
        this.unit > 0 &&
        this.maxScroll > 0 &&
        y >= this.unit * layout.topPadding &&
        y <= this.unit * (100 - layout.bottomPadding)
      ) {
        this.drag = { id, y, scroll: this.scroll, moved: false };
      }
      return false;
    }

    const drag = this.drag;
    if (!drag || drag.id !== id) return false;
    if (phase !== 'move') {
      this.drag = undefined;
      return drag.moved;
    }
    const distance = (drag.y - y) / this.unit;
    if (!drag.moved && Math.abs(distance) < 1) return false;

    drag.moved = true;
    this.scroll = Math.max(0, Math.min(this.maxScroll, drag.scroll + distance));
    return true;
  }

  suspend(): void {
    this.drag = undefined;
  }

  press(target: string, nav: ViewNav): void {
    if (target.startsWith('age:')) {
      const age = Number(target.slice(4));
      const range = ageRange(age * 12);
      if (range && range !== this.range) {
        this.selectAge(age * 12);
      }
      return;
    }
    const activities = this.range?.activities ?? [];
    if (!activities.length) return;
    const index = Number(target.replace('activity:', ''));
    const activity = activities[index];
    if (!activity || !this.progress.canStart(activity.view)) return;
    this.focus = index;
    nav.push(activity.view);
  }

  key(key: string, nav: ViewNav): boolean {
    const count = this.range?.activities.length ?? 0;
    if (!count) return false;
    if (key === 'enter') {
      this.press(`activity:${this.focus}`, nav);
      return true;
    }
    const movement: Record<string, number> = { left: -1, right: 1, up: -1, down: 1 };
    if (!(key in movement)) return false;
    this.focus = (this.focus + movement[key] + count) % count;
    this.revealFocus();
    return true;
  }
}
