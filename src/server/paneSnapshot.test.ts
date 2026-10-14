import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import {
  cellWords,
  encodePaneRows,
  PaneRowsSource,
  RowFlag,
  rowHeaderWords,
  rowsToLines,
  rowWords,
} from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import { maxReplyBytes } from './paneRows.ts';
import type { SelectedRows } from './paneRows.ts';
import { createSnapshot, createSnapshotStore, hasMoreParts, takePart } from './paneSnapshot.ts';

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
