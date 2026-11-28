import { describe, expect, test } from 'bun:test';

import { pick, seededRandom } from '../../tests/seeded.ts';
import { isRecord } from '../kit/fields.ts';
import { sameValue, sortedValue } from './sortedValue.ts';

const recordKeys = ['a', 'b', 'z', '2', '10', '01'];

const leafValue = (random: () => number): unknown => {
  const kind = Math.floor(random() * 3);

  if (kind === 0) {
    return Math.floor(random() * 100);
  }

  if (kind === 1) {
    return pick(['alpha', 'beta'], random);
  }

  return [Math.floor(random() * 10), pick(['alpha', 'beta'], random)];
};

const buildRecord = (random: () => number, depth: number): Record<string, unknown> => {
  const entries = recordKeys.map((key) => {
    const value = depth <= 0 || random() < 0.5 ? leafValue(random) : buildRecord(random, depth - 1);
    const entry: [string, unknown] = [key, value];

    return entry;
  });

  return Object.fromEntries(entries);
};

const shuffleEntries = (
  entries: readonly [string, unknown][],
  random: () => number,
): [string, unknown][] => {
  const remaining = [...entries];
  const shuffled: [string, unknown][] = [];

  while (remaining.length > 0) {
    const entry = pick(remaining, random);

    shuffled.push(entry);
    remaining.splice(remaining.indexOf(entry), 1);
  }

  return shuffled;
};

const reshuffled = (value: unknown, random: () => number): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => reshuffled(entry, random));
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value).map(([key, entry]) => {
    const pair: [string, unknown] = [key, reshuffled(entry, random)];

    return pair;
  });

  return Object.fromEntries(shuffleEntries(entries, random));
};

describe('sortedValue', () => {
  test('serializes records with the same keys and values to the same text', () => {
    const first = [{ '2': [2, 1], b: { a: 2, '10': 1 } }, { z: 'a' }];
    const second = [{ b: { '10': 1, a: 2 }, '2': [2, 1] }, { z: 'a' }];

    expect(JSON.stringify(sortedValue(first))).toBe(JSON.stringify(sortedValue(second)));
    expect(sortedValue([2, 1])).toEqual([2, 1]);
  });

  test('serializes any insertion order of the same records to one text', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const random = seededRandom(seed);
      const tree = buildRecord(random, 3);
      const other = reshuffled(tree, random);
      const expected = JSON.stringify(sortedValue(tree));

      expect(JSON.stringify(sortedValue(other)), `seed ${seed}`).toBe(expected);
    }
  });

  test('tells apart records whose values differ', () => {
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
});
