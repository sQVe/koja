import { expect, it } from 'bun:test';

import { createRowCache } from '../client/client.ts';
import type { InputMode, StoreSnapshot } from '../client/client.ts';
import { paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { CellWidth, cellWords, CursorShape, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import { createScrollMode } from './scrollMode.ts';
import type { ScrollModeSession } from './scrollMode.ts';

const columns = 8;

const height = 3;

const activeTop = 100;

const oldest = 95;

// One row per line, from the oldest history row to the last row of the screen.
const lines = ['p95', 'p96', 'p97', 'p98', 'p99', 'a100', 'a101', 'a102'];

const updateOf = (shown: readonly number[]): RowUpdate => {
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

const snapshotWith = (
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

const start = (
  shown: readonly number[] = [95, 96, 97, 98, 99, 100, 101, 102],
  topRow?: number,
  rowLimit = 100,
) => {
  const cache = createRowCache({ rowLimit });
  const scrolls: ('bottom' | number)[] = [];
  const scrolled: PaneId[] = [];
  const modes: InputMode[] = [];
  const fetched = new Set<(pane: PaneId) => void>();
  const arrived = new Set<(changed: { pane: PaneId; rows: number[]; sequence: number }) => void>();
  const changed = new Set<() => void>();
  const answers: (() => void)[] = [];

  const external = {
    topRow,
    focused: 1,
    inputMode: 'scroll' as InputMode,
    removed: undefined as number | undefined,
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
  const show = (next: { topRow?: number; focused?: number; removePane?: number }): void => {
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
    arrive(updateOf([...rows, 100, 101, 102]));

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

it('enters at the pane cursor without moving the view', () => {
  const { mode, scrolls } = start();

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 102, col: 1 });
  expect(scrolls).toEqual([]);
});

it('scrolls the view up only when the cursor leaves it, and keeps scrolling from its own top', () => {
  const { mode, scrolls } = start();

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(scrolls).toEqual([]);

  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toMatchObject({ row: 98 });
  expect(scrolls).toEqual([99, 98]);
});

it('keeps the view still on k while output advances a following view after entry', () => {
  const { mode, arrive, scrolls } = start();

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101, 102]), activeTop: activeTop + 8 });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 109, col: 1 });
  expect(scrolls).toEqual([]);
});

it('sends G to the bottom after the CLI scrolled a following view to the top', () => {
  const { mode, scrolls, show } = start();

  mode.handle({ kind: 'enter' });
  show({ topRow: 0 });
  mode.handle({ kind: 'move', motion: 'historyBottom' });

  expect(mode.cursor()).toMatchObject({ row: 102 });
  expect(scrolls).toEqual(['bottom']);
});

it('returns the view to the bottom on G, even when it was scrolled at entry', () => {
  const { mode, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });

  expect(mode.cursor()).toMatchObject({ row: 102 });
  expect(scrolls).toEqual(['bottom']);
});

it('restores the view from entry on leaving, whichever key leaves', () => {
  const followed = start();

  followed.mode.handle({ kind: 'enter' });
  followed.mode.handle({ kind: 'move', motion: 'historyTop' });
  followed.mode.handle({ kind: 'leave' });

  expect(followed.scrolls).toEqual([95, 'bottom']);
  expect(followed.mode.cursor()).toBeUndefined();

  const pinned = start(undefined, 97);

  pinned.mode.handle({ kind: 'enter' });
  pinned.mode.handle({ kind: 'move', motion: 'historyTop' });
  pinned.mode.handle({ kind: 'leave' });

  expect(pinned.scrolls).toEqual([95, 97]);

  const unmoved = start(undefined, 97);

  unmoved.mode.handle({ kind: 'enter' });
  unmoved.mode.handle({ kind: 'leave' });

  expect(unmoved.scrolls).toEqual([]);
});

