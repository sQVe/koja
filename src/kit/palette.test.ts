import { describe, expect, test } from 'bun:test';

import { toPalette } from './palette.ts';

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
});
