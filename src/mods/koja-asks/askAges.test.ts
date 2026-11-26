import { describe, expect, test } from 'bun:test';

import { askAgeOf, trackAskAges } from './askAges.ts';

const now = 1_700_000_000_000;

const identities = ['a', 'b', 'c', 'd', 'e'];

// A deterministic generator, so a failing run repeats with the same inputs.
const nextRandom = (seed: number): (() => number) => {
  let state = seed + 1;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const sample = <T>(values: readonly T[], random: () => number): T[] =>
  values.filter(() => random() < 0.5);

describe('trackAskAges', () => {
  test('starts a new ask at the current time and keeps a known one', () => {
    expect(trackAskAges({ a: 1000 }, ['a', 'b'], now)).toEqual({ a: 1000, b: now });
  });

  test('drops an ask that is gone', () => {
    expect(trackAskAges({ a: 1000, b: 2000 }, ['a'], now)).toEqual({ a: 1000 });
  });

  test('keeps every known age and prunes only the gone asks', () => {
    const random = nextRandom(20_261_126);

    for (let run = 0; run < 200; run += 1) {
      const before: Record<string, number> = {};
      const start = Math.floor(random() * 1_000_000);

      for (const [index, identity] of sample(identities, random).entries()) {
        before[identity] = start + index * 1_000;
      }

      const live = sample(identities, random);

      const expected = Object.fromEntries(
        live.map((identity) => [identity, before[identity] ?? now]),
      );

      const next = trackAskAges(before, live, now);
      const keys = Object.keys(next).toSorted();
      const expectedKeys = [...new Set(live)].toSorted();

      expect(keys).toEqual(expectedKeys);
      expect(next).toEqual(expected);
      expect(trackAskAges(next, live, now + 60_000)).toEqual(next);
    }
  });
});

describe('askAgeOf', () => {
  test('reads the time the ask has waited', () => {
    expect(askAgeOf({ a: now - 4 * 60_000 }, 'a', now)).toBe('4m');
  });

  test('reads an ask without a stored time as just now', () => {
    expect(askAgeOf({}, 'a', now)).toBe('now');
  });
});
