import { describe, expect, test } from 'bun:test';

import { askAgeOf, readAskAges, trackAskAges } from './askAges.ts';

const now = 1_700_000_000_000;

describe('readAskAges', () => {
  test('reads the times of stored asks', () => {
    expect(readAskAges('{"a":1700000000000}')).toEqual({ a: 1_700_000_000_000 });
  });

  test('drops a value that is not a time and a text that is not a record', () => {
    expect(readAskAges('{"a":"soon","b":12}')).toEqual({ b: 12 });
    expect(readAskAges('[[1]]')).toEqual({});
    expect(readAskAges(null)).toEqual({});
  });
});

describe('trackAskAges', () => {
  test('keeps a known ask and starts a new one at the current time', () => {
    const advance = trackAskAges({ a: 1000 }, ['a', 'b'], now);

    expect(advance.ages).toEqual({ a: 1000, b: now });
    expect(advance.changed).toBe(true);
  });

  test('drops an ask that is gone', () => {
    const advance = trackAskAges({ a: 1000, b: 2000 }, ['a'], now);

    expect(advance.ages).toEqual({ a: 1000 });
    expect(advance.changed).toBe(true);
  });

  test('reports no change when the same asks stay', () => {
    expect(trackAskAges({ a: 1000 }, ['a'], now)).toEqual({ ages: { a: 1000 }, changed: false });
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
