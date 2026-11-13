import type { Lease, ReadShared, WriteShared } from './lease.ts';
import { holdsLease } from './lease.ts';
import type { Facts, Snapshot } from './snapshot.ts';
import { parseSnapshot, snapshotKey } from './snapshot.ts';

export interface SnapshotPublisher {
  publish: (lease: Lease, facts: Facts) => void;
}

const sameFacts = (first: Facts, second: Facts): boolean =>
  JSON.stringify(first) === JSON.stringify(second);

export const createSnapshotPublisher = (
  read: ReadShared,
  write: WriteShared,
  now: () => number,
): SnapshotPublisher => ({
  publish: (lease, facts) => {
    if (!holdsLease(read, lease, now())) {
      return;
    }

    const stored = parseSnapshot(read(snapshotKey));

    if (stored !== null && sameFacts(stored.facts, facts)) {
      return;
    }

    const snapshot: Snapshot = { version: 1, revision: (stored?.revision ?? 0) + 1, facts };

    write(snapshotKey, snapshot);
  },
});
