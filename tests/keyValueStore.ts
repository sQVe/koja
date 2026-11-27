import type { KeyValueStore } from '../src/mods/koja-spaces/storage.ts';

interface KeyValueStoreFixture {
  values: Record<string, string>;
  store: KeyValueStore;
}

export const keyValueStore = (initial: Record<string, string> = {}): KeyValueStoreFixture => {
  const values = { ...initial };

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
