import { describe, expect, test } from 'bun:test';

import { foldedSet } from './folded.ts';

const store = (): {
  values: Record<string, string>;
  store: { get: (key: string) => string | null; set: (key: string, value: string) => void };
} => {
  const values: Record<string, string> = {};

  return {
    values,
    store: {
      get: (key) => values[key] ?? null,
      set: (key, value) => {
        values[key] = value;
      },
    },
  };
};

describe('foldedSet', () => {
  test('toggles an item on and off, persisting each time', () => {
    const { values, store: storage } = store();
    const folded = foldedSet('machines.folded', storage);

    expect(folded.has('work')).toBe(false);

    folded.toggle('work');

    expect(folded.has('work')).toBe(true);
    expect(values['machines.folded']).toBe('["work"]');

    folded.toggle('work');

    expect(folded.has('work')).toBe(false);
    expect(values['machines.folded']).toBe('[]');
  });

  test('reads an existing folded set', () => {
    const { store: storage } = store();

    storage.set('repos.folded', '["a","b"]');

    const folded = foldedSet('repos.folded', storage);

    expect(folded.has('b')).toBe(true);
    expect(folded.has('c')).toBe(false);
  });
});