it('restores the entry view after G took the view to the bottom', () => {
  const { mode, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });
  mode.handle({ kind: 'leave' });

  expect(scrolls).toEqual(['bottom', 97]);
});

it('enters at the bottom-left of a view the CLI already scrolled', () => {
  const { mode } = start(undefined, 97);

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 99, col: 0 });
});

it('suspends on focus loss and resumes with the same cursor and view on refocus', async () => {
  const { mode, scrolls, scrolled, modes, show, answer } = start();

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });
  await answer();

  const before = mode.cursor();

  show({ focused: 2 });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });
  mode.handle({ kind: 'leave' });

  expect(modes).toEqual(['insert']);
  expect(mode.cursor()).toBeUndefined();
  expect(scrolled).toEqual([paneId(1)]);
  expect(scrolls).toEqual([99]);

  show({ focused: 1 });

  expect(modes).toEqual(['insert', 'scroll']);
  expect(mode.cursor()).toEqual(before);

  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toMatchObject({ row: (before?.row ?? 0) - 1 });
});

it('does not run a waiting motion on a pane that lost focus until it is focused again', () => {
  const { mode, scrolled, show, supply } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  show({ focused: 2 });
  supply([95, 96, 97, 98, 99]);

  expect(scrolled).toEqual([paneId(1)]);
  expect(mode.cursor()).toBeUndefined();

  show({ focused: 1 });

  expect(mode.cursor()).toMatchObject({ row: 95, col: 2 });
});

it('follows a CLI scroll after the server normalized an earlier move to another row', async () => {
  const { mode, scrolls, show, answer } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  show({ topRow: 96 });
  await answer();
  show({ topRow: 98 });
  mode.handle({ kind: 'move', motion: 'pageDown' });

  expect(scrolls.at(-1)).toBe(99);
});

it('restores the entry distance from the bottom, not the entry row, after output advances', async () => {
  {
    const { mode, arrive, show, scrolls, answer } = start(undefined, 97);

    mode.handle({ kind: 'enter' });
    mode.handle({ kind: 'move', motion: 'historyTop' });
    show({ topRow: 95 });
    await answer();
    arrive({ ...updateOf([100, 101, 102]), activeTop: 110 });
    mode.handle({ kind: 'leave' });

    expect(scrolls.at(-1)).toBe(107);
  }
});

it('waits for the rows a motion needs, then reaches the target a full cache gives', () => {
  const { mode, supply } = start([100, 101, 102]);
  const reached: unknown[] = [];

  mode.subscribe(() => {
    reached.push(mode.reach(paneId(1)));
  });

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'wordStart' });
  mode.handle({ kind: 'move', motion: 'wordStartPrevious' });

  expect(mode.cursor()).toMatchObject({ row: 95, col: 1 });
  expect(mode.reach(paneId(1))).toEqual({ from: 95, to: 95 });

  supply([95, 96, 97, 98, 99]);
  expect(mode.cursor()).toMatchObject({ row: 95, col: 0 });
  expect(mode.reach(paneId(1))).toBeUndefined();
});

it('keeps a waiting motion when an older fetch for the same pane ends first', () => {
  const { mode, supply } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  supply([100]);
  expect(mode.cursor()).toMatchObject({ row: 95, col: 1 });

  supply([95, 96, 97]);
  expect(mode.cursor()).toMatchObject({ row: 95, col: 2 });
});

it('gives up on a motion whose rows repeated fetches did not supply, and runs the next one', () => {
  const { mode, supply } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  mode.handle({ kind: 'move', motion: 'right' });
  supply([]);
  supply([]);
  supply([]);

  expect(mode.cursor()).toMatchObject({ row: 95, col: 2 });
});

it('asks for a bounded range of rows however far the motion travels', () => {
  const { mode, arrive } = start();

  arrive({ ...updateOf([100, 101, 102]), first: 0, activeTop: 100_000 });
  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'paragraphPrevious' });

  const range = mode.reach(paneId(1));

  expect(range).toBeDefined();
  expect((range?.to ?? 0) - (range?.from ?? 0) + 1).toBeLessThanOrEqual(256);
  expect(range?.to).toBe(99_999);
});

