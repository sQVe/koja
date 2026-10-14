import { expect, it, jest, spyOn } from 'bun:test';

import { paneId } from '../ids.ts';
import {
  cellWords,
  encodePaneRows,
  PaneRowsSource,
  RowFlag,
  paneRowsBytes,
  rowHeaderWords,
  rowsToLines,
  rowWords,
} from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import { maxReplyBytes } from './paneRows.ts';
import type { SelectedRows } from './paneRows.ts';
import {
  createSnapshot,
  createSnapshotStore,
  hasMoreParts,
  maxStoredSnapshotBytes,
  snapshotIdleMs,
  takePart,
} from './paneSnapshot.ts';

const columns = 200;

// Rows of text where a text ending in a plus sign is a soft-wrapped row. Rows named in clusters
// hold a two-code-point cluster in their first cell.
const snapshotRows = (texts: string[], clusters: number[] = []): SelectedRows => {
  const width = rowWords(columns);
  const cells = new Uint32Array(texts.length * width);
  const graphemes: number[] = [];

  texts.forEach((text, row) => {
    const wrapped = text.endsWith('+');
    const content = wrapped ? text.slice(0, -1) : text;

    cells[row * width + 1] = wrapped ? RowFlag.wrapped : 0;

    for (let column = 0; column < content.length; column += 1) {
      cells[row * width + rowHeaderWords + column * cellWords] = content.charCodeAt(column);
    }

    if (clusters.includes(row)) {
      graphemes.push(row * width + rowHeaderWords, 2, 0x65, 0x3_01);
    }
  });

  return {
    source: PaneRowsSource.range,
    columns,
    epoch: 1,
    screen: 0,
    oldest: 0,
    first: 100,
    rowCount: texts.length,
    cells,
    graphemes: Uint32Array.from(graphemes),
  };
};

const takeAll = (rows: SelectedRows): PaneRows[] => {
  const snapshot = createSnapshot(paneId(1), 7, rows);
  const parts: PaneRows[] = [];

  do {
    parts.push({ ...takePart(snapshot), pane: 1, requestId: 7 });
  } while (hasMoreParts(snapshot));

  return parts;
};

it('splits a snapshot into parts of whole rows that each fit one reply, in order, once', () => {
  const texts = Array.from({ length: 700 }, (_, row) => `row${row}`);
  const parts = takeAll(snapshotRows(texts));

  expect(parts.length).toBeGreaterThan(1);

  for (const part of parts) {
    expect(encodePaneRows(part).length).toBeLessThanOrEqual(maxReplyBytes);
  }

  expect(parts.flatMap((part) => rowsToLines(part, columns, false))).toEqual(texts);

  expect(parts.map((part) => part.first)).toEqual(
    parts.map(
      (_, index) => 100 + parts.slice(0, index).reduce((sum, part) => sum + part.rowCount, 0),
    ),
  );

  expect(parts.map((part) => part.remaining)).toEqual(
    parts.map(
      (_, index) => 700 - parts.slice(0, index + 1).reduce((sum, part) => sum + part.rowCount, 0),
    ),
  );
});

it('keeps the clusters of each row with the part that holds the row', () => {
  const texts = Array.from({ length: 700 }, (_, row) => `r${row}`);
  const parts = takeAll(snapshotRows(texts, [3, 650]));
  const lines = parts.flatMap((part) => rowsToLines(part, columns, false));

  expect(lines[3]?.startsWith('e\u0301')).toBe(true);
  expect(lines[650]?.startsWith('e\u0301')).toBe(true);
  expect(lines[4]).toBe('r4');
});

it('sends a snapshot of no rows as one empty part', () => {
  const parts = takeAll(snapshotRows([]));

  expect(parts).toHaveLength(1);
  expect(parts[0]).toMatchObject({ rowCount: 0, remaining: 0 });
});

it('holds one snapshot per owner and drops it with its owner', () => {
  const store = createSnapshotStore<string>();
  const first = createSnapshot(paneId(1), 1, snapshotRows(['a']));
  const second = createSnapshot(paneId(1), 2, snapshotRows(['b']));

  store.keep('connection', first);
  expect(store.find('connection', paneId(1), 1)).toBe(first);

  store.keep('connection', second);
  expect(store.find('connection', paneId(1), 1)).toBeUndefined();
  expect(store.find('connection', paneId(1), 2)).toBe(second);
  expect(store.find('other', paneId(1), 2)).toBeUndefined();
  expect(store.find('connection', paneId(2), 2)).toBeUndefined();

  store.drop('connection');
  expect(store.has('connection')).toBe(false);
  expect(store.find('connection', paneId(1), 2)).toBeUndefined();
});

it('names a server-wide budget of 64 MiB and an idle time of 30 seconds', () => {
  expect(maxStoredSnapshotBytes).toBe(64 * 1024 * 1024);
  expect(snapshotIdleMs).toBe(30_000);
});

it('drops the least recently used snapshot of another owner when a new one passes the budget', () => {
  const rows = snapshotRows(['a']);
  const size = createSnapshot(paneId(1), 1, rows);
  const bytes = paneRowsBytes(rows.rowCount, rows.columns, rows.graphemes.length);
  const store = createSnapshotStore<string>({ budgetBytes: bytes * 2 });

  store.keep('one', size);
  store.keep('two', createSnapshot(paneId(1), 2, rows));
  expect(store.find('one', paneId(1), 1)).toBeDefined();

  store.keep('three', createSnapshot(paneId(1), 3, rows));

  expect(store.find('two', paneId(1), 2)).toBeUndefined();
  expect(store.find('one', paneId(1), 1)).toBeDefined();
  expect(store.find('three', paneId(1), 3)).toBeDefined();
});

it('drops a snapshot that no part request touched for 30 seconds', () => {
  jest.useFakeTimers();
  jest.setSystemTime(1_000_000);

  // Timers and Date share one fake clock, and performance follows it.
  const clock = spyOn(performance, 'now').mockImplementation(() => Date.now() - 1_000_000);

  try {
    const store = createSnapshotStore<string>();

    store.keep('one', createSnapshot(paneId(1), 1, snapshotRows(['a'])));
    store.keep('two', createSnapshot(paneId(1), 2, snapshotRows(['b'])));

    jest.advanceTimersByTime(snapshotIdleMs - 1);
    expect(store.find('one', paneId(1), 1)).toBeDefined();

    jest.advanceTimersByTime(snapshotIdleMs - 1);
    expect(store.find('one', paneId(1), 1)).toBeDefined();
    expect(store.find('two', paneId(1), 2)).toBeUndefined();

    jest.advanceTimersByTime(snapshotIdleMs);
    expect(store.find('one', paneId(1), 1)).toBeUndefined();
    expect(store.has('one')).toBe(false);
  } finally {
    clock.mockRestore();
    jest.useRealTimers();
  }
});

it('does not let a read that a newer read superseded take the current generation', () => {
  const store = createSnapshotStore<string>();
  const older = store.begin('one');

  expect(store.isCurrent('one', older)).toBe(true);

  const newer = store.begin('one');

  expect(store.isCurrent('one', older)).toBe(false);
  expect(store.isCurrent('one', newer)).toBe(true);
  expect(store.isCurrent('other', newer)).toBe(false);
});
