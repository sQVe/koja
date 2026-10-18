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

interface StoreOptions {
  now?: () => number;
  budgetBytes?: number;
  idleMs?: number;
}

// The snapshot each owner has parts left of, one per owner. Keeping a new one replaces the old,
// and drops the least recently used snapshots of other owners when the budget is passed.
export interface SnapshotStore<Owner> {
  keep: (owner: Owner, snapshot: PaneSnapshot) => void;
  find: (owner: Owner, paneId: PaneId, requestId: number) => PaneSnapshot | undefined;
  drop: (owner: Owner) => void;
  // Drops the owner's snapshot and its read generation, for an owner that is gone.
  forget: (owner: Owner) => void;
  has: (owner: Owner) => boolean;
  // Starts a read of the owner: drops its snapshot and returns the read's generation.
  begin: (owner: Owner) => number;
  isCurrent: (owner: Owner, generation: number) => boolean;
}

interface Stored {
  snapshot: PaneSnapshot;
  bytes: number;
  touched: number;
}

// The most bytes of encoded rows all stored snapshots hold together.
const maxStoredSnapshotBytes = 0x4_00_00_00;

// A snapshot that no part request touched for this long is dropped.
export const snapshotIdleMs = 30_000;

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

    // Stryker disable next-line ConditionalExpression,EqualityOperator: The first row always fits in a reply.
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

const storedBytes = (snapshot: PaneSnapshot): number =>
  paneRowsBytes(snapshot.rows.rowCount, snapshot.rows.columns, snapshot.rows.graphemes.length);

export const createSnapshotStore = <Owner>(options: StoreOptions = {}): SnapshotStore<Owner> => {
  const now = options.now ?? Date.now;
  const budgetBytes = options.budgetBytes ?? maxStoredSnapshotBytes;
  const idleMs = options.idleMs ?? snapshotIdleMs;
  // Map order is least recently touched first, because a touch re-inserts the entry.
  const stored = new Map<Owner, Stored>();
  const generations = new Map<Owner, number>();

  const dropIdle = (): void => {
    const limit = now() - idleMs;

    for (const [owner, entry] of stored) {
      if (entry.touched <= limit) {
        stored.delete(owner);
      }
    }
  };

  const totalBytes = (): number => {
    let total = 0;

    for (const entry of stored.values()) {
      total += entry.bytes;
    }

    return total;
  };

  const makeRoom = (bytes: number): void => {
    for (const owner of stored.keys()) {
      if (totalBytes() + bytes <= budgetBytes) {
        return;
      }

      stored.delete(owner);
    }
  };

  return {
    keep: (owner, snapshot) => {
      const bytes = storedBytes(snapshot);

      stored.delete(owner);
      dropIdle();
      makeRoom(bytes);
      stored.set(owner, { snapshot, bytes, touched: now() });
    },
    find: (owner, paneId, requestId) => {
      dropIdle();

      const entry = stored.get(owner);

      if (
        entry === undefined ||
        entry.snapshot.paneId !== paneId ||
        entry.snapshot.requestId !== requestId
      ) {
        return undefined;
      }

      stored.delete(owner);
      stored.set(owner, { ...entry, touched: now() });

      return entry.snapshot;
    },
    drop: (owner) => {
      stored.delete(owner);
    },
    forget: (owner) => {
      stored.delete(owner);
      generations.delete(owner);
    },
    has: (owner) => stored.has(owner),
    begin: (owner) => {
      // Stryker disable next-line ArithmeticOperator: Generations only have to differ from each other.
      const generation = (generations.get(owner) ?? 0) + 1;

      stored.delete(owner);
      generations.set(owner, generation);

      return generation;
    },
    isCurrent: (owner, generation) => generations.get(owner) === generation,
  };
};
