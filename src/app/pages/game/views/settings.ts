import { font, roundedRect } from './ui';
import { ScreenView, ViewFrame, ViewNav } from './view';

export const SETTINGS_TITLE = {
  text: 'SETTINGS',
  xPercent: 50,
  yPercent: 17.5,
  color: '#808080',
  fontSizePercent: 7,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  fontWeight: 100,
  fontStyle: 'normal',
  align: 'center' as CanvasTextAlign,
  baseline: 'middle' as CanvasTextBaseline,
};

export class SettingsView implements ScreenView {
  readonly id = 'settings' as const;

  paint(frame: ViewFrame): void {
    const { ctx, width, height, unit, hit, pressed } = frame;
    const rowX = width * 0.05;
    const rowY = unit * 30;
    const rowWidth = width - rowX * 2;
    const rowHeight = unit * 17;

    ctx.save();
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, width, height);

    const title = SETTINGS_TITLE;
    ctx.fillStyle = title.color;
    ctx.textAlign = title.align;
    ctx.textBaseline = title.baseline;
    ctx.font = `${title.fontStyle} ${title.fontWeight} ${(unit * title.fontSizePercent).toFixed(1)}px ${title.fontFamily}`;
    ctx.fillText(title.text, (width * title.xPercent) / 100, unit * title.yPercent);

    roundedRect(ctx, rowX, rowY, rowWidth, rowHeight, unit * 5);
    ctx.fillStyle = pressed === 'reset' ? '#e87917' : '#ff9428';
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(frame, 8.5);
    ctx.fillText('RESET', rowX + unit * 7.5, rowY + rowHeight / 2);
    ctx.restore();

    hit.add('reset', rowX, rowY, rowWidth, rowHeight);
  }

  press(target: string, nav: ViewNav): void {
    if (target === 'reset') nav.reset();
  }

  key(key: string, nav: ViewNav): boolean {
    if (key !== 'enter') return false;
    this.press('reset', nav);
    return true;
  }
}
