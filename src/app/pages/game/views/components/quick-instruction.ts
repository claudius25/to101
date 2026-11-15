import { drawSpans, wrapSpans } from '../../e-ink/rich-text';
import { roundedRect } from '../ui';
import { ViewFrame, ViewPointer } from '../view';

/** Reusable, dismissible instruction card for any canvas-based game screen. */
export class QuickInstruction {
  private dismissed = false;
  private bounds: { x: number; y: number; width: number; height: number } | null = null;

  constructor(readonly text: string) {}

  get visible(): boolean { return !this.dismissed; }

  reset(): void {
    this.dismissed = false;
    this.bounds = null;
  }

  dismiss(): void { this.dismissed = true; }

  /** Consume the dismissing touch, so it cannot activate the game underneath. */
  pointer(event: ViewPointer): boolean {
    const box = this.bounds;
    if (this.dismissed || !box || event.phase !== 'down') return false;
    if (event.x < box.x || event.x > box.x + box.width ||
        event.y < box.y || event.y > box.y + box.height) return false;
    this.dismiss();
    return true;
  }

  paint(frame: ViewFrame): void {
    if (this.dismissed) return;
    const { ctx, width, height, unit } = frame;
    const padding = unit * 2.8;
    const boxWidth = width * 0.9;
    const size = unit * 4.2;
    const step = size * 1.3;
    const style = {
      font: (bold: boolean, italic: boolean) =>
        `${italic ? 'italic ' : ''}${bold ? 700 : 500} ${size}px "Segoe UI", sans-serif`,
      underlineWidth: Math.max(1, size * 0.07),
      underlineOffset: size * 0.42,
    };
    const rows = wrapSpans(ctx, this.text, boxWidth - padding * 2, style);
    const box = {
      x: (width - boxWidth) / 2,
      y: height * 0.035,
      width: boxWidth,
      height: rows.length * step + padding * 2,
    };
    this.bounds = box;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, unit * 0.35);
    roundedRect(ctx, box.x, box.y, box.width, box.height, unit * 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    rows.forEach((row, index) => {
      drawSpans(ctx, row, box.x + padding, box.y + padding + step * (index + 0.5), style);
    });
    ctx.restore();
  }
}
