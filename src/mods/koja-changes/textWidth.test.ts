import { describe, expect, test } from 'bun:test';

import { displayColumns, untab } from './textWidth.ts';

describe('displayColumns', () => {
  test('counts one column for each narrow glyph', () => {
    expect(displayColumns('const x = 1;')).toBe(12);
  });

  test('counts two columns for an ideograph', () => {
    expect(displayColumns('名前')).toBe(4);
  });

  test('counts two columns for an emoji presentation glyph', () => {
    expect(displayColumns('a🚀')).toBe(3);
  });

  test('keeps the width of a combining mark to the glyph it joins', () => {
    expect(displayColumns('e\u0301')).toBe(2);
  });
});

describe('untab', () => {
  test('pads a leading tab to the first stop', () => {
    expect(untab('\tx')).toBe('    x');
  });

  test('pads a tab to the next stop after the text before it', () => {
    expect(untab('ab\tx')).toBe('ab  x');
  });

  test('pads a tab that starts on a stop to the next one', () => {
    expect(untab('abcd\tx')).toBe('abcd    x');
  });

  test('pads each of several tabs on one line', () => {
    expect(untab('a\tb\tc')).toBe('a   b   c');
  });

  test('leaves a line without tabs alone', () => {
    expect(untab('plain text')).toBe('plain text');
  });
});
