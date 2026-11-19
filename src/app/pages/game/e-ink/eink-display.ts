import { ScreenPaintContext } from '../screens';
import { CURFEW_CONFIG, CurfewConfig } from './curfew.config';
import { Curfew } from './curfew';
import { Span, drawSpans, wrapSpans } from './rich-text';

const INK = '#15150f';
const PAPER = '#e9e7df';
const FONT_FAMILY = '"Segoe UI", system-ui, sans-serif';
/** Alpha above which a pixel counts as part of the character art. */
const ALPHA_THRESHOLD = 16;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Automatically laid out rich text beside an optional character. */
export interface EinkCard {
  /** Rich text: **bold**, *italic*, __underline__, and newline or <br /> breaks. */
  text: string;
  /** Preferred font size in units of 1% of the strip height; shrinks only to fit. */
  fontSize: number;
  /** Omit this for the default character, or set it to null for text only. */
  character?: string | null;
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

function seconds(elapsedMs: number): string {
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

/**
 * Paints the e-ink strip.
 *
 * It shows, in order of priority: the curfew card while a window is in force, the card
 * the current glass view asked for, or a plain dev status readout. Cards are the rule's
 * rich text beside a character, wrapped and fitted to the available space.
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
  }

  private paintCard(frame: ScreenPaintContext, card: EinkCard): void {
    const { ctx, width, height } = frame;
    const unit = height / 100;
    const { padding, gap, characterWidth, lineHeight } =
      this.config.layout;

    const boxX = unit * padding;
    const boxY = unit * padding;
    const boxWidth = width - unit * padding * 2;
    const boxHeight = height - unit * padding * 2;

    // A card with no art, or art that failed to load, gives the text the whole width.
    const source = card.character === undefined ? this.config.character : card.character;
    const hasArt = source !== null && this.prepare(source);
    const artWidth = hasArt ? boxWidth * characterWidth : 0;
    const textX = boxX + (hasArt ? artWidth + unit * gap : 0);
    const textWidth = boxWidth - (hasArt ? artWidth + unit * gap : 0);

    if (hasArt) {
      this.paintCharacter(frame, { x: boxX, y: boxY, width: artWidth, height: boxHeight });
    }

    const style = (size: number) => ({
      font: (bold: boolean, italic: boolean) =>
        `${italic ? 'italic ' : ''}${bold ? 700 : 500} ${size}px ${FONT_FAMILY}`,
      underlineWidth: Math.max(1, size * 0.07),
      underlineOffset: size * 0.42,
    });

    const preferred = Math.max(1, unit * card.fontSize);
    let size = preferred;
    let rows = wrapSpans(ctx, card.text, textWidth, style(size));
    // Wrapping changes the line count, so fit the whole block rather than its longest row.
    if (rows.length * size * lineHeight > boxHeight) {
      let low = 0;
      let high = preferred;
      for (let iteration = 0; iteration < 20; iteration++) {
        const candidate = (low + high) / 2;
        const wrapped = wrapSpans(ctx, card.text, textWidth, style(candidate));
        if (wrapped.length * candidate * lineHeight <= boxHeight) low = candidate;
        else high = candidate;
      }
      size = low;
      rows = wrapSpans(ctx, card.text, textWidth, style(size));
    }

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

  /** Fits and centers the art in `box`, keeping its aspect ratio. */
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
      box.y + (box.height - drawHeight) / 2,
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
