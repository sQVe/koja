import { describe, expect, spyOn, test } from 'bun:test';

import { bestFieldMatch, fuzzyMatch } from './match.ts';

const scanCounter = (letter: string): { scanned: () => number; restore: () => void } => {
  const original = String.prototype.indexOf;
  let scanned = 0;

  const spy = spyOn(String.prototype, 'indexOf').mockImplementation(function (
    this: string,
    needle: string,
    start = 0,
  ): number {
    if (needle === letter) {
      scanned += Math.max(0, this.length - start);
    }

    return original.call(this, needle, start);
  });

  return {
    scanned: () => scanned,
    restore: () => {
      spy.mockRestore();
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
    const counter = scanCounter('b');

    try {
      expect(fuzzyMatch('ab', text)).toBeNull();
    } finally {
      counter.restore();
    }

    expect(counter.scanned()).toBeLessThan(text.length * 2);
  });

  test('bounds the scans when the rescue letter is present', () => {
    const text = `${'a'.repeat(400_000)}b`;
    const counter = scanCounter('b');

    try {
      expect(fuzzyMatch('ab', text)?.positions).toEqual([399_999, 400_000]);
    } finally {
      counter.restore();
    }

    expect(counter.scanned()).toBeLessThan(text.length * 2);
  });

  test('matches a compact rescue after a supplementary first character', () => {
    const text = `😀${'x'.repeat(20)}😀b`;

    expect(fuzzyMatch('😀b', text)).toEqual({ score: 0.8, positions: [22, 24] });
  });

  test('accepts far letters that each start a word', () => {
    expect(fuzzyMatch('pm', 'port herdr mods to the kit')?.positions).toEqual([0, 11]);
  });

  test('ranks a run of letters above the same letters apart', () => {
    const together = fuzzyMatch('ko', 'koja');
    const apart = fuzzyMatch('ko', 'kitchen-tools');

    expect(together?.score ?? 0).toBeGreaterThan(apart?.score ?? 0);
  });

  test('scores each letter that follows the one before it', () => {
    expect(fuzzyMatch('abc', 'abc')).toEqual({ score: 23, positions: [0, 1, 2] });
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
});

describe('bestFieldMatch', () => {
  test('answers the best single field and skips empty ones', () => {
    const match = bestFieldMatch('main', [null, '', 'domain-tools', 'main']);

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