// Rows 0 to 11999 are one soft-wrapped word and row 12000 starts the next. The screen starts at row
// 12100.
const textOfLongRow = (row: number): string => {
  if (row < 12_000) {
    return 'abcdefgh';
  }

  return row === 12_000 ? 'zz' : '';
};

const longUpdate = (shown: readonly number[]): RowUpdate => {
  const longTop = 12_100;
  const base = updateOf([]);
  const stride = rowWords(columns);
  const cells = new Uint32Array(shown.length * stride);

  for (const [index, row] of shown.entries()) {
    const text = textOfLongRow(row);

    cells[index * stride] = (row - longTop) >>> 0;
    cells[index * stride + 1] = row < 11_999 ? 1 : 0;

    for (const [column, character] of text.split('').entries()) {
      cells[index * stride + rowHeaderWords + column * cellWords] = character.codePointAt(0) ?? 0;
    }
  }

  return { ...base, first: 0, activeTop: longTop, rowCount: shown.length, cells };
};

it('crosses a word longer than the row cache limit and then runs the queued motions', () => {
  const { mode, arrive, fetchedNow } = start([100, 101, 102], undefined, 300);

  arrive(longUpdate([12_100, 12_101, 12_102]));
  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'wordStart' });
  mode.handle({ kind: 'move', motion: 'right' });

  for (let round = 0; round < 100 && mode.reach(paneId(1)) !== undefined; round += 1) {
    const range = mode.reach(paneId(1));

    const supplied = Array.from(
      { length: (range?.to ?? 0) - (range?.from ?? 0) + 1 },
      (_, offset) => (range?.from ?? 0) + offset,
    );

    arrive(longUpdate([...supplied, 12_100, 12_101, 12_102]));
    fetchedNow();
  }

  expect(mode.cursor()).toMatchObject({ row: 12_000, col: 1 });
});

it("keeps another pane's mode when a suspended pane is removed", () => {
  const { mode, show, external } = start();

  mode.handle({ kind: 'enter' });
  show({ focused: 2 });
  external.inputMode = 'normal';
  show({ removePane: 1 });

  expect(external.inputMode).toBe('normal');
  expect(mode.cursor()).toBeUndefined();
});

it('keeps the view still when a CLI scroll during the wait already shows the target', () => {
  const { mode, show, supply, scrolls } = start([100, 101, 102], 95);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'wordStart' });
  expect(mode.reach(paneId(1))).toBeDefined();
  scrolls.length = 0;
  show({ topRow: 96 });
  supply([95, 96, 97, 98, 99]);

  expect(mode.cursor()).toMatchObject({ row: 96, col: 0 });
  expect(scrolls).toEqual([]);
});

it('keeps the view still when a CLI scroll during the wait shows the cursor and no word follows', () => {
  const { mode, arrive, show, fetchedNow, scrolls } = start([98], 96);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'wordStart' });
  expect(mode.reach(paneId(1))).toBeDefined();
  show({ topRow: 97 });

  const blank = updateOf([99, 100, 101, 102]);
  const stride = rowWords(columns);

  for (let index = 0; index < blank.rowCount; index++) {
    blank.cells.fill(0, index * stride + rowHeaderWords, (index + 1) * stride);
  }

  arrive(blank);
  fetchedNow();

  expect(mode.cursor()).toMatchObject({ row: 98, col: 0 });
  expect(scrolls).toEqual([]);
});

