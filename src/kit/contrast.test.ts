import { describe, expect, test } from 'bun:test';

import { readableTextToken } from './contrast.ts';
import type { Palette } from './palette.ts';
import { toPalette } from './palette.ts';

const palette: Palette = toPalette({
  ansi0: '#111111',
  ansi7: '#dddddd',
  ansi8: '#707070',
  background: '#ffffff',
  foreground: '#000000',
});

describe('readableTextToken', () => {
  test('a dark fill gets the light text token', () => {
    expect(readableTextToken('ansi0', palette)).toBe('background');
  });

  test('a light fill gets the dark text token', () => {
    expect(readableTextToken('ansi7', palette)).toBe('foreground');
  });

  test('a mid-tone fill near the crossover gets the light text token', () => {
    expect(readableTextToken('ansi8', palette)).toBe('background');
  });
});
