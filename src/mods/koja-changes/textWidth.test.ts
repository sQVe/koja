import { describe, expect, test } from 'bun:test';

import { displayColumns, untab } from './textWidth.ts';

describe('displayColumns', () => {
  test('counts one column for each narrow glyph', () => {
    expect(displayColumns('const x = 1;')).toBe(12);
  });

  test('counts one column for a digit, a hash, and a star', () => {
    expect(displayColumns('0#*')).toBe(3);
  });

  test('counts two columns for an ideograph', () => {
    expect(displayColumns('名前')).toBe(4);
  });

  test('counts two columns for an emoji presentation glyph', () => {
    expect(displayColumns('a🚀')).toBe(3);
  });

  test('counts one column for a glyph that is not emoji presentation', () => {
    expect(displayColumns('☺')).toBe(1);
  });

  test('adds no column for a combining mark', () => {
    expect(displayColumns('e\u0301')).toBe(1);
  });

  test('adds no column for a variation selector', () => {
    expect(displayColumns('a\uFE0F')).toBe(1);
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

  test('pads a tab after a wide glyph to the next stop in display columns', () => {
    expect(untab('名\tx')).toBe('名  x');
  });

  test('pads each of several tabs on one line', () => {
    expect(untab('a\tb\tc')).toBe('a   b   c');
  });

  test('leaves a line without tabs alone', () => {
    expect(untab('plain text')).toBe('plain text');
  });
});
