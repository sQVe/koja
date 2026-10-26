import { shownTargetOf } from '../actions.ts';
import type { ActionCatalog, ActionEntry, ActionIntent, ActionViewKind } from '../actions.ts';
import type { StoreSnapshot } from '../client/client.ts';
import { isKey, keyText } from './keyEncoding.ts';
import type { KeyEvent } from './keyEncoding.ts';

export type ActionViewState =
  | { kind: 'closed' }
  | { kind: 'help'; top: number }
  | { kind: 'search'; query: string; selected: number; top: number };

export type ActionViewInput =
  | { kind: 'key'; event: KeyEvent }
  | { kind: 'paste'; bytes: Uint8Array };

export interface ActionView {
  subscribe: (listener: () => void) => () => void;
  getState: () => ActionViewState;
  open: (kind: ActionViewKind) => void;
  interact: (
    input: ActionViewInput,
    catalog: ActionCatalog,
    snapshot: StoreSnapshot,
  ) => ActionIntent | undefined;
}

export interface ActionViewLine {
  id: string;
  title: string;
  key: string;
  unavailable: boolean;
  selected: boolean;
}

type ViewKey =
  | { kind: 'close' }
  | { kind: 'run' }
  | { kind: 'move'; offset: 1 | -1 }
  | { kind: 'deleteBack' }
  | { kind: 'type'; text: string }
  | { kind: 'ignore' };

const decoder = new TextDecoder();

const clampIndex = (index: number, count: number): number =>
  Math.min(Math.max(index, 0), Math.max(count - 1, 0));

export const actionViewRowsOf = (terminalRows: number): number => Math.max(terminalRows - 2, 0);

const isSearchQuery = (
  state: ActionViewState,
): state is Extract<ActionViewState, { kind: 'search' }> => state.kind === 'search';

const searchEntries = (catalog: ActionCatalog, query: string): ActionCatalog => {
  const words = query.toLowerCase().split(/\s+/);

  return catalog.filter((entry) => {
    const title = entry.title.toLowerCase();
    const id = entry.id.toLowerCase();

    return words.every((word) => title.includes(word) || id.includes(word));
  });
};

const shownEntries = (catalog: ActionCatalog, state: ActionViewState): ActionCatalog => {
  if (state.kind === 'help') {
    return catalog;
  }

  return state.kind === 'search' ? searchEntries(catalog, state.query) : [];
};

const lineOf = (
  entry: ActionEntry,
  snapshot: StoreSnapshot,
  selected: boolean,
): ActionViewLine => ({
  id: entry.id,
  title: entry.title,
  key: entry.keys.join(' '),
  unavailable: !entry.available(snapshot, shownTargetOf(snapshot)),
  selected,
});

const topOf = (state: ActionViewState, count: number, rows: number): number => {
  if (state.kind === 'closed') {
    return 0;
  }

  const top = Math.min(Math.max(state.top, 0), Math.max(count - rows, 0));

  if (!isSearchQuery(state)) {
    return top;
  }

  return Math.min(Math.max(top, state.selected - rows + 1), state.selected);
};

export const actionViewLines = (
  catalog: ActionCatalog,
  snapshot: StoreSnapshot,
  state: ActionViewState,
  rows: number,
): ActionViewLine[] => {
  const entries = shownEntries(catalog, state);
  const top = topOf(state, entries.length, rows);

  return entries
    .map((entry, index) =>
      lineOf(entry, snapshot, isSearchQuery(state) && index === state.selected),
    )
    .slice(top, top + rows);
};

const selectedEntry = (catalog: ActionCatalog, state: ActionViewState): ActionEntry | undefined => {
  if (!isSearchQuery(state)) {
    return undefined;
  }

  return searchEntries(catalog, state.query)[state.selected];
};

export const viewKeyOf = (event: KeyEvent): ViewKey => {
  if (event.kind === 'release') {
    return { kind: 'ignore' };
  }

  if (isKey(event, 'escape')) {
    return { kind: 'close' };
  }

  if (isKey(event, 'enter')) {
    return { kind: 'run' };
  }

  if (isKey(event, 'up')) {
    return { kind: 'move', offset: -1 };
  }

  if (isKey(event, 'down')) {
    return { kind: 'move', offset: 1 };
  }

  if (isKey(event, 'backspace')) {
    return { kind: 'deleteBack' };
  }

  const text = keyText(event);

  return text === undefined ? { kind: 'ignore' } : { kind: 'type', text };
};

const pastedQueryText = (bytes: Uint8Array): string =>
  decoder.decode(bytes).replace(/\p{Cc}/gu, ' ');

export const createActionView = (entryRows: () => number): ActionView => {
  let state: ActionViewState = { kind: 'closed' };
  const listeners = new Set<() => void>();

  const setState = (next: ActionViewState): void => {
    state = next;

    for (const listener of listeners) {
      listener();
    }
  };

  const append = (text: string): void => {
    if (isSearchQuery(state)) {
      setState({ ...state, query: state.query + text, selected: 0, top: 0 });
    }
  };

  const deleteBack = (): void => {
    if (isSearchQuery(state)) {
      const query = Array.from(state.query).slice(0, -1).join('');

      setState({ ...state, query, selected: 0, top: 0 });
    }
  };

  const move = (offset: 1 | -1, catalog: ActionCatalog): void => {
    if (state.kind === 'closed') {
      return;
    }

    const rows = entryRows();
    const count = shownEntries(catalog, state).length;
    const top = topOf(state, count, rows);

    const next: ActionViewState = isSearchQuery(state)
      ? { ...state, selected: clampIndex(state.selected + offset, count), top }
      : { kind: 'help', top: top + offset };

    setState({ ...next, top: topOf(next, count, rows) });
  };

  const runSelected = (
    catalog: ActionCatalog,
    snapshot: StoreSnapshot,
  ): ActionIntent | undefined => {
    const entry = selectedEntry(catalog, state);

    if (entry === undefined || !entry.available(snapshot, shownTargetOf(snapshot))) {
      return undefined;
    }

    if (entryRows() < 1) {
      return undefined;
    }

    setState({ kind: 'closed' });

    return entry.intent;
  };

  const pressKey = (
    event: KeyEvent,
    catalog: ActionCatalog,
    snapshot: StoreSnapshot,
  ): ActionIntent | undefined => {
    const key = viewKeyOf(event);

    if (key.kind === 'close') {
      setState({ kind: 'closed' });
    }

    if (key.kind === 'run') {
      return runSelected(catalog, snapshot);
    }

    if (key.kind === 'move') {
      move(key.offset, catalog);
    }

    if (key.kind === 'deleteBack') {
      deleteBack();
    }

    if (key.kind === 'type') {
      append(key.text);
    }

    return undefined;
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    open: (kind) => {
      setState(
        kind === 'help'
          ? { kind: 'help', top: 0 }
          : { kind: 'search', query: '', selected: 0, top: 0 },
      );
    },
    interact: (input, catalog, snapshot) => {
      if (input.kind === 'key') {
        return pressKey(input.event, catalog, snapshot);
      }

      append(pastedQueryText(input.bytes));

      return undefined;
    },
  };
};
