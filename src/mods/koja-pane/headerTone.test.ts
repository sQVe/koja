import { describe, expect, test } from 'bun:test';

import { headerTone } from './headerTone.ts';

describe('headerTone', () => {
  test('tints the focused header in normal mode with an accent title and icon', () => {
    expect(headerTone(true, true)).toEqual({ tinted: true, title: 'accent', icon: 'accent' });
  });

  test('keeps the insert look for the focused header outside normal mode', () => {
    expect(headerTone(true, false)).toEqual({ tinted: false, title: 'foreground', icon: 'muted' });
  });

  test('leaves unfocused headers untinted in both modes', () => {
    for (const normalMode of [true, false]) {
      expect(headerTone(false, normalMode)).toEqual({ tinted: false, title: 'muted', icon: 'dim' });
    }
  });
});
