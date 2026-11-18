import { ACTIVITIES_CONFIG } from '../activities/activities.config';
import { ageRange } from '../activities/age-range';
import { ActivityProgress } from '../activities/activity-progress';
import { ScreenView, ViewFrame, ViewNav } from './view';
import { font } from './ui';

const PAGE_SIZE = 6;

export class ActivitiesView implements ScreenView {
  readonly id = 'activities' as const;
  readonly briefing = {
    text: 'Choose an activity',
    fontSize: 15,
    character: 'assets/e-ink/doc.png',
  };

  private readonly range = ageRange(ACTIVITIES_CONFIG.ageMonths);
  private readonly icons = new Map<string, HTMLImageElement>();
  private focus = 0;

  constructor(private readonly progress: ActivityProgress) {}

  enter(): void {
    for (const activity of this.range?.activities ?? []) {
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
    const title = ACTIVITIES_CONFIG.title;
    if (title.visible) {
      const anchors = {
        left: unit * title.sidePadding,
        center: width / 2,
        right: width - unit * title.sidePadding,
      };
      ctx.save();
      ctx.textAlign = title.align;
      ctx.textBaseline = title.baseline;
      ctx.fillStyle = title.color;
      ctx.font = `${title.fontStyle} ${title.fontWeight} ${unit * title.fontSize}px ${title.fontFamily}`;
      ctx.fillText(
        this.range?.label ?? 'Interval neconfigurat',
        anchors[title.align] + unit * title.offsetX,
        unit * title.y,
      );
      ctx.restore();
    }

    const activities = this.range?.activities ?? [];
    const page = Math.floor(this.focus / PAGE_SIZE);
    const layout = ACTIVITIES_CONFIG.layout;
    const gap = unit * layout.gap;
    const tileSize = Math.min(
      (width - unit * layout.sidePadding * 2 - gap) / 2,
      unit * layout.tileSize,
    );
    const gridX = (width - tileSize * 2 - gap) / 2;
    activities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((activity, slot) => {
      const index = page * PAGE_SIZE + slot;
      const x = gridX + (slot % 2) * (tileSize + gap);
      const y = unit * layout.topPadding + Math.floor(slot / 2) * (tileSize + gap);
      const done = this.progress.has(this.range!.id, activity.id);
      const target = `activity:${index}`;
      ctx.beginPath();
      ctx.rect(x, y, tileSize, tileSize);
      ctx.fillStyle = done ? activity.color : '#363c44';
      ctx.fill();
      ctx.strokeStyle = index === this.focus || frame.pressed === target ? '#f4f3eb' : '#555e68';
      ctx.lineWidth = unit * layout.borderWidth;
      ctx.stroke();

      const image = this.icons.get(activity.icon);
      if (image?.complete && image.naturalWidth > 0) {
        const size = tileSize * layout.iconScale;
        const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
        const iconWidth = image.naturalWidth * scale;
        const iconHeight = image.naturalHeight * scale;
        ctx.save();
        ctx.filter = done ? 'none' : 'grayscale(1)';
        ctx.drawImage(image, x + (tileSize - iconWidth) / 2, y + (tileSize - iconHeight) / 2, iconWidth, iconHeight);
        ctx.restore();
      }
      if (done) {
        ctx.beginPath();
        ctx.moveTo(x + tileSize - unit * 8, y + unit * 4);
        ctx.lineTo(x + tileSize - unit * 6, y + unit * 6);
        ctx.lineTo(x + tileSize - unit * 3, y + unit * 2.5);
        ctx.strokeStyle = '#10251b';
        ctx.lineWidth = unit * 0.8;
        ctx.stroke();
      }
      hit.add(target, x, y, tileSize, tileSize);
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
    if (!activity) return;
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
