import type { Lease, ReadShared, WriteShared } from './lease.ts';
import { holdsLease } from './lease.ts';
import { recordNotices } from './recordNotices.ts';
import type { Facts, Snapshot } from './snapshot.ts';
import { snapshotKey, snapshotVersion } from './snapshot.ts';
import { sameValue } from './sortedValue.ts';
import { readStoredSnapshot } from './storedSnapshot.ts';

export interface SnapshotPublisher {
  publish: (lease: Lease, facts: Facts) => void;
}

export const createSnapshotPublisher = (
  read: ReadShared,
  write: WriteShared,
  now: () => number,
): SnapshotPublisher => ({
  publish: (lease, facts) => {
    if (!holdsLease(read, lease, now())) {
      return;
    }

    const stored = readStoredSnapshot(read, recordNotices);

    if (stored !== null && sameValue(stored.facts, facts)) {
      return;
    }

    const revision = (stored?.revision ?? 0) + 1;
    const snapshot: Snapshot = { version: snapshotVersion, revision, facts };

    write(snapshotKey, snapshot);
  },
});
