import { describe, expect, test } from 'bun:test';

import { fuzzyMatch } from './fuzzy.ts';

describe('fuzzyMatch', () => {
  test('finds the letters in order, whatever their case', () => {
    expect(fuzzyMatch('nt', 'New tab')?.positions).toEqual([0, 4]);
  });

  test('answers null when a letter is missing', () => {
    expect(fuzzyMatch('nx', 'New tab')).toBeNull();
  });

  test('ranks word starts above letters inside words', () => {
    const wordStarts = fuzzyMatch('sr', 'Split right');
    const inside = fuzzyMatch('sr', 'Last error');

    expect(wordStarts?.score ?? 0).toBeGreaterThan(inside?.score ?? 0);
  });

  test('ranks a run of letters above the same letters apart', () => {
    const together = fuzzyMatch('zoo', 'Zoom pane');
    const apart = fuzzyMatch('zoo', 'Zebra photo');

    expect(together?.score ?? 0).toBeGreaterThan(apart?.score ?? 0);
  });

  test('ranks the shorter of two equal matches higher', () => {
    const short = fuzzyMatch('pa', 'Paste');
    const long = fuzzyMatch('pa', 'Paste from the clipboard history');

    expect(short?.score ?? 0).toBeGreaterThan(long?.score ?? 0);
  });
});