const reflowUpdate = (width: number, epoch: number, rows: [number, string][]): RowUpdate => {
  const stride = rowWords(width);
  const cells = new Uint32Array(rows.length * stride);

  for (const [index, [number, text]] of rows.entries()) {
    cells[index * stride] = (number - activeTop) >>> 0;
    cells[index * stride + 1] = number === 95 ? 1 : 0;

    for (const [column, character] of Array.from(text).entries()) {
      cells[index * stride + rowHeaderWords + column * cellWords] = character.codePointAt(0) ?? 0;
    }
  }

  return {
    ...updateOf([]),
    epoch,
    size: { columns: width, rows: height },
    rowCount: rows.length,
    cells,
  };
};

it('starts a waiting word motion again when a reflow changes the epoch', () => {
  const { mode, arrive, fetchedNow } = start([95, 100, 101, 102], 95);

  arrive(
    reflowUpdate(8, 1, [
      [95, 'one'],
      [100, ''],
      [101, ''],
      [102, ''],
    ]),
  );

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'wordStart' });
  expect(mode.reach(paneId(1))).toMatchObject({ from: 96 });

  arrive(
    reflowUpdate(16, 2, [
      [95, 'one     two'],
      [96, 'three'],
      [100, ''],
      [101, ''],
      [102, ''],
    ]),
  );

  fetchedNow();

  expect(mode.cursor()).toMatchObject({ row: 95, col: 8 });
});

it('keeps the cursor inside the pane when the pane narrows', () => {
  const { mode, arrive } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.cursor()).toMatchObject({ row: 102, col: 3 });

  arrive(
    reflowUpdate(2, 2, [
      [100, 'a1'],
      [101, 'a1'],
      [102, 'a1'],
    ]),
  );

  expect(mode.cursor()).toMatchObject({ row: 102, col: 1 });
});

it('falls back to normal mode when there is no pane to scroll', () => {
  const cache = createRowCache({ rowLimit: 10 });
  const modes: InputMode[] = [];

  const mode = createScrollMode({
    getState: () => ({ snapshot: snapshotWith(undefined), inputMode: 'scroll' }),
    rowCache: () => cache,
    scrollPane: () => Promise.resolve(),
    setInputMode: (next) => {
      modes.push(next);
    },
    subscribe: () => () => undefined,
    subscribeRows: () => () => undefined,
    subscribeFetched: () => () => undefined,
  });

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toBeUndefined();
  expect(modes).toEqual(['normal']);
});

it('starts a waiting motion again when pruning removed the row it waits for', () => {
  const { mode, arrive, fetchedNow } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.reach(paneId(1))).toEqual({ from: 95, to: 95 });

  arrive({ ...updateOf([100, 101, 102]), sequence: 2, first: 98 });

  expect(mode.reach(paneId(1))).toMatchObject({ from: 98 });

  arrive({ ...updateOf([98, 99, 100, 101, 102]), sequence: 3, first: 98 });
  fetchedNow();

  expect(mode.cursor()).toMatchObject({ row: 98, col: 2 });
  expect(mode.reach(paneId(1))).toBeUndefined();

  mode.handle({ kind: 'move', motion: 'lineStart' });

  expect(mode.cursor()).toMatchObject({ row: 98, col: 0 });
});

it('runs a subscriber that reads scroll state once per notice when output prunes the waiting row', () => {
  const { mode, arrive, fetchedNow } = start([100, 101, 102]);
  const calls = { count: 0, depth: 0, deepest: 0 };

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.reach(paneId(1))).toEqual({ from: 95, to: 95 });

  mode.subscribe(() => {
    calls.count += 1;
    calls.depth += 1;
    calls.deepest = Math.max(calls.deepest, calls.depth);
    mode.reach(paneId(1));
    mode.cursor();
    calls.depth -= 1;
  });

  arrive({ ...updateOf([100, 101, 102]), sequence: 2, first: 98 });

  expect(calls.count).toBe(1);

  fetchedNow();

  expect(calls.count).toBe(2);
  expect(calls.deepest).toBe(1);
  expect(mode.reach(paneId(1))).toEqual({ from: 98, to: 102 });
});

