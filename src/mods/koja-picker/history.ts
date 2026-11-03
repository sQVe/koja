export interface HistoryKeys {
  recent: string;
  focus: string;
}

export interface HistoryStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  liveTabs: () => ReadonlySet<string>;
}

export interface PickerHistory {
  recent: () => string[];
  focus: () => Record<string, string>;
  rememberSpace: (space: string) => void;
  rememberPane: (tab: string, pane: string) => void;
}

const recentLimit = 50;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const stringRecord = (value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).flatMap(([key, item]) =>
    typeof item === 'string' ? [[key, item] as const] : [],
  );

  return Object.fromEntries(entries);
};

export const createHistory = (store: HistoryStore, keys: HistoryKeys): PickerHistory => ({
  recent: () => stringList(store.get(keys.recent)),
  focus: () => stringRecord(store.get(keys.focus)),
  rememberSpace: (space) => {
    const recent = stringList(store.get(keys.recent)).filter((saved) => saved !== space);

    store.set(keys.recent, [space, ...recent].slice(0, recentLimit));
  },
  rememberPane: (tab, pane) => {
    const live = store.liveTabs();

    const kept = Object.entries(stringRecord(store.get(keys.focus))).filter(([id]) => live.has(id));

    store.set(keys.focus, { ...Object.fromEntries(kept), [tab]: pane });
  },
});
