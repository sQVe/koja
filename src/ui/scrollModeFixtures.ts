import { createRowCache } from '../client/client.ts';
import type { InputMode, StoreSnapshot } from '../client/client.ts';
import { paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { cellWords, CursorShape, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import { createScrollMode } from './scrollMode.ts';
import type { ScrollMode, ScrollModeSession } from './scrollMode.ts';

interface ExternalState {
  topRow: number | undefined;
  focused: number;
  inputMode: InputMode;
  removed: number | undefined;
  cached: boolean;
}

interface ScrollHarness {
  mode: ScrollMode;
  scrolls: ('bottom' | number)[];
  scrolled: PaneId[];
  modes: InputMode[];
  show: (next: { topRow?: number | undefined; focused?: number; removePane?: number }) => void;
  supply: (rows: readonly number[]) => void;
  cache: ReturnType<typeof createRowCache>;
  arrive: (update: RowUpdate) => void;
  answer: () => Promise<void>;
  external: ExternalState;
  fetchedNow: (pane?: number) => void;
}

interface Counted {
  calls: { count: number; cursors: ReturnType<ScrollMode['cursor']>[] };
  unsubscribe: () => void;
  notifiedBy: (action: () => void) => number;
}

export const columns = 8;

export const height = 3;

export const activeTop = 100;

export const oldest = 95;

const screenRows = [activeTop, activeTop + 1, activeTop + 2];

const allRows = Array.from(
  { length: activeTop + screenRows.length - oldest },
  (_, index) => oldest + index,
);

// One row per line, from the oldest history row to the last row of the screen.
const lines = ['p95', 'p96', 'p97', 'p98', 'p99', 'a100', 'a101', 'a102'];

export const updateOf = (shown: readonly number[]): RowUpdate => {
  const stride = rowWords(columns);
  const cells = new Uint32Array(shown.length * stride);

  for (const [index, row] of shown.entries()) {
    cells[index * stride] = (row - activeTop) >>> 0;

    for (const [column, character] of (lines[row - oldest] ?? '').split('').entries()) {
      cells[index * stride + rowHeaderWords + column * cellWords] = character.codePointAt(0) ?? 0;
    }
  }

  return {
    pane: 1,
    sequence: 1,
    size: { columns, rows: height },
    cursor: { x: 1, y: 2, visible: true, shape: CursorShape.default, blinking: false },
    modes: 0,
    epoch: 1,
    first: oldest,
    activeTop,
    rowCount: shown.length,
    cells,
    graphemes: new Uint32Array(),
    colors: new Uint32Array(),
  };
};

export const snapshotWith = (
  topRow: number | undefined,
  focused = 1,
  removed?: number,
): StoreSnapshot => ({
  revision: 1,
  workspaces: [{ id: workspaceId(1), root: '/work', label: 'work', tabIds: [tabId(1)] }],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout: { kind: 'pane', paneId: paneId(1) },
      arrangement: { choice: 'legacy', order: [paneId(1)] },
      focusedPaneId: paneId(focused),
      zoomedPaneId: undefined,
      label: undefined,
    },
  ],
  panes: [1, 2]
    .filter((number) => number !== removed)
    .map((number) => ({
      id: paneId(number),
      tabId: tabId(1),
      lifecycle: 'running' as const,
      generation: 1,
      size: { columns, rows: height },
      exitCode: undefined,
      startFolder: undefined,
      restored: true,
      error: undefined,
    })),
  defaultView: {
    focusedWorkspaceId: workspaceId(1),
    activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(1) }],
    scrolls: topRow === undefined ? [] : [{ paneId: paneId(1), topRow }],
  },
  attachedClientId: undefined,
  foregroundClientId: undefined,
  clients: [],
});

export const start = (
  shown: readonly number[] = allRows,
  topRow?: number,
  rowLimit = 100,
): ScrollHarness => {
  const cache = createRowCache({ rowLimit });
  const scrolls: ('bottom' | number)[] = [];
  const scrolled: PaneId[] = [];
  const modes: InputMode[] = [];
  const fetched = new Set<(pane: PaneId) => void>();
  const arrived = new Set<(changed: { pane: PaneId; rows: number[]; sequence: number }) => void>();
  const changed = new Set<() => void>();
  const answers: (() => void)[] = [];

  const external: ExternalState = {
    topRow,
    focused: 1,
    inputMode: 'scroll',
    removed: undefined,
    cached: true,
  };

  cache.apply(updateOf(shown));

  const session: ScrollModeSession = {
    getState: () => ({
      snapshot: snapshotWith(external.topRow, external.focused, external.removed),
      inputMode: external.inputMode,
    }),
    rowCache: () => (external.cached ? cache : undefined),
    scrollPane: (pane, to) => {
      const answer = Promise.withResolvers<undefined>();

      scrolled.push(pane);
      scrolls.push(to);

      answers.push(() => {
        answer.resolve(undefined);
      });

      return answer.promise;
    },
    setInputMode: (mode) => {
      modes.push(mode);
      external.inputMode = mode;
    },
    subscribe: (listener) => {
      changed.add(listener);

      return () => changed.delete(listener);
    },
    subscribeRows: (listener) => {
      arrived.add(listener);

      return () => arrived.delete(listener);
    },
    subscribeFetched: (listener) => {
      fetched.add(listener);

      return () => fetched.delete(listener);
    },
  };

  const mode = createScrollMode(session);

  // The server's answer: the view the snapshot shows, and who is focused.
  const show = (next: {
    topRow?: number | undefined;
    focused?: number;
    removePane?: number;
  }): void => {
    external.removed = next.removePane ?? external.removed;

    if ('topRow' in next) {
      external.topRow = next.topRow;
    }

    external.focused = next.focused ?? external.focused;

    for (const listener of changed) {
      listener();
    }
  };

  // The server answers the oldest request, after its change reached the snapshot.
  const fetchedNow = (pane = 1): void => {
    for (const listener of fetched) {
      listener(paneId(pane));
    }
  };

  // Rows arrive in the cache, then the rows event reports.
  const arrive = (update: RowUpdate): void => {
    cache.apply(update);

    for (const listener of arrived) {
      listener({ pane: paneId(update.pane), rows: [], sequence: update.sequence });
    }
  };

  const answer = async (): Promise<void> => {
    answers.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  };

  // Rows arrive in the cache, then the fetch reports.
  const supply = (rows: readonly number[]): void => {
    arrive(updateOf([...rows, ...screenRows]));

    for (const listener of fetched) {
      listener(paneId(1));
    }
  };

  return {
    mode,
    scrolls,
    scrolled,
    modes,
    show,
    supply,
    cache,
    arrive,
    answer,
    external,
    fetchedNow,
  };
};

export const counted = (mode: ScrollMode): Counted => {
  const calls: Counted['calls'] = { count: 0, cursors: [] };

  const unsubscribe = mode.subscribe(() => {
    calls.count += 1;
    calls.cursors.push(mode.cursor());
  });

  const notifiedBy = (action: () => void): number => {
    const before = calls.count;

    action();

    return calls.count - before;
  };

  return { calls, unsubscribe, notifiedBy };
};
