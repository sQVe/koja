import { describe, expect, test } from 'bun:test';

import { bestFieldMatch, fuzzyMatch } from './match.ts';

describe('fuzzyMatch', () => {
  test('finds the letters in order, whatever their case', () => {
    expect(fuzzyMatch('KJ', 'koja')?.positions).toEqual([0, 2]);
  });

  test('refuses letters spread far apart inside words', () => {
    expect(fuzzyMatch('ka', 'kxxxxxxxxxxxxxxxxxxa')).toBeNull();
  });

  test('accepts far letters that each start a word', () => {
    expect(fuzzyMatch('pm', 'port herdr mods to the kit')?.positions).toEqual([0, 11]);
  });

  test('ranks a run of letters above the same letters apart', () => {
    const together = fuzzyMatch('ko', 'koja');
    const apart = fuzzyMatch('ko', 'kitchen-tools');

    expect(together?.score ?? 0).toBeGreaterThan(apart?.score ?? 0);
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
});
