export interface FoldedSet {
  has: (item: string) => boolean;
  toggle: (item: string) => void;
}

export interface FoldedStore {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

const readStrings = (value: string | null): Set<string> => {
  const stored: unknown = JSON.parse(value ?? '[]');

  return new Set(
    Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [],
  );
};

const toggled = (set: Set<string>, item: string): void => {
  if (set.has(item)) {
    set.delete(item);
  } else {
    set.add(item);
  }
};

export const foldedSet = (key: string, store: FoldedStore): FoldedSet => {
  const items = readStrings(store.get(key));

  return {
    has: (item) => items.has(item),
    toggle: (item) => {
      toggled(items, item);
      store.set(key, JSON.stringify([...items]));
    },
  };
};
