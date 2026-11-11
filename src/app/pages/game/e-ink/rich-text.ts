/**
 * The smallest useful rich text for a canvas: `**bold**` and `__underline__` inside an
 * otherwise plain string, so curfew messages stay readable in the config.
 */

export interface Span {
  text: string;
  bold: boolean;
  underline: boolean;
}

export interface SpanStyle {
  /** Font string to use for a run, built by the caller so sizing stays its business. */
  font: (bold: boolean) => string;
  /** Thickness of the underline rule, in pixels. */
  underlineWidth: number;
  /** Distance from the baseline down to the underline, in pixels. */
  underlineOffset: number;
}

export function parseSpans(source: string): Span[] {
  const spans: Span[] = [];
  let bold = false;
  let underline = false;
  let buffer = '';

  const flush = (): void => {
    if (buffer) {
      spans.push({ text: buffer, bold, underline });
      buffer = '';
    }
  };

  for (let index = 0; index < source.length; index++) {
    const pair = source.slice(index, index + 2);
    if (pair === '**' || pair === '__') {
      flush();
      if (pair === '**') {
        bold = !bold;
      } else {
        underline = !underline;
      }
      index++;
      continue;
    }
    buffer += source[index];
  }

  flush();
  return spans;
}

export function measureSpans(
  ctx: CanvasRenderingContext2D,
  spans: Span[],
  style: SpanStyle,
): number {
  let width = 0;
  for (const span of spans) {
    ctx.font = style.font(span.bold);
    width += ctx.measureText(span.text).width;
  }
  return width;
}

/** Draws the runs left to right from `x`, on the baseline-ish `y` of the current context. */
export function drawSpans(
  ctx: CanvasRenderingContext2D,
  spans: Span[],
  x: number,
  y: number,
  style: SpanStyle,
): void {
  let cursor = x;
  for (const span of spans) {
    ctx.font = style.font(span.bold);
    const width = ctx.measureText(span.text).width;
    ctx.fillText(span.text, cursor, y);

    if (span.underline) {
      // Trailing spaces should not carry the rule along with them.
      const trimmed = ctx.measureText(span.text.trimEnd()).width;
      ctx.fillRect(cursor, y + style.underlineOffset, trimmed, style.underlineWidth);
    }

    cursor += width;
  }
}