const counted = (mode: ReturnType<typeof start>['mode']) => {
  const calls = { count: 0, cursors: [] as ReturnType<typeof mode.cursor>[] };

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

it('notifies subscribers when the mode begins, moves, and ends, until they unsubscribe', () => {
  const { mode } = start();
  const { calls, unsubscribe, notifiedBy } = counted(mode);

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'enter' });
    }),
  ).toBeGreaterThan(0);

  expect(calls.cursors.at(-1)).toEqual({ pane: paneId(1), row: 102, col: 1 });

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'move', motion: 'up' });
    }),
  ).toBeGreaterThan(0);

  expect(calls.cursors.at(-1)).toEqual({ pane: paneId(1), row: 101, col: 1 });

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'leave' });
    }),
  ).toBeGreaterThan(0);

  expect(calls.cursors.at(-1)).toBeUndefined();

  unsubscribe();

  const heard = calls.count;

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'leave' });

  expect(calls.count).toBe(heard);
});

it('resumes a mode that entering finds on the same pane, with its cursor', () => {
  const { mode, show, modes, external } = start();
  const { notifiedBy } = counted(mode);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'right' });

  const before = mode.cursor();

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'enter' });
    }),
  ).toBeGreaterThan(0);

  expect(mode.cursor()).toEqual(before);

  show({ focused: 2 });
  external.focused = 1;
  external.inputMode = 'scroll';
  mode.handle({ kind: 'enter' });
  show({ focused: 2 });

  expect(modes).toEqual(['insert', 'insert']);
});

it("restores the old pane's view when entering on another pane", () => {
  const { mode, scrolls, scrolled, external } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  external.focused = 2;
  mode.handle({ kind: 'enter' });

  expect(scrolled).toEqual([paneId(1), paneId(1)]);
  expect(scrolls).toEqual([95, 97]);
  expect(mode.cursor()).toMatchObject({ pane: paneId(2) });
});

it('enters at the bottom-left cell when the pane cursor is hidden', () => {
  const { mode, arrive } = start();

  arrive({
    ...updateOf([95, 96, 97, 98, 99, 100, 101, 102]),
    cursor: { x: 1, y: 2, visible: false, shape: CursorShape.default, blinking: false },
  });

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 102, col: 0 });
});

it('keeps the cursor row while output advances a scrolled view', () => {
  const { mode, arrive } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101, 102]), activeTop: activeTop + 8 });

  expect(mode.cursor()).toMatchObject({ row: 99 });
});

it('builds keys typed before the server answers on the requested top', () => {
  const { mode, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(scrolls).toEqual(['bottom']);
  expect(mode.cursor()).toMatchObject({ row: 101 });
});

it('keeps building on the requested top until every request is answered', async () => {
  const { mode, scrolls, answer } = start();

  mode.handle({ kind: 'enter' });

  for (let count = 0; count < 4; count += 1) {
    mode.handle({ kind: 'move', motion: 'up' });
  }

  expect(scrolls).toEqual([99, 98]);

  await answer();
  mode.handle({ kind: 'move', motion: 'down' });

  expect(scrolls).toEqual([99, 98]);
  expect(mode.cursor()).toMatchObject({ row: 99 });
});

it('keeps the cursor and does not throw when the pane has no row cache', () => {
  const { mode, external } = start();

  mode.handle({ kind: 'enter' });
  external.cached = false;

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 102, col: 1 });
});

it('ends the mode and returns to insert mode when a motion finds the row cache gone', () => {
  const { mode, scrolls, modes, external } = start(undefined, 97);
  const { notifiedBy } = counted(mode);

  mode.handle({ kind: 'enter' });
  external.cached = false;

  const heard = notifiedBy(() => {
    mode.handle({ kind: 'move', motion: 'up' });
  });

  expect(heard).toBeGreaterThan(0);
  expect(modes).toEqual(['insert']);
  expect(mode.cursor()).toBeUndefined();
  expect(scrolls).toEqual([]);
});

