import { ViewFrame } from './view';

/**
 * Shared drawing kit for the glass screen, so every view ends up with the same
 * typography, spacing and button behaviour. Everything is measured in canvas pixels;
 * use `frame.unit` (one hundredth of the canvas height) to stay resolution independent.
 */

export const PALETTE = {
  ink: '#e9eeff',
  dim: 'rgba(233, 238, 255, 0.62)',
  faint: 'rgba(233, 238, 255, 0.32)',
  accent: '#ff8a3d',
  danger: '#ff5f6d',
  line: 'rgba(255, 255, 255, 0.14)',
  fill: 'rgba(255, 255, 255, 0.07)',
  panelTop: '#13172a',
  panelBottom: '#05070f',
  sheet: '#161b31',
};

export function font(frame: ViewFrame, size: number, weight = 500): string {
  return `${weight} ${(frame.unit * size).toFixed(1)}px "Segoe UI", system-ui, sans-serif`;
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Backlit panel with a hairline bezel. Every full-screen view starts with this. */
export function background(frame: ViewFrame): void {
  const { ctx, width, height, unit } = frame;

  const glow = ctx.createLinearGradient(0, 0, 0, height);
  glow.addColorStop(0, PALETTE.panelTop);
  glow.addColorStop(1, PALETTE.panelBottom);
  ctx.fillStyle = glow;
  roundedRect(ctx, 0, 0, width, height, unit * 6);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 138, 61, 0.4)';
  ctx.lineWidth = unit * 1.2;
  roundedRect(ctx, unit * 3, unit * 3, width - unit * 6, height - unit * 6, unit * 5);
  ctx.stroke();
}

/**
 * Title bar: the view's own label on the left, and the live/frozen dev tag on the
 * right so it is always obvious whether the canvas or its snapshot is on screen.
 */
export function header(frame: ViewFrame, label: string): void {
  const { ctx, width, unit, frozen } = frame;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.accent;
  ctx.font = font(frame, 7, 600);
  ctx.fillText(label.toUpperCase(), unit * 9, unit * 13);

  ctx.textAlign = 'right';
  ctx.fillStyle = frozen ? PALETTE.danger : PALETTE.faint;
  ctx.fillText(frozen ? 'FROZEN' : 'LIVE', width - unit * 9, unit * 13);
}

export function title(frame: ViewFrame, text: string, y: number): void {
  const { ctx, unit } = frame;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = font(frame, 15, 700);
  ctx.fillText(text, unit * 9, y);
}

/** Greedy word wrap to `maxWidth`, measured with the context's current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      out.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    out.push(current);
  }
  return out;
}

/** A block of dev copy, wrapped to the screen width. Returns the y it finished on. */
export function lines(
  frame: ViewFrame,
  items: string[],
  y: number,
  size = 7,
  leading = 10.5,
): number {
  const { ctx, width, unit } = frame;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.dim;
  ctx.font = font(frame, size);

  const maxWidth = width - unit * 18;
  let cursor = y;
  for (const item of items) {
    for (const line of wrap(ctx, item, maxWidth)) {
      ctx.fillText(line, unit * 9, cursor);
      cursor += unit * leading;
    }
  }
  return cursor;
}

export interface ButtonSpec {
  /** Id reported to `ScreenView.press`. */
  target: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** `accent` is the primary action; `ghost` is a quiet one. */
  tone?: 'accent' | 'ghost';
}

/** Draws a button and registers its hotspot in one go. */
export function button(frame: ViewFrame, spec: ButtonSpec): void {
  const { ctx, unit, pressed } = frame;
  const { target, label, x, y, width, height, tone = 'accent' } = spec;
  const down = pressed === target;
  const radius = Math.min(height / 2, unit * 6);

  ctx.save();
  if (down) {
    // Shrink a touch so a press reads even without any transition.
    const inset = unit * 0.8;
    ctx.translate(x + width / 2, y + height / 2);
    ctx.scale((width - inset * 2) / width, (height - inset * 2) / height);
    ctx.translate(-(x + width / 2), -(y + height / 2));
  }

  roundedRect(ctx, x, y, width, height, radius);
  if (tone === 'accent') {
    ctx.fillStyle = down ? '#ffa566' : PALETTE.accent;
    ctx.fill();
  } else {
    ctx.fillStyle = down ? 'rgba(255, 255, 255, 0.16)' : PALETTE.fill;
    ctx.fill();
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = unit * 0.9;
    ctx.stroke();
  }

  ctx.fillStyle = tone === 'accent' ? '#1a0f06' : PALETTE.ink;
  ctx.font = font(frame, 8.5, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + width / 2, y + height / 2);
  ctx.restore();

  frame.hit.add(target, x, y, width, height);
}

export interface ToggleSpec {
  target: string;
  label: string;
  value: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Highlighted because the keypad's up/down landed on it. */
  focused?: boolean;
}

/** Settings row: label on the left, pill switch on the right. */
export function toggle(frame: ViewFrame, spec: ToggleSpec): void {
  const { ctx, unit, pressed } = frame;
  const { target, label, value, x, y, width, height, focused } = spec;
  const down = pressed === target;

  roundedRect(ctx, x, y, width, height, unit * 3);
  ctx.fillStyle = down ? 'rgba(255, 255, 255, 0.14)' : PALETTE.fill;
  ctx.fill();
  if (focused) {
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = unit;
    ctx.stroke();
  }

  ctx.fillStyle = PALETTE.ink;
  ctx.font = font(frame, 8);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + unit * 4, y + height / 2);

  const pillWidth = unit * 16;
  const pillHeight = height - unit * 4;
  const pillX = x + width - pillWidth - unit * 4;
  const pillY = y + unit * 2;

  roundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fillStyle = value ? PALETTE.accent : 'rgba(255, 255, 255, 0.16)';
  ctx.fill();

  const knob = pillHeight - unit * 1.6;
  ctx.beginPath();
  ctx.arc(
    value ? pillX + pillWidth - knob / 2 - unit * 0.8 : pillX + knob / 2 + unit * 0.8,
    pillY + pillHeight / 2,
    knob / 2,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = value ? '#1a0f06' : PALETTE.dim;
  ctx.fill();

  frame.hit.add(target, x, y, width, height);
}

/** Dims whatever is underneath, so a pushed view reads as a sheet on top. */
export function scrim(frame: ViewFrame): void {
  const { ctx, width, height, unit } = frame;
  roundedRect(ctx, 0, 0, width, height, unit * 6);
  ctx.fillStyle = 'rgba(3, 5, 12, 0.72)';
  ctx.fill();
}
