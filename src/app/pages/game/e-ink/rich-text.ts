/**
 * Canvas rich text: `**bold**`, `*italic*`, and `__underline__` inside an
 * otherwise plain string, so curfew messages stay readable in the config.
 */

export interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface SpanStyle {
  /** Font string to use for a run, built by the caller so sizing stays its business. */
  font: (bold: boolean, italic: boolean) => string;
  /** Thickness of the underline rule, in pixels. */
  underlineWidth: number;
  /** Distance from the baseline down to the underline, in pixels. */
  underlineOffset: number;
}

export function parseSpans(source: string): Span[] {
  const spans: Span[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let buffer = '';

  const flush = (): void => {
    if (buffer) {
      spans.push({ text: buffer, bold, italic, underline });
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
    if (source[index] === '*') {
      flush();
      italic = !italic;
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
    ctx.font = style.font(span.bold, span.italic);
    width += ctx.measureText(span.text).width;
  }
  return width;
}

/** Wrap styled words, splitting oversized words only when they cannot fit a line. */
export function wrapSpans(
  ctx: CanvasRenderingContext2D,
  source: string,
  width: number,
  style: SpanStyle,
): Span[][] {
  const lines: Span[][] = [[]];
  let word: Span[] = [];
  let space: Span | null = null;
  const line = () => lines[lines.length - 1];
  const append = (span: Span) => {
    const last = line().at(-1);
    if (last && last.bold === span.bold && last.italic === span.italic && last.underline === span.underline) last.text += span.text;
    else line().push({ ...span });
  };
  const flush = () => {
    if (!word.length) return;
    const gap = space && line().length ? [space] : [];
    if (line().length && measureSpans(ctx, [...line(), ...gap, ...word], style) > width) {
      lines.push([]);
    } else if (gap.length) append(gap[0]);
    if (measureSpans(ctx, word, style) <= width) word.forEach(append);
    else {
      for (const span of word) {
        for (const char of Array.from(span.text)) {
          const next = { ...span, text: char };
          if (line().length && measureSpans(ctx, [...line(), next], style) > width) lines.push([]);
          append(next);
        }
      }
    }
    word = [];
    space = null;
  };
  const normalized = source.replace(/<br\s*\/?\s*>[\t ]*/gi, '\n').replace(/\r\n?/g, '\n');
  for (const span of parseSpans(normalized)) {
    for (const token of span.text.split(/(\n|[^\S\n]+)/)) {
      if (!token) continue;
      if (token === '\n') {
        flush();
        lines.push([]);
        space = null;
      } else if (/^\s+$/.test(token)) {
        flush();
        space = { ...span, text: ' ' };
      } else word.push({ ...span, text: token });
    }
  }
  flush();
  return lines;
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
    ctx.font = style.font(span.bold, span.italic);
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
