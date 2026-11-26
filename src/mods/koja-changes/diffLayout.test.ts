import { describe, expect, test } from 'bun:test';

import { diffLayout } from './diffLayout.ts';
import type { DiffRow } from './diffRows.ts';

const row = (text: string, number?: number): DiffRow =>
  number === undefined ? { kind: ' ', text } : { kind: ' ', number, text };

describe('diffLayout', () => {
  test('keeps the minimum width for short lines', () => {
    expect(diffLayout([row('a', 1)], 14).width).toBe(300);
  });

  test('keeps a four-digit gutter when every line number is shorter', () => {
    expect(diffLayout([row('a', 1)], 14).gutterCharacters).toBe(4);
  });

  test('widens the gutter for a line number longer than four digits', () => {
    expect(diffLayout([row('a', 12345)], 14).gutterCharacters).toBe(5);
  });

  test('grows the row height with the font size', () => {
    const small = diffLayout([row('a', 1)], 10).rowHeight;
    const large = diffLayout([row('a', 1)], 20).rowHeight;

    expect(large).toBeGreaterThan(small);
  });

  test('keeps the row height and gutter width for a 10 px font', () => {
    const layout = diffLayout([row('a', 1)], 10);

    expect(layout.rowHeight).toBe(18);
    expect(layout.gutterWidth).toBe(28);
  });

  test('gives a wide glyph two columns of width', () => {
    const narrow = diffLayout([row('n'.repeat(200), 1)], 14).width;
    const wide = diffLayout([row('名'.repeat(200), 1)], 14).width;

    expect(wide).toBeGreaterThan(narrow);
  });

  test('grows the width with a longer line', () => {
    const short = diffLayout([row('n'.repeat(60), 1)], 14).width;
    const long = diffLayout([row('n'.repeat(120), 1)], 14).width;

    expect(long).toBeGreaterThan(short);
  });
});
