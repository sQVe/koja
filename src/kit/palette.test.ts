import { describe, expect, test } from 'bun:test';

import { clearOf, diffTints, toPalette, withAlpha } from './palette.ts';
import type { Color } from './palette.ts';

const themeTokens = [
  'background',
  'canvas',
  'chrome',
  'surface',
  'popover',
  'raised',
  'hover',
  'selected',
  'border',
  'input',
  'foreground',
  'muted',
  'dim',
  'accent',
  'accent_foreground',
  'solid',
  'solid_foreground',
  'selection',
  'working',
  'blocked',
  'done',
  'idle',
  'unknown',
  'ansi0',
  'ansi1',
  'ansi2',
  'ansi3',
  'ansi4',
  'ansi5',
  'ansi6',
  'ansi7',
  'ansi8',
  'ansi9',
  'ansi10',
  'ansi11',
  'ansi12',
  'ansi13',
  'ansi14',
  'ansi15',
] as const;

describe('toPalette', () => {
  test('gives every theme color the # form elements expect', () => {
    const palette = toPalette({ foreground: '1e2028', accent: '#5858a0' });

    expect(palette.foreground).toBe('#1e2028');
    expect(palette.accent).toBe('#5858a0');
  });

  test('gives a token the theme lacks the foreground color', () => {
    const palette = toPalette({ foreground: '#1e2028' });

    expect(palette.working).toBe('#1e2028');
    expect(palette.ansi15).toBe('#1e2028');
  });

  test('reads each palette field from its own theme token', () => {
    const theme: Record<string, string> = {};

    for (const [index, token] of themeTokens.entries()) {
      theme[token] = `#${index}`;
    }

    const palette = toPalette(theme);

    for (const [index, token] of themeTokens.entries()) {
      expect(palette[token]).toBe(`#${index}`);
    }
  });

  test('falls back to the bare # color when the theme is empty', () => {
    expect(toPalette({}).foreground).toBe('#');
  });
});

describe('color helpers', () => {
  test('appends the alpha suffix to a color', () => {
    expect(withAlpha('#102030', '18')).toBe('#10203018');
  });

  const clearCases: { color: Color; clear: Color }[] = [
    { color: '#102030', clear: '#10203000' },
    { color: '#ffffff17', clear: '#ffffff00' },
    { color: '#abc', clear: '#aabbcc00' },
    { color: '#abcd', clear: '#aabbcc00' },
  ];

  test.each(clearCases)('makes $color fully clear as $clear', ({ color, clear }) => {
    expect(clearOf(color)).toBe(clear);
  });

  test('tints added and removed lines from the ansi colors', () => {
    const palette = toPalette({ foreground: '#000000', ansi1: '#110000', ansi2: '#001100' });

    expect(diffTints(palette)).toEqual({ added: '#00110018', removed: '#11000018' });
  });
});
