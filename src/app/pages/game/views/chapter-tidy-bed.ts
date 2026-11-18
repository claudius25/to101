import { ScreenView, ViewFrame, ViewPointer } from './view';
import { QuickInstruction } from './components/quick-instruction';
import { TIDY_BED_CONFIG, TidyBedConfig, TidyBedTuning, Range } from './tidy-bed.config';

const LANES = 3;
/** Where a spider starts, as a fraction of the screen height above the top edge. */
const SPIDER_START = -0.08;
/** Spider artwork width, as a fraction of the screen width. */
const SPIDER_WIDTH = 0.088;
/** The artwork is drawn in this box and scaled; keep in step with `drawSpider`. */
const SPIDER_ART = { width: 46, height: 43 };

interface Spider {
  lane: number;
  /** Seconds since it started falling. */
  age: number;
  /** Seconds it takes to reach the zone. */
  fall: number;
  /** True once it has arrived, so a lane is only ever scored once. */
  crossed: boolean;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function between(range: Range): number {
  return range.min + Math.random() * (range.max - range.min);
}

/** Fills the screen with the photo, cropping the overflow, like `object-fit: cover`. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

/**
 * The messy bedroom, and the tidy one hiding behind it.
 *
 * Three touch points travel with the before/after divider. Hold them to reveal the
 * tidy room, and lift a finger before a spider reaches its point.
 */
export class ChapterTidyBed implements ScreenView {
  readonly id = 'chapter-tidy-bed' as const;
  readonly briefing = TIDY_BED_CONFIG.briefing;

  private readonly spiders: Spider[] = [];
  /** Pointer id to lane. -1 means the finger is down but outside every zone. */
  private readonly touches = new Map<number, number>();
  private readonly keyLanes = new Set<number>();
  private readonly pointHitMs = [0, 0, 0];

  private progress: number;
  private readonly instruction: QuickInstruction;
  private started = false;
  private finished = false;
  get completed(): boolean {
    return this.finished;
  }
  private spawnIn = 0;
  private hitMs = 0;

  private before: HTMLImageElement | null = null;
  private after: HTMLImageElement | null = null;
  /** Guards against a slow load from an earlier round painting over a newer one. */
  private round = 0;

  // Last painted canvas size, so pointer coordinates can be mapped to lanes.
  private width = 0;
  private height = 0;

  constructor(private readonly config: TidyBedConfig = TIDY_BED_CONFIG) {
    this.progress = config.startProgress;
    this.instruction = new QuickInstruction(config.quickInstruction);
  }

  /** Idle once the room is revealed: nothing moves, so the surface can slow down. */
  get animated(): boolean {
    return !this.finished || this.hitMs > 0;
  }

  private get tuning(): TidyBedTuning {
    return this.config.tuning[this.config.difficulty];
  }

  enter(): void {
    this.reset();
    this.loadRoom();
  }

  exit(): void {
    this.releaseAll();
  }

  /** Rotated away, blocked, or covered by a sheet: every finger counts as lifted. */
  suspend(): void {
    this.releaseAll();
  }

  key(key: string): boolean {
    const lane = this.config.laneKeys.indexOf(key);
    if (lane < 0) return false;
    if (!this.finished) {
      this.instruction.dismiss();
      this.keyLanes.add(lane);
    }
    return true;
  }

  keyUp(key: string): void {
    this.keyLanes.delete(this.config.laneKeys.indexOf(key));
  }

  update(deltaMs: number): void {
    // Clamped so a stalled frame cannot teleport the reveal or a spider.
    const dt = Math.min(deltaMs / 1000, 0.06);
    const tuning = this.tuning;

    if (this.hitMs > 0) {
      this.hitMs = Math.max(0, this.hitMs - deltaMs);
    }

    for (let lane = 0; lane < LANES; lane++) {
      this.pointHitMs[lane] = Math.max(0, this.pointHitMs[lane] - deltaMs);
    }

    if (this.finished) {
      return;
    }

    const held = this.heldLanes();
    if (held.size > 0) {
      this.instruction.dismiss();
      this.started = true;
      this.progress = Math.min(1, this.progress + dt * tuning.revealRates[held.size - 1]);
    } else {
      this.progress = Math.max(this.config.startProgress, this.progress - dt * tuning.rollbackRate);
    }

    if (this.progress >= 1) {
      this.finish();
      return;
    }

    if (!this.started) {
      return;
    }

    if (held.size === 0 && this.progress === this.config.startProgress) {
      // Rolled all the way back: the board resets and the spiders go away.
      this.spiders.length = 0;
      this.started = false;
      this.spawnIn = tuning.firstSpawnSeconds;
      return;
    }

    this.updateSpiders(dt, held);
  }

