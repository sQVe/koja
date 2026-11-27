import type { KeyValueStore } from '../src/mods/koja-spaces/storage.ts';

interface MemoryStore {
  values: Record<string, string>;
  store: KeyValueStore;
}

export const memoryStore = (initial: Record<string, string> = {}): MemoryStore => {
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
