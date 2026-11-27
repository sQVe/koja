export type SavedGlobals = Map<string, PropertyDescriptor | undefined>;

export const saveGlobals = (names: readonly string[]): SavedGlobals => {
  const saved: SavedGlobals = new Map();

  for (const name of names) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }

  return saved;
};

export const restoreGlobals = (saved: SavedGlobals): void => {
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);

      continue;
    }

    Object.defineProperty(globalThis, name, descriptor);
  }

  saved.clear();
};
