import { describe, expect, test } from 'bun:test';

import { pick, seededRandom } from '../../tests/seeded.ts';
import { folderNameOf, keepEarliest } from './fields.ts';

describe('folderNameOf', () => {
  test('names the last folder with or without a trailing slash', () => {
    expect(folderNameOf('/code/koja')).toBe('koja');
    expect(folderNameOf('/code/koja/')).toBe('koja');
  });

  test('returns an empty name when no folder is present', () => {
    expect(folderNameOf(null)).toBe('');
    expect(folderNameOf('')).toBe('');
    expect(folderNameOf('/')).toBe('');
  });
});

describe('keepEarliest', () => {
  test('keeps the first time it is given for a key', () => {
    const stored = new Map<string, number>();

    keepEarliest(stored, 'key', 700);
    keepEarliest(stored, 'key', 900);

    expect(stored.get('key')).toBe(700);
  });

  test('moves a later time back to an earlier one', () => {
    const stored = new Map([['key', 900]]);

    keepEarliest(stored, 'key', 700);

    expect(stored.get('key')).toBe(700);
  });

  test('keeps the time it already holds for the same moment', () => {
    const stored = new Map([['key', 700]]);

    keepEarliest(stored, 'key', 700);

    expect(stored.get('key')).toBe(700);
  });

  test('holds the smallest time of any order of calls', () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const random = seededRandom(trial);
      const stored = new Map<string, number>();
      const calls: [string, number][] = [];
      const keys = ['a', 'b', 'c'];

      for (let step = 0; step < 12; step += 1) {
        const key = pick(keys, random);
        const at = Math.floor(random() * 1_000);

        calls.push([key, at]);
        keepEarliest(stored, key, at);
      }

      for (const key of keys) {
        const given = calls.filter(([called]) => called === key).map(([, at]) => at);
        const expected = given.length === 0 ? undefined : Math.min(...given);

        expect(stored.get(key)).toBe(expected);
      }
    }
  });
});
