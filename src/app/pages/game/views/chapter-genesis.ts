import { ScreenView, ViewFrame } from './view';
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
import { wrap } from './ui';
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

export const GENESIS_STORY_STYLE = {
  sidePaddingPercent: 9,
  topPercent: 6,
  bottomPercent: 12,
  fontSizePercent: 4,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  fontWeight: 500,
  lineHeight: 1.35,
  paragraphGap: 0.8,
};

export class ChapterGenesis implements ScreenView {
  readonly id = 'chapter-genesis' as const;
  readonly completionNavigation = 'next-age' as const;
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

  showSummary(): void {
    if (!this.summary.ready || !this.runtime) return;
    this.runtime.finishAnimations();
    this.showingSummary = true;
    this.pagePosition = 1;
    this.stepper.update(400, true);
  }

  key(key: string): boolean {
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

  press(target: string): void {
    if (!this.summaryAvailable) return;
    const page = this.stepper.pageForTarget(target);
    if (page !== null) this.selectPage(page === 1);
  }

  get canContinue(): boolean {
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
    return (
      this.hero.blueprint.luck === null &&
      this.runtime?.settled === true &&
      !this.showingSummary &&
      this.pagePosition === 0
    );
  }

  diceRolled(roll: DiceRoll): void {
    if (
      !this.runtime ||
      this.showingSummary ||
      this.pagePosition !== 0 ||
      this.hero.blueprint.luck !== null
    )
      return;
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
    }
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
    const style = GENESIS_STORY_STYLE;
    const padding = (width * style.sidePaddingPercent) / 100;
    const availableWidth = width - padding * 2;
    const top = (height * style.topPercent) / 100;
    const availableHeight = height * (1 - (style.topPercent + style.bottomPercent) / 100);
    const paragraphs = this.summary.paragraphs;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    let textSize = Math.min((height * style.fontSizePercent) / 100, width * 0.06);
    let lines: string[][] = [];
    let blockHeight = 0;
    do {
      ctx.font = `${style.fontWeight} ${textSize}px ${style.fontFamily}`;
      lines = paragraphs.map((paragraph) => wrap(ctx, paragraph, availableWidth));
      const lineCount = lines.reduce((total, paragraph) => total + paragraph.length, 0);
      blockHeight =
        textSize *
        (lineCount * style.lineHeight + Math.max(0, lines.length - 1) * style.paragraphGap);
      if (blockHeight <= availableHeight) break;
      textSize *= 0.95;
    } while (textSize > 1);
    let cursor = top + (availableHeight - blockHeight) / 2;
    for (const paragraph of lines) {
      for (const line of paragraph) {
        ctx.fillText(line, padding, cursor);
        cursor += textSize * style.lineHeight;
      }
      cursor += textSize * style.paragraphGap;
    }
    ctx.restore();
  }

  dispose(): void {
    this.runtime?.dispose();
    this.runtime = null;
  }
}