  pointer(event: ViewPointer): boolean {
    if (this.instruction.pointer(event)) return true;
    if (this.finished) {
      this.touches.clear();
      return true;
    }
    if (event.phase === 'down') {
      const lane = this.laneAt(event.x, event.y);
      if (lane >= 0) this.instruction.dismiss();
      this.touches.set(event.id, lane);
    } else if (event.phase === 'move') {
      if (this.touches.has(event.id)) {
        this.touches.set(event.id, this.laneAt(event.x, event.y));
      }
    } else {
      this.touches.delete(event.id);
    }

    // The playfield owns the whole screen, so nothing else should see these.
    return true;
  }

  paint(frame: ViewFrame): void {
    const { ctx, width, height } = frame;
    this.width = width;
    this.height = height;


    // Square corners: the photo runs edge to edge, unlike the other views.
    ctx.save();

    ctx.fillStyle = '#efbd9f';
    ctx.fillRect(0, 0, width, height);

    if (this.before) {
      drawCover(ctx, this.before, width, height);
    }

    ctx.save();
    ctx.globalAlpha = this.config.beforeTint.opacity;
    ctx.fillStyle = this.config.beforeTint.color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (this.after && this.progress > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height * this.progress);
      ctx.clip();
      drawCover(ctx, this.after, width, height);
      ctx.restore();
    }

    if (!this.finished) {
      if (this.progress > 0) {
        this.paintSeam(frame);
      }
      this.paintSpiders(frame);
    }

    if (this.hitMs > 0) {
      const { opacity, durationMs } = this.config.hit;
      ctx.fillStyle = `rgba(239, 39, 69, ${(opacity * this.hitMs) / durationMs})`;
      ctx.fillRect(0, 0, width, height);
    }

    if (!this.finished) this.paintPoints(frame);
    this.instruction.paint(frame);
    ctx.restore();
  }

  private reset(): void {
    this.instruction.reset();
    this.spiders.length = 0;
    this.releaseAll();
    this.progress = this.config.startProgress;
    this.pointHitMs.fill(0);
    this.started = false;
    this.finished = false;
    this.hitMs = 0;
    this.spawnIn = this.tuning.firstSpawnSeconds;
  }

  private releaseAll(): void {
    this.touches.clear();
    this.keyLanes.clear();
  }

  private finish(): void {
    this.finished = true;
    this.progress = 1;
    this.spiders.length = 0;
    this.releaseAll();
  }

  /** Loads a random before/after pair, so a replay is a different room. */
  private loadRoom(): void {
    const set = pick(this.config.sets);
    const round = ++this.round;

    this.before = null;
    this.after = null;

    const load = (file: string, assign: (image: HTMLImageElement) => void): void => {
      const image = new Image();
      image.onload = () => {
        if (this.round === round) {
          assign(image);
        }
      };
      image.src = `assets/tidy-bed/${set}/${file}`;
    };

    load(this.config.beforeFile, (image) => (this.before = image));
    load(this.config.afterFile, (image) => (this.after = image));
  }

  private heldLanes(): Set<number> {
    const held = new Set<number>(this.keyLanes);
    for (const lane of this.touches.values()) {
      if (lane >= 0) {
        held.add(lane);
      }
    }
    return held;
  }

  /** Small visible dots have larger, circular touch targets. */
  private laneAt(x: number, y: number): number {
    if (!this.width || !this.height) return -1;
    const radius = this.height * this.config.points.touchRadius;
    for (let lane = 0; lane < LANES; lane++) {
      const cx = (lane + 0.5) * this.width / LANES;
      if (Math.hypot(x - cx, y - this.height * this.progress) <= radius) return lane;
    }
    return -1;
  }

