import { describe, expect, test } from 'bun:test';

import { showsSelectionHint } from './selection.ts';

describe('showsSelectionHint', () => {
  test('shows with no open file and a non-empty list', () => {
    expect(showsSelectionHint(null, 3)).toBe(true);
  });

  test('hides while a file is open', () => {
    expect(showsSelectionHint('a.ts', 3)).toBe(false);
  });

  test('hides with an empty list', () => {
    expect(showsSelectionHint(null, 0)).toBe(false);
  });
});
