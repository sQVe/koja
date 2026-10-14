import type { PaneId } from '../ids.ts';
import { graphemeWordsPerRow, paneRowsBytes, sliceRows } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import { maxReplyBytes } from './paneRows.ts';
import type { SelectedRows } from './paneRows.ts';

// The rows one read selected, copied in one step so no write lands between its parts.
export interface PaneSnapshot {
  paneId: PaneId;
  requestId: number;
  rows: SelectedRows;
  graphemeWords: number[];
  // The index in rows of the first row no part has sent.
  next: number;
}

type Part = Omit<PaneRows, 'pane' | 'requestId'>;

// The snapshot each owner has parts left of, one per owner. Keeping a new one replaces the old.
export interface SnapshotStore<Owner> {
  keep: (owner: Owner, snapshot: PaneSnapshot) => void;
  find: (owner: Owner, paneId: PaneId, requestId: number) => PaneSnapshot | undefined;
  drop: (owner: Owner) => void;
  has: (owner: Owner) => boolean;
}

export const createSnapshot = (
  paneId: PaneId,
  requestId: number,
  rows: SelectedRows,
): PaneSnapshot => ({
  paneId,
  requestId,
  rows,
  graphemeWords: graphemeWordsPerRow(rows, rows.columns),
  next: 0,
});

export const hasMoreParts = (snapshot: PaneSnapshot): boolean =>
  snapshot.next < snapshot.rows.rowCount;

// Takes the next rows that fit one reply, at least one row. A snapshot of no rows has one empty
// part.
export const takePart = (snapshot: PaneSnapshot): Part => {
  const { rows } = snapshot;
  const start = snapshot.next;
  let count = 0;
  let graphemeWords = 0;

  while (start + count < rows.rowCount) {
    const words = graphemeWords + (snapshot.graphemeWords[start + count] ?? 0);
    const fits = paneRowsBytes(count + 1, rows.columns, words) <= maxReplyBytes;

    if (count > 0 && !fits) {
      break;
    }

    graphemeWords = words;
    count += 1;
  }

  const part = sliceRows(rows, rows.columns, start, count);

  snapshot.next = start + count;

  return {
    source: rows.source,
    columns: rows.columns,
    epoch: rows.epoch,
    screen: rows.screen,
    oldest: rows.oldest,
    first: rows.first + start,
    rowCount: count,
    cells: part.cells,
    graphemes: part.graphemes,
    remaining: rows.rowCount - snapshot.next,
  };
};

export const createSnapshotStore = <Owner>(): SnapshotStore<Owner> => {
  const snapshots = new Map<Owner, PaneSnapshot>();

  return {
    keep: (owner, snapshot) => {
      snapshots.set(owner, snapshot);
    },
    find: (owner, paneId, requestId) => {
      const snapshot = snapshots.get(owner);
      const matches = snapshot?.paneId === paneId && snapshot.requestId === requestId;

      return matches ? snapshot : undefined;
    },
    drop: (owner) => {
      snapshots.delete(owner);
    },
    has: (owner) => snapshots.has(owner),
  };
};
