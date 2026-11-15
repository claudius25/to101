import { measureSpans, parseSpans, SpanStyle, wrapSpans } from './rich-text';

describe('E-ink rich text wrapping', () => {
  let ctx: CanvasRenderingContext2D;
  const style: SpanStyle = {
    font: (bold, italic) => `${italic ? 'italic ' : ''}${bold ? 700 : 500} 16px sans-serif`,
    underlineWidth: 1,
    underlineOffset: 6,
  };
  beforeEach(() => {
    ctx = document.createElement('canvas').getContext('2d')!;
  });

  it('should combine italic with bold and underline, retaining styles across wrapping', () => {
    const spans = parseSpans('plain *italic* ***both*** __*underlined italic*__');
    expect(spans.find((span) => span.text === 'italic')?.italic).toBeTrue();
    const both = spans.find((span) => span.text === 'both')!;
    expect(both.bold && both.italic).toBeTrue();
    const underlined = spans.find((span) => span.text === 'underlined italic')!;
    expect(underlined.italic && underlined.underline).toBeTrue();
    const rows = wrapSpans(ctx, '*Long italic message that wraps*', 75, style);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flat().every((span) => span.italic && !span.bold)).toBeTrue();
    expect(rows.every((row) => measureSpans(ctx, row, style) <= 75)).toBeTrue();
  });

  it('should wrap words within the available width and retain rich formatting', () => {
    const source = 'Make your **bed every morning** and __rest well__.';
    const rows = wrapSpans(ctx, source, 100, style);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => measureSpans(ctx, row, style) <= 100)).toBeTrue();
    expect(rows.map((row) => row.map((span) => span.text).join('')).join(' '))
      .toBe('Make your bed every morning and rest well.');
    expect(rows.flat().filter((span) => span.bold).map((span) => span.text).join(' '))
      .toBe('bed every morning');
    expect(rows.flat().some((span) => span.underline && span.text.includes('rest'))).toBeTrue();
  });

  it('should preserve paragraphs and split words too long to fit', () => {
    const rows = wrapSpans(ctx, 'Hi\n\n**Supercalifragilisticexpialidocious**', 45, style);
    expect(rows[0][0].text).toBe('Hi');
    expect(rows[1]).toEqual([]);
    expect(rows.slice(2).flat().every((span) => span.bold)).toBeTrue();
    expect(rows.slice(2).flat().map((span) => span.text).join(''))
      .toBe('Supercalifragilisticexpialidocious');
    expect(rows.every((row) => measureSpans(ctx, row, style) <= 45)).toBeTrue();
  });

  it('should render HTML break variants as newlines and preserve active formatting', () => {
    const rows = wrapSpans(ctx, '**One<br /> Two<BR>Three<br/>Four**', 500, style);
    expect(rows.map((row) => row.map((span) => span.text).join('')))
      .toEqual(['One', 'Two', 'Three', 'Four']);
    expect(rows.flat().every((span) => span.bold)).toBeTrue();
  });
});