  private updateSpiders(dt: number, held: Set<number>): void {
    const tuning = this.tuning;
    this.spawnIn -= dt;

    if (this.spawnIn <= 0 && this.spiders.length < LANES) {
      // One spider per lane at most, but all three lanes can be busy at once.
      const free = [0, 1, 2].filter((lane) => !this.spiders.some((s) => s.lane === lane));
      const threatened = free.filter((lane) => held.has(lane));
      const choices = threatened.length > 0 ? threatened : free;
      if (choices.length > 0) {
        this.spiders.push({
          lane: pick(choices),
          age: 0,
          fall: between(tuning.fallSeconds),
          crossed: false,
        });
      }
      this.spawnIn = between(tuning.spawnSeconds);
    }

    for (let index = this.spiders.length - 1; index >= 0; index--) {
      const spider = this.spiders[index];
      spider.age += dt;

      if (!spider.crossed && this.spiderProgress(spider) >= this.progress) {
        spider.crossed = true;
        if (held.has(spider.lane)) {
          this.pointHitMs[spider.lane] = this.config.hit.durationMs;
          this.hitMs = this.config.hit.durationMs;
        }
      }

      if (spider.age > spider.fall * tuning.lingerFactor) {
        this.spiders.splice(index, 1);
      }
    }
  }

  private paintSeam(frame: ViewFrame): void {
    const { ctx, width, height, unit } = frame;
    const y = height * this.progress;
    const thickness = Math.max(2, unit * 0.7);

    ctx.save();
    ctx.fillStyle = '#f8f0ff';
    ctx.shadowColor = 'rgba(49, 33, 60, 0.56)';
    ctx.shadowBlur = unit * 1.6;
    ctx.shadowOffsetY = unit * 0.2;
    ctx.fillRect(0, y - thickness / 2, width, thickness);
    ctx.restore();

    ctx.save();
    ctx.font = `600 ${unit * 3.2}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#21182e';
    ctx.shadowBlur = unit;
    ctx.fillText('After', unit * 2, y - unit * 3.2);
    ctx.fillText('Before', unit * 2, y + unit * 3.2);
    ctx.restore();
  }

  private spiderProgress(spider: Spider): number {
    return SPIDER_START + (1 - SPIDER_START) * spider.age / spider.fall;
  }

  private paintSpiders(frame: ViewFrame): void {
    const { ctx, width, height } = frame;
    const size = width * SPIDER_WIDTH;

    for (const spider of this.spiders) {
      const x = (spider.lane + 0.5) * (width / LANES);
      const y = height * this.spiderProgress(spider);

      // Silk, straight down from the top edge.
      ctx.fillStyle = 'rgba(56, 38, 59, 0.38)';
      ctx.fillRect(x - 0.5, 0, 1, Math.max(0, y));

      this.drawSpider(ctx, x, y, size, spider.age);
    }
  }

  /** Spider Sweep's spider, drawn in a 46x43 box and scaled onto the screen. */
  private drawSpider(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    age: number,
  ): void {
    const scale = size / SPIDER_ART.width;

    ctx.save();
    ctx.translate(x - (SPIDER_ART.width / 2) * scale, y - (SPIDER_ART.height / 2) * scale);
    ctx.scale(scale, scale);
    ctx.shadowColor = 'rgba(41, 25, 45, 0.4)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#291b32';

    for (const side of [-1, 1]) {
      for (let leg = 0; leg < 4; leg++) {
        const step = Math.sin(age * 19 + leg * 1.8 + side) * 2.6;
        ctx.beginPath();
        ctx.moveTo(23 + side * 4, 18 + leg * 2);
        ctx.lineTo(23 + side * 13, 8 + leg * 7);
        ctx.lineTo(23 + side * (19 - Math.abs(leg - 1.5)), 9 + leg * 8 + step);
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#291b32';
    ctx.beginPath();
    ctx.ellipse(23, 16, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(23, 26, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffb0a4';
    for (const eye of [20.7, 25.3]) {
      ctx.beginPath();
      ctx.arc(eye, 27, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private paintPoints(frame: ViewFrame): void {
    const { ctx, width, height } = frame;
    const held = this.heldLanes();
    const radius = height * this.config.points.radius;
    for (let lane = 0; lane < LANES; lane++) {
      const hit = this.pointHitMs[lane];
      const blink = held.has(lane) && hit > 0 && Math.floor((this.config.hit.durationMs - hit) / 90) % 2 === 0;
      ctx.fillStyle = blink ? '#ef2745' : held.has(lane) ? '#35d77d' : '#ffffff';
      ctx.strokeStyle = 'rgba(30, 24, 40, 0.5)';
      ctx.lineWidth = Math.max(1, height * 0.003);
      ctx.beginPath();
      ctx.arc((lane + 0.5) * width / LANES, height * this.progress, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
