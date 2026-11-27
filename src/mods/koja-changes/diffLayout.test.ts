import { describe, expect, test } from 'bun:test';

import { diffLayout, measureDiff } from './diffLayout.ts';
import type { DiffRow } from './diffRows.ts';

const row = (text: string, number?: number): DiffRow =>
  number === undefined ? { kind: ' ', text } : { kind: ' ', number, text };

const layoutOf = (rows: DiffRow[], fontSize: number) => diffLayout(measureDiff(rows), fontSize);

describe('diffLayout', () => {
  test('keeps the minimum width for short lines', () => {
    expect(layoutOf([row('a', 1)], 14).width).toBe(300);
  });

  test('keeps a four-digit gutter when every line number is shorter', () => {
    expect(layoutOf([row('a', 1)], 14).gutterCharacters).toBe(4);
  });

  test('widens the gutter for a line number longer than four digits', () => {
    expect(layoutOf([row('a', 12345)], 14).gutterCharacters).toBe(5);
  });

  test('grows the row height with the font size', () => {
    const document = measureDiff([row('a', 1)]);
    const small = diffLayout(document, 10).rowHeight;
    const large = diffLayout(document, 20).rowHeight;

    expect(large).toBeGreaterThan(small);
  });

  test('keeps the row height and gutter width for a 10 px font', () => {
    const layout = layoutOf([row('a', 1)], 10);

    expect(layout.rowHeight).toBe(18);
    expect(layout.gutterWidth).toBe(28);
  });

  test('gives a wide glyph two columns of width', () => {
    const narrow = layoutOf([row('n'.repeat(200), 1)], 14).width;
    const wide = layoutOf([row('名'.repeat(200), 1)], 14).width;

    expect(wide).toBeGreaterThan(narrow);
  });

  test('grows the width with a longer line', () => {
    const short = layoutOf([row('n'.repeat(60), 1)], 14).width;
    const long = layoutOf([row('n'.repeat(120), 1)], 14).width;

    expect(long).toBeGreaterThan(short);
  });
});

describe('measureDiff', () => {
  test('keeps the widest line number and the widest text columns of the document', () => {
    const document = measureDiff([row('a', 1), row('名'.repeat(100), 12345), row('hunk')]);

    expect(document.widestNumber).toBe(12345);
    expect(document.widestText).toBe(200);
  });
});
