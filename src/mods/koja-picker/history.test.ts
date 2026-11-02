import { describe, expect, test } from 'bun:test';

import { createHistory } from './history.ts';

const keys = { recent: 'recent', focus: 'focus' };

const setup = (): {
  values: Record<string, unknown>;
  store: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
    liveTabs: () => ReadonlySet<string>;
  };
  setLive: (tabs: string[]) => void;
} => {
  const values: Record<string, unknown> = {};
  let live = new Set<string>();

  return {
    values,
    setLive: (tabs) => {
      live = new Set(tabs);
    },
    store: {
      get: (key) => values[key],
      set: (key, value) => {
        values[key] = value;
      },
      liveTabs: () => live,
    },
  };
};

describe('history reads', () => {
  test('keeps only strings', () => {
    const { values, store } = setup();

    values['recent'] = ['a', 5, 'b'];
    values['focus'] = { a: 'x', b: 7 };

    const history = createHistory(store, keys);

    expect(history.recent()).toEqual(['a', 'b']);
    expect(history.focus()).toEqual({ a: 'x' });
  });

  test('answers empty for missing values', () => {
    const { store } = setup();
    const history = createHistory(store, keys);

    expect(history.recent()).toEqual([]);
    expect(history.focus()).toEqual({});
  });
});

describe('rememberSpace', () => {
  test('moves the space to the front', () => {
    const { values, store } = setup();

    values['recent'] = ['a', 'b', 'c'];

    createHistory(store, keys).rememberSpace('b');

    expect(values['recent']).toEqual(['b', 'a', 'c']);
  });

  test('caps the list', () => {
    const { values, store } = setup();

    values['recent'] = Array.from({ length: 50 }, (_item, index) => `s${index}`);

    createHistory(store, keys).rememberSpace('s0');

    expect((values['recent'] as string[]).length).toBe(50);
    expect((values['recent'] as string[])[0]).toBe('s0');
  });
});

describe('rememberPane', () => {
  test('drops tabs that are gone and records the new one', () => {
    const { values, setLive, store } = setup();

    values['focus'] = { gone: 'p1', live: 'p2' };
    setLive(['live']);

    createHistory(store, keys).rememberPane('live', 'p3');

    expect(values['focus']).toEqual({ live: 'p3' });
  });
});
