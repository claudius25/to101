import { ScreenView, ViewFrame, ViewNav } from './view';
import { button, font, roundedRect, scrim, toggle, PALETTE } from './ui';

interface Option {
  id: string;
  label: string;
  value: boolean;
}

/**
 * Settings sheet. Pushed on top of whatever chapter is running — the settings key on
 * the keypad opens and closes it, and the X key or the Done button backs out.
 */
export class SettingsView implements ScreenView {
  readonly id = 'settings' as const;

  private readonly options: Option[] = [
    { id: 'sound', label: 'Sound', value: true },
    { id: 'haptics', label: 'Haptics', value: true },
    { id: 'hints', label: 'Hints', value: false },
  ];
  private focus = 0;

  paint(frame: ViewFrame): void {
    const { ctx, width, unit } = frame;
    const sheetX = unit * 7;
    const sheetY = unit * 8;
    const sheetWidth = width - sheetX * 2;
    const sheetHeight = unit * 88;
    const rowX = sheetX + unit * 6;
    const rowWidth = sheetWidth - unit * 12;

    scrim(frame);

    roundedRect(ctx, sheetX, sheetY, sheetWidth, sheetHeight, unit * 5);
    ctx.fillStyle = PALETTE.sheet;
    ctx.fill();
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = unit;
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = font(frame, 11, 700);
    ctx.fillText('Settings', rowX, unit * 20);

    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.faint;
    ctx.font = font(frame, 6.5);
    ctx.fillText('⚙ or X closes', sheetX + sheetWidth - unit * 6, unit * 20);

    this.options.forEach((option, index) => {
      toggle(frame, {
        target: `option:${option.id}`,
        label: option.label,
        value: option.value,
        x: rowX,
        y: unit * (30 + index * 17),
        width: rowWidth,
        height: unit * 14,
        focused: index === this.focus,
      });
    });

    button(frame, {
      target: 'done',
      label: 'Done',
      x: rowX,
      y: unit * 79,
      width: rowWidth,
      height: unit * 13,
    });
  }

  press(target: string, nav: ViewNav): void {
    if (target === 'done') {
      nav.back();
      return;
    }

    const id = target.startsWith('option:') ? target.slice('option:'.length) : null;
    const index = this.options.findIndex((option) => option.id === id);
    if (index >= 0) {
      this.focus = index;
      this.options[index].value = !this.options[index].value;
    }
  }

  key(key: string): boolean {
    switch (key) {
      case 'up':
        this.focus = (this.focus + this.options.length - 1) % this.options.length;
        return true;
      case 'down':
        this.focus = (this.focus + 1) % this.options.length;
        return true;
      case 'enter':
        this.options[this.focus].value = !this.options[this.focus].value;
        return true;
      default:
        return false;
    }
  }
}
