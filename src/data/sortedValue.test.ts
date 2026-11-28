import { describe, expect, test } from 'bun:test';

import { pick, seededRandom } from '../../tests/seeded.ts';
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

const leafPair = (random: () => number): [unknown, unknown] => {
  const leaf = leafValue(random);

  return [leaf, leaf];
};

const buildRecordPair = (
  random: () => number,
  depth: number,
): [Record<string, unknown>, Record<string, unknown>] => {
  const children = recordKeys.map((key) => {
    const nested = depth > 0 && random() >= 0.5;
    const [first, second] = nested ? buildRecordPair(random, depth - 1) : leafPair(random);
    const rank = random();

    return { key, first, second, rank };
  });

  const firstEntries = children.map(({ key, first }): [string, unknown] => [key, first]);

  const secondEntries = children
    .toSorted((left, right) => left.rank - right.rank)
    .map(({ key, second }): [string, unknown] => [key, second]);

  return [Object.fromEntries(firstEntries), Object.fromEntries(secondEntries)];
};

describe('sortedValue', () => {
  test('serializes records with the same keys and values to the same text', () => {
    const first = [{ '2': [2, 1], b: 1, a: 2 }];
    const second = [{ a: 2, b: 1, '2': [2, 1] }];

    expect(JSON.stringify(sortedValue(first))).toBe(JSON.stringify(sortedValue(second)));
    expect(sortedValue([2, 1])).toEqual([2, 1]);
  });

  test('serializes any insertion order of the same records to one text', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const random = seededRandom(seed);
      const [tree, other] = buildRecordPair(random, 3);
      const expected = JSON.stringify(sortedValue(tree));

      expect(JSON.stringify(sortedValue(other)), `seed ${seed}`).toBe(expected);
    }
  });

  test('tells apart records whose values differ', () => {
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
});
