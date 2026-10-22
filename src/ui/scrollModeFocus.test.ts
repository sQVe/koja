import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { PaneRowsSource } from '../rows/rows.ts';
import { columns, oldest, updateOf, start } from './scrollModeFixtures.ts';

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

it('runs queued motions from the aligned cursor when focus returns in normal mode', async () => {
  const { mode, arrive, show, scrolls, cache, fetchedNow, answer, external } = start([
    100, 101, 102,
  ]);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  mode.handle({ kind: 'move', motion: 'up' });
  show({ topRow: 95 });
  await answer();
  show({ focused: 2 });
  show({ topRow: undefined });
  arrive({ ...updateOf([100, 101, 102]), activeTop: 105, sequence: 2 });
  arrive({ ...updateOf([100, 101, 102]), activeTop: 110, sequence: 3 });

  const fetched = updateOf([95]);

  cache.storeRange({
    pane: 1,
    requestId: 1,
    source: PaneRowsSource.range,
    columns,
    epoch: 1,
    screen: 1,
    remaining: 0,
    oldest,
    first: 95,
    rowCount: 1,
    cells: fetched.cells,
    graphemes: fetched.graphemes,
  });

  fetchedNow();
  external.inputMode = 'normal';
  show({});
  show({ focused: 1 });

  expect(mode.cursor()).toMatchObject({ row: 104 });
  expect(scrolls).toEqual([95, 104]);
});
