import { describe, expect, spyOn, test } from 'bun:test';

import { bestFieldMatch, fuzzyMatch, OccurrenceTable, routeWorkBudget } from './match.ts';

const lookupCounter = (): { lookups: () => number; restore: () => void } => {
  const positionLookup = spyOn(OccurrenceTable.prototype, 'firstAtOrAfter');
  const wordStartLookup = spyOn(OccurrenceTable.prototype, 'firstWordStartAtOrAfter');

  return {
    lookups: () => positionLookup.mock.calls.length + wordStartLookup.mock.calls.length,
    restore: () => {
      positionLookup.mockRestore();
      wordStartLookup.mockRestore();
    },
  };
};

describe('fuzzyMatch', () => {
  test('finds the letters in order, whatever their case', () => {
    expect(fuzzyMatch('KJ', 'koja')?.positions).toEqual([0, 2]);
  });

  test('refuses letters spread far apart inside words', () => {
    expect(fuzzyMatch('ka', 'kxxxxxxxxxxxxxxxxxxa')).toBeNull();
  });

  test('finds a compact match when the first letter occurs earlier', () => {
    const text = `a${'x'.repeat(14)}a${'x'.repeat(4)}b`;

    expect(fuzzyMatch('ab', text)?.positions).toEqual([15, 20]);
  });

  test('bounds the scans for a missing query letter on a long text', () => {
    const text = 'a'.repeat(400_000);
    const counter = lookupCounter();
    let match: ReturnType<typeof fuzzyMatch> = null;
    let lookups = 0;

    try {
      match = fuzzyMatch('ab', text);
      lookups = counter.lookups();
    } finally {
      counter.restore();
    }

    expect(match).toBeNull();
    expect(lookups).toBeLessThan(10);
  });

  test('bounds the scans when the rescue letter is present', () => {
    const text = `${'a'.repeat(400_000)}b`;
    const counter = lookupCounter();
    let positions: number[] | undefined;
    let lookups = 0;

    try {
      positions = fuzzyMatch('ab', text)?.positions;
      lookups = counter.lookups();
    } finally {
      counter.restore();
    }

    expect(positions).toEqual([399_999, 400_000]);
    expect(lookups).toBeLessThan(text.length * 3);
  });

  test('bounds the occurrence-table lookups when the route search tries many starts', () => {
    const count = 200;
    const text = `${'a b '.repeat(count)}${'x'.repeat(12)}${'c'.repeat(count)}`;
    const counter = lookupCounter();
    let match: ReturnType<typeof fuzzyMatch> = null;
    let lookups = 0;

    try {
      match = fuzzyMatch('abc', text);
      lookups = counter.lookups();
    } finally {
      counter.restore();
    }

    expect(match).toBeNull();
    expect(lookups).toBeGreaterThan(1000);
    expect(lookups).toBeLessThanOrEqual(routeWorkBudget);
  });

  test('matches a compact rescue after a supplementary first character', () => {
    const text = `😀${'x'.repeat(20)}😀b`;

    expect(fuzzyMatch('😀b', text)?.positions).toEqual([22, 24]);
  });

  test('accepts far letters that each start a word', () => {
    expect(fuzzyMatch('pm', 'port herdr mods to the kit')?.positions).toEqual([0, 11]);
  });

  test('ranks a run of letters above the same letters apart', () => {
    const together = fuzzyMatch('ko', 'koja');
    const apart = fuzzyMatch('ko', 'kitchen-tools');

    expect(together?.score ?? 0).toBeGreaterThan(apart?.score ?? 0);
  });

  test('ranks letters that follow each other above the same letters with gaps', () => {
    const together = fuzzyMatch('abc', 'abc');
    const apart = fuzzyMatch('abc', 'a-b-c');

    expect(together?.score ?? 0).toBeGreaterThan(apart?.score ?? 0);
  });

  test('ranks the closer of two matches above the looser one', () => {
    const closer = fuzzyMatch('ab', '-aa-baab');
    const looser = fuzzyMatch('ab', 'a-xa-bxb');

    expect(closer?.score ?? 0).toBeGreaterThan(looser?.score ?? 0);
  });

  test('ranks a match that starts a word above a run inside a word', () => {
    const wordStart = fuzzyMatch('ba', 'b-xx-a');
    const run = fuzzyMatch('ba', 'ababab-');

    expect(wordStart?.score ?? 0).toBeGreaterThan(run?.score ?? 0);
  });

  test('refuses a spread match when a later letter is neither a word start nor a run', () => {
    expect(fuzzyMatch('abc', `ab${'x'.repeat(20)}c`)).toBeNull();
  });

  test('accepts a spread match whose later letters start words or continue a run', () => {
    expect(fuzzyMatch('abc', `xab${'x'.repeat(10)} c`)?.positions).toEqual([1, 2, 14]);
  });

  test('refuses a compact match one letter past the spread limit', () => {
    expect(fuzzyMatch('ab', `a${'x'.repeat(7)}b`)).toBeNull();
  });

  test('accepts a compact match at the spread limit', () => {
    expect(fuzzyMatch('ab', `a${'x'.repeat(6)}b`)?.positions).toEqual([0, 7]);
  });

  test('matches a repeated letter at its next occurrence', () => {
    expect(fuzzyMatch('aa', 'aa')?.positions).toEqual([0, 1]);
  });

  test('refuses letters that appear only before the earlier ones', () => {
    expect(fuzzyMatch('ab', 'ba')).toBeNull();
  });

  test('matches an empty query with no positions and no score', () => {
    expect(fuzzyMatch('', 'koja')).toEqual({ score: 0, positions: [] });
  });

  test('keeps the first of two equal compact rescues', () => {
    const text = `a${'x'.repeat(12)} ab ab`;

    expect(fuzzyMatch('ab', text)?.positions).toEqual([14, 15]);
  });

  test('finds the word-start route past an earlier letter', () => {
    expect(fuzzyMatch('abc', 'abxxxxxxxxxx bc')?.positions).toEqual([0, 13, 14]);
  });

  test('finds a route that starts at a later occurrence of the first letter', () => {
    const text = `a${'x'.repeat(11)}ab${'x'.repeat(11)}c c`;

    expect(fuzzyMatch('abc', text)?.positions).toEqual([12, 13, 27]);
  });

  test('keeps a route whose earlier word start fails', () => {
    expect(fuzzyMatch('abc', '-aax-xcxbx-- b x-bcxxx  aa  xx')?.positions).toEqual([1, 17, 18]);
  });

  test('accepts a wide match with a run after an astral character', () => {
    expect(fuzzyMatch('😀bc', '😀bxxxxxxxxxx c')?.positions).toEqual([0, 2, 14]);
  });

  test('ranks an astral run above the same letters with a gap', () => {
    const run = fuzzyMatch('😀b', '😀b');
    const gap = fuzzyMatch('😀b', '😀 b');

    expect(run?.score ?? 0).toBeGreaterThan(gap?.score ?? 0);
  });

  test('returns the original index after lowercase expands a character', () => {
    expect(fuzzyMatch('x', 'İ xz')?.positions).toEqual([2]);
  });

  test('İ against İ gives one position', () => {
    expect(fuzzyMatch('İ', 'İ')?.positions).toEqual([0]);
  });

  test('returns the original index after a NUL character', () => {
    expect(fuzzyMatch('b', 'a\u0000b')?.positions).toEqual([2]);
  });
});

describe('bestFieldMatch', () => {
  test('answers the best single field and skips empty ones', () => {
    const match = bestFieldMatch('main', [null, '', 'domain-tools', 'main']);

    expect(match?.field).toBe('main');
    expect(match?.positions).toEqual([0, 1, 2, 3]);
  });

  test('never matches letters across fields', () => {
    expect(bestFieldMatch('ab', ['a', 'b'])).toBeNull();
  });

  test('keeps the first field when a later field scores the same', () => {
    expect(bestFieldMatch('k', ['abcdef k', 'abcdefgh k'])?.positions).toEqual([7]);
  });

  test('answers the best field whatever its order', () => {
    expect(bestFieldMatch('ko', ['koja', 'domain-ko'])?.positions).toEqual([0, 1]);
  });

  test('skips absent fields', () => {
    expect(bestFieldMatch('ko', [undefined, 'koja'])?.positions).toEqual([0, 1]);
  });

  test('never matches an empty field, even for an empty query', () => {
    expect(bestFieldMatch('', [''])).toBeNull();
  });
});
