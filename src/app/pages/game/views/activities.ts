import { ACTIVITIES_CONFIG, AGE_RANGES } from '../activities/activities.config';
import { ageRange } from '../activities/age-range';
import { ActivityProgress } from '../activities/activity-progress';
import { AgeSlider } from './components/age-slider';
import { ScreenView, ViewFrame, ViewNav } from './view';
import { font, roundedRect } from './ui';

const PAGE_SIZE = 6;

export class ActivitiesView implements ScreenView {
  readonly id = 'activities' as const;
  readonly briefing = {
    text: '',
    fontSize: 15,
    character: null,
  };

  private range = ageRange(ACTIVITIES_CONFIG.ageMonths);
  private readonly ageSlider = new AgeSlider(
    Array.from({ length: 6 }, (_, age) => ({ age, enabled: !!ageRange(age * 12) })),
    Math.floor(ACTIVITIES_CONFIG.ageMonths / 12),
  );
  private readonly icons = new Map<string, HTMLImageElement>();
  private focus = 0;

  constructor(private readonly progress: ActivityProgress) {}

  selectAge(ageMonths: number): void {
    const range = ageRange(ageMonths);
    if (!range) return;
    this.ageSlider.select(Math.floor(ageMonths / 12));
    this.range = range;
    this.focus = 0;
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
    const page = Math.floor(this.focus / PAGE_SIZE);
    const layout = ACTIVITIES_CONFIG.layout;
    const pageActivities = activities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const gap = unit * layout.gap;
    const rows = Math.max(1, Math.ceil(pageActivities.length / 2));
    const footer = unit * (activities.length > PAGE_SIZE ? 12 : 7);
    const contentTop = unit * layout.topPadding;
    const contentHeight = height - contentTop - footer;
    const rowGaps = gap * (rows - 1);
    const cardWidth = (width - unit * layout.sidePadding * 2 - gap) / 2;
    const cardHeight = Math.min(unit * layout.tileSize, (contentHeight - rowGaps) / rows);
    const gridY = contentTop + (contentHeight - rows * cardHeight - rowGaps) / 2;
    const gridX = activities.length === 1 ? (width - cardWidth) / 2 : unit * layout.sidePadding;

    pageActivities.forEach((activity, slot) => {
      const index = page * PAGE_SIZE + slot;
      const x = gridX + (slot % 2) * (cardWidth + gap);
      const y = gridY + Math.floor(slot / 2) * (cardHeight + gap);
      const done = this.progress.has(this.range!.id, activity.id);
      const unlocked = this.progress.isUnlocked(activity.view);
      const target = `activity:${index}`;
      const focused = index === this.focus;
      const pressed = unlocked && frame.pressed === target;
      const radius = unit * 2.2;
      const labelHeight = Math.min(unit * 10, cardHeight * 0.28);
      const imageHeight = cardHeight - labelHeight;
      const inset = unit * 2;

      ctx.save();
      ctx.globalAlpha = unlocked ? 1 : 0.4;
      roundedRect(ctx, x, y, cardWidth, cardHeight, radius);
      ctx.fillStyle = pressed ? '#34312c' : '#1c2227';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = done ? activity.color : '#d5d3cc';
      ctx.fillRect(x, y, cardWidth, imageHeight);

      const image = this.icons.get(activity.icon);
      if (image?.complete && image.naturalWidth > 0) {
        const scale =
          Math.min(
            (cardWidth - inset * 2) / image.naturalWidth,
            (imageHeight - inset * 2) / image.naturalHeight,
          ) * layout.iconScale;
        const iconWidth = image.naturalWidth * scale;
        const iconHeight = image.naturalHeight * scale;
        ctx.filter = done ? 'none' : 'grayscale(1)';
        ctx.drawImage(
          image,
          x + (cardWidth - iconWidth) / 2,
          y + (imageHeight - iconHeight) / 2,
          iconWidth,
          iconHeight,
        );
        ctx.filter = 'none';
      }
      ctx.restore();

      roundedRect(ctx, x, y, cardWidth, cardHeight, radius);
      ctx.strokeStyle = focused || pressed ? '#f6a45d' : '#465057';
      ctx.lineWidth = unit * layout.borderWidth * (focused || pressed ? 2 : 1);
      ctx.stroke();
      ctx.fillStyle = focused ? '#ffd2a9' : '#f4f3eb';
      ctx.font = font(frame, Math.min(4.4, (labelHeight / unit) * 0.44), 600);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        activity.label,
        x + unit * 3,
        y + imageHeight + labelHeight / 2,
        cardWidth - unit * (done || !unlocked ? 12 : 6),
      );

      if (!unlocked) {
        const lockX = x + cardWidth - unit * 7;
        const lockY = y + imageHeight + labelHeight / 2;
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
        ctx.moveTo(x + cardWidth - unit * 8, y + imageHeight + labelHeight / 2);
        ctx.lineTo(x + cardWidth - unit * 6, y + imageHeight + labelHeight / 2 + unit * 2);
        ctx.lineTo(x + cardWidth - unit * 3, y + imageHeight + labelHeight / 2 - unit * 2);
        ctx.strokeStyle = '#a6d8b8';
        ctx.lineWidth = unit * 0.8;
        ctx.stroke();
      }
      ctx.restore();
      if (unlocked) hit.add(target, x, y, cardWidth, cardHeight);
    });
    if (activities.length > PAGE_SIZE) {
      ctx.fillStyle = '#f4f3eb';
      ctx.font = font(frame, 4.5);
      ctx.textAlign = 'center';
      ctx.fillText(
        `${page + 1} / ${Math.ceil(activities.length / PAGE_SIZE)}`,
        width / 2,
        unit * 96,
      );
      hit.add('previous', 0, unit * 91, width / 2, unit * 9);
      hit.add('next', width / 2, unit * 91, width / 2, unit * 9);
      ctx.fillText('‹', unit * 8, unit * 96);
      ctx.fillText('›', width - unit * 8, unit * 96);
    }
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
    if (target === 'previous' || target === 'next') {
      const pages = Math.ceil(activities.length / PAGE_SIZE);
      const page = Math.floor(this.focus / PAGE_SIZE);
      this.focus = ((page + (target === 'next' ? 1 : -1) + pages) % pages) * PAGE_SIZE;
      return;
    }
    const index = Number(target.replace('activity:', ''));
    const activity = activities[index];
    if (!activity || !this.progress.isUnlocked(activity.view)) return;
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
    const movement: Record<string, number> = { left: -1, right: 1, up: -2, down: 2 };
    if (!(key in movement)) return false;
    this.focus = (this.focus + movement[key] + count) % count;
    return true;
  }
}
