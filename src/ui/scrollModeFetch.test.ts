import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { CellWidth, cellWords, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import { columns, updateOf, start, counted } from './scrollModeFixtures.ts';

const longWordEnd = 12_000;

const longWordStart = 11_999;

// Rows 0 to 11999 are one soft-wrapped word and row 12000 starts the next. The screen starts at row
// 12100.
const textOfLongRow = (row: number): string => {
  if (row < longWordEnd) {
    return 'abcdefgh';
  }

  return row === longWordEnd ? 'zz' : '';
};

const longUpdate = (shown: readonly number[]): RowUpdate => {
  const longTop = 12_100;
  const base = updateOf([]);
  const stride = rowWords(columns);
  const cells = new Uint32Array(shown.length * stride);

  for (const [index, row] of shown.entries()) {
    const text = textOfLongRow(row);

    cells[index * stride] = (row - longTop) >>> 0;
    cells[index * stride + 1] = row < longWordStart ? 1 : 0;

    for (const [column, character] of text.split('').entries()) {
      cells[index * stride + rowHeaderWords + column * cellWords] = character.codePointAt(0) ?? 0;
    }
  }

  return { ...base, first: 0, activeTop: longTop, rowCount: shown.length, cells };
};

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

it('keeps the cursor and does not throw when the pane has no row cache', () => {
  const { mode, external } = start();

  mode.handle({ kind: 'enter' });
  external.cached = false;

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 102, col: 1 });
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
