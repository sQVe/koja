import { describe, expect, test } from 'bun:test';

import { pullFacts } from '../../../tests/pullFacts.ts';
import type { Pull } from '../../data/pulls.ts';
import { rowCut } from './rows.ts';

const pull = (title: string): Pull => pullFacts({ number: 1, headRefName: 'main', title });

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
