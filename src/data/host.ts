import type { Context } from 'gpui-kit';
import { setShared, shared } from 'herdr';

import { repeat } from '../kit/timer.ts';
import type { Lease } from './lease.ts';
import { claimLease, heartbeatIntervalMilliseconds, renewHeartbeat } from './lease.ts';
import { createSnapshotPublisher } from './publisher.ts';

// Herdr's runtime has the Web Crypto global, but its declarations do not name it.
declare const crypto: { randomUUID: () => string };

// A hot reload stops the old copy's timers without calling close(), so the host never releases
// the lease; the next copy takes it over once the last heartbeat expires.
export const startDataHost = (cx: Context): void => {
  const owner = crypto.randomUUID();
  const publisher = createSnapshotPublisher(shared, setShared, Date.now);
  let lease: Lease | null = null;

  const beat = (): void => {
    const now = Date.now();
    const renewed = lease !== null && renewHeartbeat(shared, setShared, lease, now);

    if (!renewed) {
      lease = claimLease(shared, setShared, owner, now);
    }

    if (lease !== null) {
      publisher.publish(lease, {});
    }
  };

  beat();
  repeat(cx, heartbeatIntervalMilliseconds, beat);
};
