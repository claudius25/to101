import { ScreenView, ViewFrame, ViewNav } from './view';
import {
  FINANCE_LEVELS,
  FITNESS_LEVELS,
  GENESIS_BOY_NAMES,
  Hero,
  PERSONALITY_TYPES,
  SOCIAL_SKILL_LEVELS,
  LUCK_LEVELS,
} from '../hero';
import { createGenesisGrid, GenesisGridRuntime } from './genesis-grid-runtime';
import { DiceInterval, DiceRoll } from '../../../services/dice.service';
import { HeroSummary } from '../hero-summary';
import { roundedRect, wrap } from './ui';
import { StepperDots } from './components/stepper-dots';

/** Dimensions in design pixels. Columns spread out when more width is available. */
export const GENESIS_GRID_STYLE = {
  /** Minimum 11 rows to keep all six traits with a blank row between them. */
  rows: 10,
  fontSize: 28,
  columnSpacing: 2,
  rowSpacing: 26,
  sidePadding: 20,
  nextTraitDelayMs: 200,
};

export const GENESIS_PAGE_TRANSITION = {
  durationMs: 360,
};

export class ChapterGenesis implements ScreenView {
  readonly id = 'chapter-genesis' as const;
  readonly animated = true;
  readonly briefing = {
    text: "You don't choose where you start. You choose what you do next.",
    fontSize: 15,
    character: 'assets/e-ink/birth.png',
  };
  private runtime: GenesisGridRuntime | null = null;
  private showingSummary = false;
  private pagePosition = 0;
  private transitionFrom = 0;
  private transitionElapsedMs = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly summary: HeroSummary;
  private readonly stepper = new StepperDots(2);

  constructor(private readonly hero: Hero) {
    this.summary = new HeroSummary(hero);
  }

  get summaryAvailable(): boolean {
    return this.summary.ready && this.runtime?.settled === true;
  }

  get completed(): boolean {
    return this.summaryAvailable;
  }

  key(key: string, nav?: ViewNav): boolean {
    if (key === 'enter' && nav && this.canContinue) {
      nav.nextAgeActivities();
      return true;
    }
    if (this.showingSummary && key === 'close') {
      this.selectPage(false);
      return true;
    }
    if (this.summaryAvailable && this.stepper.active && (key === 'left' || key === 'right')) {
      this.selectPage(key === 'right');
      return true;
    }
    return false;
  }

  update(deltaMs: number): void {
    this.stepper.update(deltaMs, this.summaryAvailable);
    const target = this.showingSummary ? 1 : 0;
    if (this.pagePosition === target) return;
    this.transitionElapsedMs += deltaMs;
    const progress = Math.min(1, this.transitionElapsedMs / GENESIS_PAGE_TRANSITION.durationMs);
    const eased = 1 - (1 - progress) ** 3;
    this.pagePosition = this.transitionFrom + (target - this.transitionFrom) * eased;
  }

  press(target: string, nav?: ViewNav): void {
    if (!this.summaryAvailable) return;
    if (target === 'genesis:continue' && nav && this.canContinue) {
      nav.nextAgeActivities();
      return;
    }
    const page = this.stepper.pageForTarget(target);
    if (page !== null) this.selectPage(page === 1);
  }

  private get canContinue(): boolean {
    return this.completed && this.showingSummary && this.pagePosition === 1;
  }

  private selectPage(summary: boolean): void {
    if (this.showingSummary === summary) return;
    this.transitionFrom = this.pagePosition;
    this.transitionElapsedMs = 0;
    this.showingSummary = summary;
    if (this.reducedMotion || GENESIS_PAGE_TRANSITION.durationMs <= 0) {
      this.pagePosition = summary ? 1 : 0;
    }
  }

  enter(): void {
    if (!document.querySelector('link[data-genesis-font]')) {
      const link = document.createElement('link');
      link.dataset['genesisFont'] = '';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap';
      document.head.appendChild(link);
    }
    this.runtime ??= createGenesisGrid(
      GENESIS_GRID_STYLE,
      this.hero.name,
      this.hero.blueprint.fitness,
      this.hero.blueprint.finance,
      PERSONALITY_TYPES.find((type) => type.trait === this.hero.blueprint.personality)?.label ??
        null,
      this.hero.blueprint.socialSkill,
      this.hero.blueprint.luck,
    );
  }

  get diceInterval(): DiceInterval | undefined {
    return this.hero.name ? { min: 1, max: FITNESS_LEVELS.length } : undefined;
  }

  get diceReady(): boolean {
    return this.hero.blueprint.luck === null &&
      this.runtime?.settled === true && !this.showingSummary && this.pagePosition === 0;
  }

