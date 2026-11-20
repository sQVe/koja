import { isRecord } from '../kit/fields.ts';
import type { Lease, ReadShared, WriteShared } from './lease.ts';
import { holdsLease } from './lease.ts';
import type { Facts, Snapshot } from './snapshot.ts';
import { snapshotKey } from './snapshot.ts';
import { readStoredSnapshot, snapshotNotices } from './storedSnapshot.ts';

export interface SnapshotPublisher {
  publish: (lease: Lease, facts: Facts) => void;
}

const compareKeys = ([first]: [string, unknown], [second]: [string, unknown]): number => {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
};

const sortedValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortedValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries: [string, unknown][] = Object.entries(value)
    .toSorted(compareKeys)
    .map(([key, entry]) => [key, sortedValue(entry)]);

  return Object.fromEntries(entries);
};

const sameFacts = (first: Facts, second: Facts): boolean =>
  JSON.stringify(sortedValue(first)) === JSON.stringify(sortedValue(second));

export const createSnapshotPublisher = (
  read: ReadShared,
  write: WriteShared,
  now: () => number,
): SnapshotPublisher => ({
  publish: (lease, facts) => {
    if (!holdsLease(read, lease, now())) {
      return;
    }

    const stored = readStoredSnapshot(read, snapshotNotices);

    if (stored.kind === 'read' && sameFacts(stored.snapshot.facts, facts)) {
      return;
    }

    const revision = (stored.kind === 'read' ? stored.snapshot.revision : 0) + 1;
    const snapshot: Snapshot = { version: 2, revision, facts };

    write(snapshotKey, snapshot);
  },
});
