import { describe, expect, test } from 'bun:test';

import { advanceVisibility, initialVisibility, newSpaceWait } from './visibility.ts';

const space = (id: string, key = id): { id: string; key: string } => ({ id, key });

describe('advanceVisibility', () => {
  test('shows the spaces that already exist', () => {
    const result = advanceVisibility(initialVisibility(['s1']), {
      spaces: [space('s1'), space('s2')],
      answered: new Set(),
      time: 0,
    });

    expect([...result.shown]).toEqual(['s1']);
    expect(result.waiting).toBe(true);
  });

  test('shows a new space as soon as git answers for its place', () => {
    const result = advanceVisibility(initialVisibility([]), {
      spaces: [space('s2', 'place')],
      answered: new Set(['place']),
      time: 10,
    });

    expect(result.shown.has('s2')).toBe(true);
    expect(result.waiting).toBe(false);
  });

  test('counts a known-null git answer as answered', () => {
    const result = advanceVisibility(initialVisibility([]), {
      spaces: [space('s2', 'place')],
      answered: new Set(['place']),
      time: 10,
    });

    expect(result.shown.has('s2')).toBe(true);
  });

  test('shows a new space only after the wait', () => {
    const spaces = [space('s2', 'place')];

    const started = advanceVisibility(initialVisibility([]), {
      spaces,
      answered: new Set(),
      time: 0,
    });

    const before = advanceVisibility(started, {
      spaces,
      answered: new Set(),
      time: newSpaceWait,
    });

    expect(before.shown.has('s2')).toBe(false);

    const after = advanceVisibility(before, {
      spaces,
      answered: new Set(),
      time: newSpaceWait + 1,
    });

    expect(after.shown.has('s2')).toBe(true);
  });

  test('reports a change when the wait shows the last space', () => {
    const spaces = [space('s2', 'place')];

    const started = advanceVisibility(initialVisibility([]), {
      spaces,
      answered: new Set(),
      time: 0,
    });

    const shown = advanceVisibility(started, {
      spaces,
      answered: new Set(),
      time: newSpaceWait + 1,
    });

    expect(shown.changed).toBe(true);
    expect(shown.waiting).toBe(false);
  });

  test('keeps the earliest observation time', () => {
    const spaces = [space('s2', 'place')];

    const first = advanceVisibility(initialVisibility([]), {
      spaces,
      answered: new Set(),
      time: 100,
    });

    const later = advanceVisibility(first, {
      spaces,
      answered: new Set(),
      time: 500,
    });

    expect(later.born['s2']).toBe(100);
  });

  test('prunes shown and born entries for spaces that are gone', () => {
    const started = { shown: new Set(['s1', 's2']), born: { s1: 1, s2: 2 } };

    const result = advanceVisibility(started, {
      spaces: [space('s1')],
      answered: new Set(),
      time: 100,
    });

    expect([...result.shown]).toEqual(['s1']);
    expect(result.born).toEqual({ s1: 1 });
  });
});