  diceRolled(roll: DiceRoll): void {
    if (!this.runtime || this.showingSummary || this.pagePosition !== 0 ||
      this.hero.blueprint.luck !== null) return;
    if (this.hero.blueprint.socialSkill) {
      const level = LUCK_LEVELS[roll.total - 1];
      if (!level) return;
      this.hero.blueprint.luck = level;
      this.runtime.revealLuck(level);
      return;
    }
    if (this.hero.blueprint.personality) {
      const level = SOCIAL_SKILL_LEVELS[roll.total - 1];
      if (!level) return;
      this.hero.blueprint.socialSkill = level;
      this.runtime.revealSocial(level);
      return;
    }
    if (this.hero.blueprint.finance) {
      const type = PERSONALITY_TYPES[roll.total - 1];
      if (!type) return;
      this.hero.blueprint.personality = type.trait;
      this.runtime.revealType(type.label);
      return;
    }
    if (this.hero.blueprint.fitness) {
      const level = FINANCE_LEVELS[roll.total - 1];
      if (!level) return;
      this.hero.blueprint.finance = level;
      this.runtime.revealFinance(level);
      return;
    }
    if (this.hero.name) {
      const level = FITNESS_LEVELS[roll.total - 1];
      if (!level) return;
      this.hero.blueprint.fitness = level;
      this.runtime.revealFitness(this.hero.blueprint.fitness);
      return;
    }
    const names = GENESIS_BOY_NAMES.filter((name) => name !== this.hero.name);
    this.hero.name = names[Math.floor(Math.random() * names.length)];
    this.runtime.revealName(this.hero.name);
  }

  paint(frame: ViewFrame): void {
    const { ctx, width, height } = frame;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    if (width <= 0 || height <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    if (this.pagePosition < 1) {
      ctx.save();
      ctx.translate(-this.pagePosition * width, 0);
      this.paintMatrix(frame);
      ctx.restore();
    }
    if (this.pagePosition > 0) {
      ctx.save();
      ctx.translate((1 - this.pagePosition) * width, 0);
      this.paintSummary(frame);
      ctx.restore();
    }
    ctx.restore();
    if (this.summaryAvailable) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, height * 0.92, width, height * 0.08);
      this.stepper.paint(frame, this.showingSummary ? 1 : 0);
      if (this.canContinue) this.paintContinue(frame);
    }
  }

  private paintContinue({ ctx, width, height, hit, pressed }: ViewFrame): void {
    const size = Math.min(height * 0.065, width * 0.1);
    const x = width * 0.94 - size;
    const y = height * 0.95 - size / 2;
    ctx.save();
    roundedRect(ctx, x, y, size, size, size * 0.18);
    ctx.fillStyle = pressed === 'genesis:continue' ? '#ffd2a9' : '#f6a45d';
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
    hit.add('genesis:continue', x - size * 0.15, y - size * 0.15, size * 1.3, size * 1.3);
  }

  private paintMatrix({ ctx, width, height }: ViewFrame): void {
    const runtime = this.runtime;
    if (!runtime || width <= 0 || height <= 0) return;
    const contentHeight = height * 0.9;
    const scale = Math.min(width / runtime.minWidth, contentHeight / runtime.height);
    const layoutWidth = width / scale;
    const gridHeight = runtime.height * scale;
    runtime.resize(layoutWidth);
    ctx.drawImage(runtime.canvas, 0, (contentHeight - gridHeight) / 2, width, gridHeight);
  }

  private paintSummary({ ctx, width, height }: ViewFrame): void {
    const padding = width * 0.08;
    const textSize = Math.min(height * 0.045, width * 0.045);
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${textSize * 1.5}px "Segoe UI", sans-serif`;
    ctx.fillText(this.hero.name, padding, height * 0.085, width - padding * 2);
    ctx.fillStyle = '#aaa';
    ctx.font = `500 ${textSize}px "Segoe UI", sans-serif`;
    ctx.fillText('Your blueprint', padding, height * 0.15);

    this.summary.entries.forEach((entry, index) => {
      const top = height * (0.23 + index * 0.12);
      ctx.fillStyle = '#f6a45d';
      ctx.font = `700 ${textSize}px "Segoe UI", sans-serif`;
      ctx.fillText(`${entry.label} · ${entry.value}`, padding, top, width - padding * 2);
      ctx.fillStyle = '#eee';
      ctx.font = `400 ${textSize}px "Segoe UI", sans-serif`;
      wrap(ctx, entry.description, width - padding * 2).forEach((line, row) => {
        ctx.fillText(line, padding, top + textSize * 1.4 + row * textSize * 1.25);
      });
    });

    ctx.restore();
  }

  dispose(): void {
    this.runtime?.dispose();
    this.runtime = null;
  }
}