it('falls back to normal mode when the focused pane is gone or has no row cache', () => {
  const gone = start();

  gone.external.removed = 1;
  gone.mode.handle({ kind: 'enter' });

  expect(gone.modes).toEqual(['normal']);
  expect(gone.mode.cursor()).toBeUndefined();

  const uncached = start();

  uncached.external.cached = false;
  uncached.mode.handle({ kind: 'enter' });

  expect(uncached.modes).toEqual(['normal']);
  expect(uncached.mode.cursor()).toBeUndefined();
});

it('leaves to the bottom when no history is left above the active top', () => {
  const { mode, arrive, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101, 102]), sequence: 2, first: activeTop });
  mode.handle({ kind: 'leave' });

  expect(scrolls).toEqual([]);
});

it('starts a motion from a row clamped into a pane that shrank', () => {
  const { mode, arrive } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101]), sequence: 2, size: { columns, rows: 2 } });
  mode.handle({ kind: 'move', motion: 'lineStart' });

  expect(mode.cursor()).toMatchObject({ row: 101, col: 0 });
});

it('runs queued motions only once the pane is focused again, even after the wait ended', () => {
  const { mode, scrolls, show, supply } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });
  show({ focused: 2 });
  supply([95, 96, 97, 98, 99]);

  expect(scrolls).toEqual([95]);

  show({ focused: 1 });

  expect(scrolls).toEqual([95, 'bottom']);
});

it('ends the mode and returns to insert mode when the shown pane is removed', () => {
  const { mode, modes, show, external } = start();
  const { notifiedBy } = counted(mode);

  mode.handle({ kind: 'enter' });

  expect(
    notifiedBy(() => {
      show({ removePane: 1 });
    }),
  ).toBeGreaterThan(0);

  expect(modes).toEqual(['insert']);
  expect(mode.cursor()).toBeUndefined();

  external.removed = undefined;
  show({});

  expect(modes).toEqual(['insert']);
});

it('leaves a mode that is not scroll alone when the shown pane is removed', () => {
  const { mode, modes, show, external } = start();

  mode.handle({ kind: 'enter' });
  external.inputMode = 'normal';
  show({ removePane: 1 });

  expect(modes).toEqual([]);
});

it("leaves scroll mode alone when a suspended pane is removed after another pane's scroll began", () => {
  const { mode, modes, show, external } = start();

  mode.handle({ kind: 'enter' });
  show({ focused: 2 });
  external.inputMode = 'scroll';
  show({ removePane: 1 });

  expect(modes).toEqual(['insert']);
});

it('changes the input mode only between insert and scroll, and only when the focus changed', () => {
  const unchanged = start();

  unchanged.mode.handle({ kind: 'enter' });
  unchanged.external.inputMode = 'insert';

  const { calls } = counted(unchanged.mode);

  unchanged.show({});

  expect(unchanged.modes).toEqual([]);
  expect(calls.count).toBe(0);

  const lost = start();

  lost.mode.handle({ kind: 'enter' });
  lost.external.inputMode = 'normal';
  lost.show({ focused: 2 });

  expect(lost.modes).toEqual([]);

  lost.show({ focused: 1 });

  expect(lost.modes).toEqual([]);

  const regained = start();

  regained.mode.handle({ kind: 'enter' });
  regained.show({ focused: 2 });
  regained.external.inputMode = 'scroll';
  regained.show({ focused: 1 });

  expect(regained.modes).toEqual(['insert']);
});

it('ignores focus changes, keys, and reach calls when no mode exists', () => {
  const { mode, show, modes, scrolls } = start();

  show({ focused: 2 });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'leave' });

  expect(mode.reach(paneId(1))).toBeUndefined();
  expect(mode.cursor()).toBeUndefined();
  expect(modes).toEqual([]);
  expect(scrolls).toEqual([]);
});

