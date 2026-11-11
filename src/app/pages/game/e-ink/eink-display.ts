import { ScreenPaintContext } from '../screens';
import { CURFEW_CONFIG, CurfewConfig } from './curfew.config';
import { Curfew } from './curfew';
import { Span, drawSpans, measureSpans, parseSpans } from './rich-text';

const INK = '#15150f';
const PAPER = '#e9e7df';
const FONT_FAMILY = '"Segoe UI", system-ui, sans-serif';
/** Widths scale linearly with the font size, so one measurement pass is enough. */
const MEASURE_SIZE = 100;
/** Alpha above which a pixel counts as part of the character art. */
const ALPHA_THRESHOLD = 16;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A message for the strip: a few rows of text beside an optional character. */
export interface EinkCard {
  /** One entry per line. Any number of rows; the card fits the type to them. */
  rows: string[];
  /** Art shown beside the text. Missing or broken files simply leave it out. */
  character?: string;
}

/** Tightest box around the non-transparent pixels, so padding in the art is ignored. */
function trimAlpha(image: HTMLImageElement): Rect {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const full: Rect = { x: 0, y: 0, width, height };
  if (width === 0 || height === 0) {
    return full;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return full;
  }

  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) {
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return full;
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function roundedRect(
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

function seconds(elapsedMs: number): string {
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

/**
 * Paints the e-ink strip.
 *
 * It shows, in order of priority: the curfew card while a window is in force, the card
 * the current glass view asked for, or a plain dev status readout. Cards are the rule's
 * rows beside a character, with the type fitted to however many rows there are.
 */
export class EinkDisplay {
  /** Fired once the character art is decoded, so the surface can repaint. */
  onReady: (() => void) | null = null;
  /** Message requested by the glass view, shown when no curfew window is in force. */
  card: EinkCard | null = null;

  private image: HTMLImageElement | null = null;
  private imageRect: Rect | null = null;
  private source = '';
  private failed = false;

  constructor(
    private readonly curfew: Curfew,
    private readonly config: CurfewConfig = CURFEW_CONFIG,
  ) {}

  paint(frame: ScreenPaintContext): void {
    const card = this.curfew.active() ?? this.card;
    this.paintPaper(frame);

    if (card) {
      this.paintCard(frame, card);
    } else {
      this.paintStatus(frame);
    }
  }

  private paintPaper(frame: ScreenPaintContext): void {
    const { ctx, width, height } = frame;
    const unit = height / 100;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PAPER;
    roundedRect(ctx, 0, 0, width, height, unit * 8);
    ctx.fill();

    ctx.strokeStyle = 'rgba(21, 21, 15, 0.55)';
    ctx.lineWidth = unit * 1.6;
    roundedRect(ctx, unit * 3, unit * 3, width - unit * 6, height - unit * 6, unit * 6);
    ctx.stroke();
  }

  private paintCard(frame: ScreenPaintContext, card: EinkCard): void {
    const { ctx, width, height } = frame;
    const unit = height / 100;
    const { padding, gap, characterWidth, lineHeight, maxFontUnits, minFontUnits } =
      this.config.layout;

    const boxX = unit * padding;
    const boxY = unit * padding;
    const boxWidth = width - unit * padding * 2;
    const boxHeight = height - unit * padding * 2;

    // A card with no art, or art that failed to load, gives the text the whole width.
    const source = card.character ?? this.config.character;
    const hasArt = this.prepare(source);
    const artWidth = hasArt ? boxWidth * characterWidth : 0;
    const textX = boxX + (hasArt ? artWidth + unit * gap : 0);
    const textWidth = boxWidth - (hasArt ? artWidth + unit * gap : 0);

    if (hasArt) {
      this.paintCharacter(frame, { x: boxX, y: boxY, width: artWidth, height: boxHeight });
    }

    const rows = card.rows.map(parseSpans);
    const style = (size: number) => ({
      font: (bold: boolean) => `${bold ? 700 : 500} ${size}px ${FONT_FAMILY}`,
      underlineWidth: Math.max(1, size * 0.07),
      underlineOffset: size * 0.42,
    });

    let widest = 1;
    for (const row of rows) {
      widest = Math.max(widest, measureSpans(ctx, row, style(MEASURE_SIZE)));
    }

    const byHeight = boxHeight / (rows.length * lineHeight);
    const byWidth = (textWidth / widest) * MEASURE_SIZE;
    const size = Math.max(unit * minFontUnits, Math.min(unit * maxFontUnits, byHeight, byWidth));

    const step = size * lineHeight;
    const top = boxY + Math.max(0, (boxHeight - step * rows.length) / 2);

    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    rows.forEach((row: Span[], index: number) => {
      drawSpans(ctx, row, textX, top + step * (index + 0.5), style(size));
    });
  }

  /** Starts the art loading if needed. False once we know there is nothing to draw. */
  private prepare(source: string): boolean {
    if (source !== this.source) {
      this.source = source;
      this.image = null;
      this.imageRect = null;
      this.failed = false;
      this.load(source);
    }

    return !this.failed;
  }

  /** Fits the art into `box`, bottom aligned, keeping its aspect ratio. */
  private paintCharacter(frame: ScreenPaintContext, box: Rect): void {
    const image = this.image;
    const rect = this.imageRect;
    if (!image || !rect) {
      return;
    }

    const scale = Math.min(box.width / rect.width, box.height / rect.height);
    const drawWidth = rect.width * scale;
    const drawHeight = rect.height * scale;

    frame.ctx.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      box.x + (box.width - drawWidth) / 2,
      box.y + box.height - drawHeight,
      drawWidth,
      drawHeight,
    );
  }

  private load(source: string): void {
    const image = new Image();
    image.onload = () => {
      // A later card may have swapped the art out while this one was decoding.
      if (this.source !== source) {
        return;
      }
      this.imageRect = trimAlpha(image);
      this.image = image;
      this.onReady?.();
    };
    image.onerror = () => {
      if (this.source !== source) {
        return;
      }
      this.failed = true;
      this.onReady?.();
    };
    image.src = source;
  }

  /** Dev readout for the hours when the device is free to play. */
  private paintStatus(frame: ScreenPaintContext): void {
    const { ctx, width, height, definition, info, elapsedMs, frozen } = frame;
    const unit = height / 100;

    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';

    ctx.font = `600 ${unit * 14}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.fillText(definition.label, unit * 8, unit * 18);

    ctx.textAlign = 'right';
    ctx.fillText(frozen ? 'FROZEN' : seconds(elapsedMs), width - unit * 8, unit * 18);

    ctx.textAlign = 'left';
    ctx.font = `700 ${unit * 32}px ${FONT_FAMILY}`;
    ctx.fillText(info.rolling ? 'ROLLING' : 'TO 101', unit * 8, height * 0.52);

    ctx.font = `500 ${unit * 14}px ${FONT_FAMILY}`;
    ctx.fillText(`KEY ${info.lastKey || '--'}`, unit * 8, height - unit * 16);

    ctx.textAlign = 'right';
    ctx.fillText(info.roll ? `DICE ${info.roll}` : 'DICE --', width - unit * 8, height - unit * 16);

    // A marching tick proves the canvas is live rather than a frozen texture.
    if (!frozen) {
      const span = width - unit * 16;
      const x = unit * 8 + ((elapsedMs / 12) % span);
      ctx.fillRect(x, height - unit * 7, unit * 6, unit * 2);
    }
  }
}
