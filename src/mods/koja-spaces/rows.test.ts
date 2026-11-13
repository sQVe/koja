import { describe, expect, test } from 'bun:test';

import type { Pull } from './pulls.ts';
import { rowCut } from './rows.ts';

const pull = (title: string): Pull => ({
  number: 1,
  state: 'OPEN',
  isDraft: false,
  title,
  headRefName: 'main',
});

describe('rowCut', () => {
  test('cuts a named space in the middle even when it has a pull title', () => {
    expect(rowCut(true, pull('Fix the login redirect'))).toBe('middle');
  });

  test('cuts an unnamed space without a pull in the middle', () => {
    expect(rowCut(false, null)).toBe('middle');
  });

  test('cuts an unnamed space whose pull has no title in the middle', () => {
    expect(rowCut(false, pull(''))).toBe('middle');
  });

  test('cuts an unnamed space whose pull has a title at the end', () => {
    expect(rowCut(false, pull('Fix the login redirect'))).toBe('end');
  });
});