it('asks for rows only for the pane being scrolled', () => {
  const { mode } = start([95, 100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'paragraphNext' });

  expect(mode.reach(paneId(1))).toEqual({ from: 96, to: 102 });
  expect(mode.reach(paneId(2))).toBeUndefined();
});

it('asks for at most one chunk of rows below the cursor', () => {
  const { mode, arrive } = start();

  arrive({ ...updateOf([100, 101, 102]), first: 0, activeTop: 100_000 });
  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'paragraphNext' });

  expect(mode.reach(paneId(1))).toEqual({ from: 1, to: 256 });
});

it('ignores a fetch that ends before the mode, for another pane, or with no motion waiting', () => {
  const { mode, arrive, fetchedNow } = start([100, 101, 102]);
  const { calls, notifiedBy } = counted(mode);

  expect(
    notifiedBy(() => {
      fetchedNow();
    }),
  ).toBe(0);

  mode.handle({ kind: 'enter' });

  expect(
    notifiedBy(() => {
      fetchedNow();
    }),
  ).toBe(0);

  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  arrive(updateOf([95, 96, 97, 98, 99, 100, 101, 102]));

  const notified = calls.count;

  fetchedNow(2);

  expect(calls.count).toBe(notified);
  expect(mode.cursor()).toMatchObject({ row: 95, col: 1 });

  fetchedNow();

  expect(mode.cursor()).toMatchObject({ row: 95, col: 2 });
});

it('counts only fetches that miss, and asks again after a miss', () => {
  const { mode, supply } = start([100, 101, 102]);
  const { notifiedBy } = counted(mode);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'paragraphPrevious' });
  expect(mode.reach(paneId(1))).toMatchObject({ to: 99 });

  supply([99]);
  supply([98, 99]);
  supply([97, 98, 99]);
  expect(mode.reach(paneId(1))).toMatchObject({ to: 96 });

  expect(
    notifiedBy(() => {
      supply([97, 98, 99]);
    }),
  ).toBeGreaterThan(0);

  expect(
    notifiedBy(() => {
      supply([97, 98, 99]);
    }),
  ).toBeGreaterThan(0);

  expect(mode.reach(paneId(1))).toMatchObject({ to: 96 });
});

it('moves over a wide character as one cell of a word', () => {
  const { mode, arrive } = start();
  const update = updateOf([100, 101, 102]);
  const rowStart = 2 * rowWords(columns) + rowHeaderWords;

  const put = (column: number, character: string, flags = 0): void => {
    update.cells[rowStart + column * cellWords] = character.codePointAt(0) ?? 0;
    update.cells[rowStart + column * cellWords + cellWords - 1] = flags;
  };

  put(0, 'a');
  put(1, 'b');
  put(2, '世', CellWidth.wide);
  put(3, '\0', CellWidth.spacerTail);
  put(4, 'c');
  put(5, 'd');
  arrive(update);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'wordEnd' });
  expect(mode.cursor()).toMatchObject({ row: 102, col: 5 });

  mode.handle({ kind: 'move', motion: 'wordStartPrevious' });
  expect(mode.cursor()).toMatchObject({ row: 102, col: 0 });
});

it('keeps a motion waiting on its fetch when the focus changes after its rows arrived', () => {
  const { mode, arrive, show, fetchedNow } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  arrive(updateOf([95, 96, 97, 98, 99, 100, 101, 102]));
  show({ focused: 2 });
  show({ focused: 1 });

  expect(mode.cursor()).toMatchObject({ row: 95, col: 1 });

  fetchedNow();

  expect(mode.cursor()).toMatchObject({ row: 95, col: 2 });
});

it('keeps the cursor when rows arrive for a pane without a cache', () => {
  const { mode, arrive, external } = start();

  mode.handle({ kind: 'enter' });

  const before = mode.cursor();

  external.cached = false;
  arrive({ ...updateOf([100, 101, 102]), sequence: 2, first: 98 });

  expect(before).toBeDefined();
  expect(mode.cursor()).toBeDefined();
});

