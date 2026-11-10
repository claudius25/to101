import { ScreenView, ViewFrame, ViewNav } from './view';
import { background, button, font, header, lines, title, PALETTE } from './ui';

/** First chapter: what the player lands on when the game opens. */
export class ChapterOne implements ScreenView {
  readonly id = 'chapter-1' as const;

  paint(frame: ViewFrame): void {
    const { ctx, width, unit, info } = frame;

    background(frame);
    header(frame, 'Chapter 1');
    title(frame, 'The Arrival', unit * 30);
    lines(
      frame,
      ['You wake up holding the device.', 'It is warm, and something is counting.'],
      unit * 42,
    );

    ctx.fillStyle = PALETTE.faint;
    ctx.font = font(frame, 6.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `dev · key ${info.lastKey || '--'} · dice ${info.roll || '--'} · ⚙ opens settings`,
      unit * 9,
      unit * 72,
    );

    button(frame, {
      target: 'next',
      label: 'End chapter 1  →',
      x: unit * 9,
      y: unit * 78,
      width: width - unit * 18,
      height: unit * 14,
    });
  }

  press(target: string, nav: ViewNav): void {
    if (target === 'next') {
      nav.go('chapter-2');
    }
  }
}
