import { expect, it } from 'bun:test';

import { createRowCache } from '../client/client.ts';
import type { InputMode, StoreSnapshot } from '../client/client.ts';
import { paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { cellWords, rowHeaderWords, rowWords } from '../rows/rows.ts';
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
    cursor: { x: 1, y: 2, visible: true },
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
  const changed = new Set<() => void>();
  const answers: (() => void)[] = [];

  const external = {
    topRow,
    focused: 1,
    inputMode: 'scroll' as InputMode,
    removed: undefined as number | undefined,
  };

  cache.apply(updateOf(shown));

  const session: ScrollModeSession = {
    getState: () => ({
      snapshot: snapshotWith(external.topRow, external.focused, external.removed),
      inputMode: external.inputMode,
    }),
    rowCache: () => cache,
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
  const fetchedNow = (): void => {
    for (const listener of fetched) {
      listener(paneId(1));
    }
  };

  const answer = async (): Promise<void> => {
    answers.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  };

  // Rows arrive in the cache, then the fetch reports.
  const supply = (rows: readonly number[]): void => {
    cache.apply(updateOf([...rows, 100, 101, 102]));

    for (const listener of fetched) {
      listener(paneId(1));
    }
  };

  return { mode, scrolls, scrolled, modes, show, supply, cache, answer, external, fetchedNow };
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
  const { mode, cache, scrolls } = start();

  mode.handle({ kind: 'enter' });
  cache.apply({ ...updateOf([100, 101, 102]), activeTop: activeTop + 8 });
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
    const { mode, cache, show, scrolls, answer } = start(undefined, 97);

    mode.handle({ kind: 'enter' });
    mode.handle({ kind: 'move', motion: 'historyTop' });
    show({ topRow: 95 });
    await answer();
    cache.apply({ ...updateOf([100, 101, 102]), activeTop: 110 });
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
  const { mode, cache } = start();

  cache.apply({ ...updateOf([100, 101, 102]), first: 0, activeTop: 100_000 });
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
  const { mode, cache, fetchedNow } = start([100, 101, 102], undefined, 300);

  cache.apply(longUpdate([12_100, 12_101, 12_102]));
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

    cache.apply(longUpdate([...supplied, 12_100, 12_101, 12_102]));
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
  const { mode, cache, show, fetchedNow, scrolls } = start([98], 96);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'wordStart' });
  expect(mode.reach(paneId(1))).toBeDefined();
  show({ topRow: 97 });

  const blank = updateOf([99, 100, 101, 102]);
  const stride = rowWords(columns);

  for (let index = 0; index < blank.rowCount; index++) {
    blank.cells.fill(0, index * stride + rowHeaderWords, (index + 1) * stride);
  }

  cache.apply(blank);
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
  const { mode, cache, fetchedNow } = start([95, 100, 101, 102], 95);

  cache.apply(
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

  cache.apply(
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
  const { mode, cache } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.cursor()).toMatchObject({ row: 102, col: 3 });

  cache.apply(
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
    subscribeFetched: () => () => undefined,
  });

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toBeUndefined();
  expect(modes).toEqual(['normal']);
});