it('ignores rows of another pane while a motion waits', () => {
  const { mode, arrive } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.reach(paneId(1))).toEqual({ from: 95, to: 95 });

  arrive({ ...updateOf([100, 101, 102]), pane: 2, sequence: 2, first: 98 });

  expect(mode.reach(paneId(1))).toEqual({ from: 98, to: 95 });
});

it('leaves the cursor of a suspended scroll mode where it was while output advances', () => {
  const { mode, scrolls, arrive, show } = start();

  mode.handle({ kind: 'enter' });
  show({ focused: 2 });
  arrive({ ...updateOf([100, 101, 102]), activeTop: 110, sequence: 2 });
  show({ topRow: 100 });
  show({ focused: 1 });

  expect(mode.cursor()).toMatchObject({ row: 102 });

  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toMatchObject({ row: 101 });
  expect(scrolls).toEqual([]);
});

it('keeps the cursor on its text when output advances and the view is then scrolled from the CLI', () => {
  const { mode, scrolls, arrive, show } = start();

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101, 102]), activeTop: 110, sequence: 2 });

  expect(mode.cursor()).toMatchObject({ row: 112 });

  show({ topRow: 109 });

  expect(mode.cursor()).toMatchObject({ row: 112 });

  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toMatchObject({ row: 111 });
  expect(scrolls).toEqual([]);
});

it('keeps the cursor on its text when the pane is focused again and the view is then scrolled from the CLI', () => {
  const { mode, scrolls, arrive, show } = start();

  mode.handle({ kind: 'enter' });
  show({ focused: 2 });
  arrive({ ...updateOf([100, 101, 102]), activeTop: 110, sequence: 2 });
  show({ focused: 1 });

  expect(mode.cursor()).toMatchObject({ row: 112 });

  show({ topRow: 109 });

  expect(mode.cursor()).toMatchObject({ row: 112 });

  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toMatchObject({ row: 111 });
  expect(scrolls).toEqual([]);
});

it('keeps the cursor when the state changes while the pane has no rows', () => {
  const { mode, show, external } = start();

  mode.handle({ kind: 'enter' });
  external.cached = false;
  show({});
  external.cached = true;

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 102, col: 1 });
});

it('restarts a motion that waits below a screen that shrank', () => {
  const { mode, arrive } = start([100, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.reach(paneId(1))).toEqual({ from: 95, to: 101 });

  arrive({ ...updateOf([100]), sequence: 2, epoch: 2, size: { columns, rows: 1 } });

  expect(mode.reach(paneId(1))).toBeUndefined();
});

it('stops a pruned wait when the fetch ends, before it counts a miss', () => {
  const { mode, arrive, fetchedNow } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });

  arrive({ ...updateOf([100, 101, 102]), sequence: 2, first: 98 });
  fetchedNow();

  expect(mode.reach(paneId(1))).toEqual({ from: 98, to: 102 });
});

it('restarts a pruned wait when the fetch ends without a rows notice', () => {
  const { mode, cache, fetchedNow } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.reach(paneId(1))).toEqual({ from: 95, to: 95 });

  let notices = 0;

  mode.subscribe(() => {
    notices += 1;
  });

  cache.apply({ ...updateOf([100, 101, 102]), sequence: 2, first: 98 });
  fetchedNow();

  expect(notices).toBe(1);
  expect(mode.reach(paneId(1))).toEqual({ from: 98, to: 102 });
});

it('counts a miss when the fetch ends after the cache is gone', () => {
  const { mode, external, fetchedNow } = start([100, 101, 102]);
  let notices = 0;

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });

  mode.subscribe(() => {
    notices += 1;
  });

  external.cached = false;
  fetchedNow();

  expect(notices).toBe(1);
});
