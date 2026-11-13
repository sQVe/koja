import type { ReadShared } from './lease.ts';
import { heartbeatDeadline, heartbeatKey, parseHeartbeat } from './lease.ts';
import type { Snapshot } from './snapshot.ts';
import { parseSnapshot, snapshotKey } from './snapshot.ts';

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

export const readDataState = (read: ReadShared, now: number): DataState => {
  const snapshot = parseSnapshot(read(snapshotKey));
  const heartbeat = parseHeartbeat(read(heartbeatKey));

  if (snapshot === null || heartbeat === null) {
    return { kind: 'unavailable' };
  }

  const { owner, generation } = heartbeat;
  const staleAt = heartbeatDeadline(heartbeat);

  if (now >= staleAt) {
    return { kind: 'stale', snapshot, owner, generation, heartbeatAt: heartbeat.at };
  }

  return { kind: 'live', snapshot, owner, generation, heartbeatAt: heartbeat.at, staleAt };
};
