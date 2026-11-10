import { ScreenView, ViewFrame, ViewNav } from './view';
import { background, button, font, header, lines, title, PALETTE } from './ui';

/** Second chapter: reached by ending chapter 1. */
export class ChapterTwo implements ScreenView {
  readonly id = 'chapter-2' as const;

  paint(frame: ViewFrame): void {
    const { ctx, width, unit, info } = frame;
    const half = (width - unit * 21) / 2;

    background(frame);
    header(frame, 'Chapter 2');
    title(frame, 'The Climb', unit * 30);
    lines(
      frame,
      ['Chapter 1 is behind you.', 'The dial wants a number before you go on.'],
      unit * 42,
    );

    ctx.fillStyle = PALETTE.faint;
    ctx.font = font(frame, 6.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      info.rolling ? 'dev · rolling…' : `dev · last dice ${info.roll || '--'}`,
      unit * 9,
      unit * 72,
    );

    button(frame, {
      target: 'restart',
      label: '←  Chapter 1',
      x: unit * 9,
      y: unit * 78,
      width: half,
      height: unit * 14,
      tone: 'ghost',
    });

    button(frame, {
      target: 'settings',
      label: 'Settings',
      x: unit * 12 + half,
      y: unit * 78,
      width: half,
      height: unit * 14,
      tone: 'ghost',
    });
  }

  press(target: string, nav: ViewNav): void {
    if (target === 'restart') {
      nav.go('chapter-1');
    } else if (target === 'settings') {
      nav.push('settings');
    }
  }
}
