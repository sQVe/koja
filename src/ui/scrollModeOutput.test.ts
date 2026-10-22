import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { cellWords, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import { activeTop, columns, height, updateOf, start } from './scrollModeFixtures.ts';

const wrappedRow = 95;

const reflowUpdate = (width: number, epoch: number, rows: [number, string][]): RowUpdate => {
  const stride = rowWords(width);
  const cells = new Uint32Array(rows.length * stride);

  for (const [index, [number, text]] of rows.entries()) {
    cells[index * stride] = (number - activeTop) >>> 0;
    cells[index * stride + 1] = number === wrappedRow ? 1 : 0;

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

it('keeps the view still on k while output advances a following view after entry', () => {
  const { mode, arrive, scrolls } = start();

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101, 102]), activeTop: activeTop + 8 });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 109, col: 1 });
  expect(scrolls).toEqual([]);
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

it('keeps the cursor row while output advances a scrolled view', () => {
  const { mode, arrive } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101, 102]), activeTop: activeTop + 8 });

  expect(mode.cursor()).toMatchObject({ row: 99 });
});

it('starts a motion from a row clamped into a pane that shrank', () => {
  const { mode, arrive } = start([100, 101, 102]);

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101]), sequence: 2, size: { columns, rows: 2 } });
  mode.handle({ kind: 'move', motion: 'lineStart' });

  expect(mode.cursor()).toMatchObject({ row: 101, col: 0 });
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
