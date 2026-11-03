import { describe, expect, test } from 'bun:test';

import { shortAge } from './age.ts';

const nowSeconds = 1_000_000;

describe('shortAge', () => {
  test('reads a time less than a minute old as now', () => {
    expect(shortAge(nowSeconds - 59, nowSeconds)).toBe('now');
  });

  test('counts whole minutes under an hour', () => {
    expect(shortAge(nowSeconds - 4 * 60, nowSeconds)).toBe('4m');
  });

  test('counts whole hours under a day', () => {
    expect(shortAge(nowSeconds - 3 * 3600 - 59, nowSeconds)).toBe('3h');
  });

  test('counts whole days under a week', () => {
    expect(shortAge(nowSeconds - 2 * 86_400, nowSeconds)).toBe('2d');
  });

  test('counts weeks from a week on', () => {
    expect(shortAge(nowSeconds - 5 * 604_800, nowSeconds)).toBe('5w');
  });

  test('reads a time in the future as now', () => {
    expect(shortAge(nowSeconds + 3600, nowSeconds)).toBe('now');
  });
});
