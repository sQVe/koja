import type { ReadShared } from './lease.ts';
import { heartbeatDeadline, heartbeatKey, parseHeartbeat } from './lease.ts';
import type { Snapshot } from './snapshot.ts';
import type { StoredSnapshot } from './storedSnapshot.ts';
import { createSnapshotNotices, logSnapshotNotice, readStoredSnapshot } from './storedSnapshot.ts';

export type DataState =
  | { kind: 'unavailable' }
  | {
      kind: 'stale';
      snapshot: Snapshot;
      owner: string;
      generation: number;
      heartbeatAt: number;
    }
  | {
      kind: 'live';
      snapshot: Snapshot;
      owner: string;
      generation: number;
      heartbeatAt: number;
      staleAt: number;
    };

const notices = createSnapshotNotices(logSnapshotNotice);

export const readDataState = (read: ReadShared, now: number): DataState => {
  const stored: StoredSnapshot = readStoredSnapshot(read, notices);
  const heartbeat = parseHeartbeat(read(heartbeatKey));

  if (stored.kind !== 'read' || heartbeat === null) {
    return { kind: 'unavailable' };
  }

  const { snapshot } = stored;
  const { owner, generation } = heartbeat;
  const staleAt = heartbeatDeadline(heartbeat);

  if (now >= staleAt) {
    return { kind: 'stale', snapshot, owner, generation, heartbeatAt: heartbeat.at };
  }

  return { kind: 'live', snapshot, owner, generation, heartbeatAt: heartbeat.at, staleAt };
};
