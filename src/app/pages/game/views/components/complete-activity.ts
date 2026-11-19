import { roundedRect } from '../ui';
import { ViewFrame } from '../view';

export const COMPLETE_ACTIVITY_TARGET = 'activity:complete';

/** Shared bottom-right Enter key for completed activities. */
export function paintCompleteActivity({ ctx, width, height, hit, pressed }: ViewFrame): void {
  const size = Math.min(height * 0.065, width * 0.1);
  const x = width * 0.94 - size;
  const y = height * 0.95 - size / 2;
  ctx.save();
  roundedRect(ctx, x, y, size, size, size * 0.18);
  ctx.fillStyle = pressed === COMPLETE_ACTIVITY_TARGET ? '#ffd2a9' : '#f6a45d';
  ctx.fill();
  ctx.strokeStyle = '#101419';
  ctx.lineWidth = size * 0.07;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.72, y + size * 0.28);
  ctx.lineTo(x + size * 0.72, y + size * 0.58);
  ctx.lineTo(x + size * 0.25, y + size * 0.58);
  ctx.moveTo(x + size * 0.43, y + size * 0.4);
  ctx.lineTo(x + size * 0.25, y + size * 0.58);
  ctx.lineTo(x + size * 0.43, y + size * 0.76);
  ctx.stroke();
  ctx.restore();
  hit.add(COMPLETE_ACTIVITY_TARGET, x - size * 0.15, y - size * 0.15, size * 1.3, size * 1.3);
}
