import { ViewFrame } from '../view';

/** Sizes and positions use percentages of the screen height. */
export const STEPPER_DOTS_STYLE = {
  diameter: 2.5,
  gap: 3,
  yPercent: 95,
  activeColor: '#f6a45d',
  inactiveColor: '#656565',
  hitSize: 10,
  fadeInMs: 400,
};

export class StepperDots {
  private opacity = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(
    private readonly count: number,
    private readonly style = STEPPER_DOTS_STYLE,
  ) {}

  get active(): boolean {
    return this.opacity > 0;
  }

  update(deltaMs: number, visible: boolean): void {
    if (!visible) {
      this.opacity = 0;
      return;
    }
    this.opacity = this.reducedMotion || this.style.fadeInMs <= 0
      ? 1
      : Math.min(1, this.opacity + deltaMs / this.style.fadeInMs);
  }

  pageForTarget(target: string): number | null {
    if (!this.active || !target.startsWith('stepper:')) return null;
    const index = Number(target.slice('stepper:'.length));
    return Number.isInteger(index) && index >= 0 && index < this.count ? index : null;
  }

  paint({ ctx, width, height, hit }: ViewFrame, selected: number): void {
    if (!this.active) return;
    const unit = height / 100;
    const radius = unit * this.style.diameter / 2;
    const spacing = unit * (this.style.diameter + this.style.gap);
    const start = (width - (this.count - 1) * spacing) / 2;
    const y = unit * this.style.yPercent;
    const hitSize = Math.min(unit * this.style.hitSize, spacing);
    ctx.save();
    ctx.globalAlpha = this.opacity;
    for (let index = 0; index < this.count; index++) {
      const x = start + index * spacing;
      ctx.fillStyle = index === selected ? this.style.activeColor : this.style.inactiveColor;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      hit.add(`stepper:${index}`, x - hitSize / 2, y - unit * this.style.hitSize / 2,
        hitSize, unit * this.style.hitSize);
    }
    ctx.restore();
  }
}
