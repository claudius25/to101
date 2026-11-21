import { font, roundedRect } from '../ui';
import { ViewFrame } from '../view';
import { paintEnterKey } from './complete-activity';

const NEXT_PANEL_TARGET = 'storyboard:next';

/** Plays an ordered set of comic panels before a canvas game. */
export class Storyboard {
  private panels: HTMLImageElement[] = [];
  private index = 0;

  constructor(
    private readonly sources: readonly string[],
    private readonly finishLabel = 'Continue',
  ) {}

  get active(): boolean {
    return this.index < this.panels.length;
  }

  reset(): void {
    if (!this.panels.length) {
      this.panels = this.sources.map((source) => {
        const image = new Image();
        image.src = source;
        return image;
      });
    }
    this.index = 0;
  }

  key(key: string): boolean {
    if (key !== 'enter' || !this.active) return false;
    if (this.panels[this.index].complete) this.index++;
    return true;
  }

  press(target: string): void {
    if (target === NEXT_PANEL_TARGET) this.key('enter');
  }

  paint(frame: ViewFrame): boolean {
    if (!this.active) return false;
    const { ctx, width, height, unit } = frame;
    const panel = this.panels[this.index];
    const ready = panel.complete && panel.naturalWidth > 0;
    ctx.save();
    ctx.fillStyle = '#2b2220';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff4e5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(frame, 3.4, 600);

    if (ready) {
      const scale = Math.max(width / panel.naturalWidth, height / panel.naturalHeight);
      const w = panel.naturalWidth * scale;
      const h = panel.naturalHeight * scale;
      ctx.drawImage(panel, (width - w) / 2, (height - h) / 2, w, h);
    } else {
      ctx.fillText(panel.complete ? 'Panel unavailable' : 'Loading story…', width / 2, height / 2);
    }

    if (panel.complete) {
      const action = this.index === this.panels.length - 1 ? this.finishLabel : 'Next';
      const { x, y, size } = paintEnterKey(frame, NEXT_PANEL_TARGET);
      const label = `${this.index + 1}/${this.panels.length} · ${action}`;
      const padding = unit * 1.5;
      const labelRight = x - padding;
      const labelWidth = Math.min(labelRight - padding, ctx.measureText(label).width + padding * 2);
      roundedRect(ctx, labelRight - labelWidth, y, labelWidth, size, size * 0.18);
      ctx.fillStyle = '#2b2220';
      ctx.fill();
      ctx.fillStyle = '#fff4e5';
      ctx.fillText(label, labelRight - labelWidth / 2, y + size / 2, labelWidth - padding * 2);
    }
    ctx.restore();
    return true;
  }
}
