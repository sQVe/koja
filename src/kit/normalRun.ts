export interface SharedStore {
  shared: (key: string) => unknown;
  setShared: (key: string, value: unknown) => unknown;
}

export interface NormalRunHost extends SharedStore {
  run: (command: string, args?: Record<string, unknown>) => unknown;
}

export const normalModeKey = 'koja-modal';

export const inNormalMode = (shared: SharedStore['shared']): boolean =>
  shared(normalModeKey) === true;

const pendingKeysKey = 'koja-modal.pending-keys';

const isKeyList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((key) => typeof key === 'string');

// Normal mode takes pending keys when it starts, so with normal mode off, opening it runs them.
export const runNormalKeys = (host: NormalRunHost, keys: readonly string[]): void => {
  host.setShared(pendingKeysKey, [...keys]);

  if (inNormalMode((key: string) => host.shared(key))) {
    host.run('koja-modal.run-keys');

    return;
  }

  host.run('mod.open', { name: 'koja-modal' });
};

export const takeNormalKeys = (store: SharedStore): string[] | null => {
  const stored = store.shared(pendingKeysKey);

  if (stored === undefined || stored === null) {
    return null;
  }

  store.setShared(pendingKeysKey, null);

  return isKeyList(stored) ? stored : null;
};
