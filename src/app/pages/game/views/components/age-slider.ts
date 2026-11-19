import { roundedRect } from '../ui';
import { ViewFrame } from '../view';

/** Sizes and offsets use percentages of the glass screen height. */
export const AGE_SLIDER_STYLE = {
  sidePadding: 30,
  markerY: 10,
  markerDiameter: 4.2,
  markerColor: '#808080',
  unavailableMarkerColor: '#808080',
  activeMarkerColor: '#f6a45d',
  hitHeight: 22,
  durationMs: 300,
  edgeDelay: 0.3,
};

export interface AgeSliderStop {
  age: number;
  enabled: boolean;
}

export class AgeSlider {
  private elapsedMs = Infinity;
  private fromLeft = 0;
  private fromRight = 0;
  private selectedIndex: number;
  private movingRight = true;

  constructor(
    private readonly stops: readonly AgeSliderStop[],
    selectedAge: number,
    private readonly style = AGE_SLIDER_STYLE,
  ) {
    this.selectedIndex = this.stops.findIndex((stop) => stop.age === selectedAge);
  }

  get animated(): boolean {
    return this.elapsedMs <= this.style.durationMs;
  }

  select(age: number): boolean {
    const nextIndex = this.stops.findIndex((stop) => stop.age === age && stop.enabled);
    if (nextIndex < 0 || nextIndex === this.selectedIndex) return false;

    [this.fromLeft, this.fromRight] = this.markerEdges();
    this.movingRight = nextIndex > this.selectedIndex;
    this.elapsedMs = this.selectedIndex < 0 || this.style.durationMs <= 0 ? Infinity : 0;
    this.selectedIndex = nextIndex;
    return true;
  }

  update(deltaMs: number): void {
    if (!this.animated) return;
    // Keep the settled position eligible for one last continuous repaint.
    this.elapsedMs =
      this.elapsedMs === this.style.durationMs
        ? Infinity
        : Math.min(this.elapsedMs + deltaMs, this.style.durationMs);
  }

  paint(frame: ViewFrame): void {
    if (!this.stops.length) return;

    const { ctx, width, unit, hit } = frame;
    const style = this.style;
    const radius = (unit * style.markerDiameter) / 2;
    const inset = unit * style.sidePadding + radius;
    const spacing = Math.max(0, width - 2 * inset) / Math.max(1, this.stops.length - 1);
    const start = this.stops.length === 1 ? width / 2 : inset;
    const markerY = unit * style.markerY;

    ctx.save();
    this.stops.forEach(({ age, enabled }, index) => {
      const x = start + index * spacing;
      ctx.fillStyle = enabled ? style.markerColor : style.unavailableMarkerColor;
      ctx.beginPath();
      ctx.arc(x, markerY, radius, 0, Math.PI * 2);
      ctx.fill();

      if (enabled) {
        const left = index === 0 ? 0 : x - spacing / 2;
        const right = index === this.stops.length - 1 ? width : x + spacing / 2;
        hit.add(`age:${age}`, left, 0, right - left, unit * style.hitHeight);
      }
    });

    if (this.selectedIndex >= 0) {
      const [left, right] = this.markerEdges();
      ctx.fillStyle = style.activeMarkerColor;
      roundedRect(
        ctx,
        start + left * spacing - radius,
        markerY - radius,
        (right - left) * spacing + radius * 2,
        radius * 2,
        radius,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  private markerEdges(): [number, number] {
    if (!this.animated) return [this.selectedIndex, this.selectedIndex];

    const progress = this.elapsedMs / this.style.durationMs;
    const delay = Math.max(0, Math.min(0.95, this.style.edgeDelay));
    const leading = easeOut(progress / (1 - delay));
    const trailing = easeOut((progress - delay) / (1 - delay));
    const left =
      this.fromLeft +
      (this.selectedIndex - this.fromLeft) * (this.movingRight ? trailing : leading);
    const right =
      this.fromRight +
      (this.selectedIndex - this.fromRight) * (this.movingRight ? leading : trailing);
    return [Math.min(left, right), Math.max(left, right)];
  }
}

function easeOut(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return 1 - (1 - t) ** 3;
}
