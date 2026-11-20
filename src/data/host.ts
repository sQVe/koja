import type { Context } from 'gpui-kit';
import { checking, exec, machines, panes, setShared, shared, spaces, watchFolder } from 'herdr';

import { repeat } from '../kit/timer.ts';
import type { GitScheduler, GitWorld } from './gitScheduler.ts';
import { createGitScheduler } from './gitScheduler.ts';
import type { Lease } from './lease.ts';
import {
  claimLease,
  heartbeatIntervalMilliseconds,
  holdsLease,
  renewHeartbeat,
  sameHolder,
} from './lease.ts';
import type { SnapshotPublisher } from './publisher.ts';
import { createSnapshotPublisher, snapshotNotices } from './publisher.ts';
import type { Facts } from './snapshot.ts';
import { emptyFacts } from './snapshot.ts';
import { readStoredSnapshot } from './storedSnapshot.ts';

interface SchedulerBinding {
  lease: Lease;
  scheduler: GitScheduler;
}

interface HostState {
  candidate: Lease | null;
  binding: SchedulerBinding | null;
}

// Herdr's runtime has the Web Crypto global, but its declarations do not name it.
declare const crypto: { randomUUID: () => string };

const sweepMilliseconds = 250;

const seedFacts = (): Facts => {
  const stored = readStoredSnapshot(shared, snapshotNotices);

  return stored.kind === 'read' ? stored.snapshot.facts : emptyFacts();
};

const gitWorld = (): GitWorld => ({ spaces: spaces(), panes: panes(), machines: machines() });

const stopScheduler = (state: HostState): void => {
  state.binding?.scheduler.stop();
  state.binding = null;
};

const schedulerFor = (
  state: HostState,
  publisher: SnapshotPublisher,
  heldLease: () => Lease | null,
  held: Lease,
): GitScheduler => {
  if (state.binding !== null && sameHolder(state.binding.lease, held)) {
    return state.binding.scheduler;
  }

  stopScheduler(state);

  const scheduler = createGitScheduler(
    {
      run: exec,
      watchFolder,
      now: Date.now,
      heldLease,
      publish: publisher.publish,
    },
    held,
    seedFacts(),
  );

  state.binding = { lease: held, scheduler };

  return scheduler;
};

// A hot reload stops the old copy's timers without calling close(), so the host never releases
// the lease; the next copy takes it over once the last heartbeat expires.
export const startDataHost = (cx: Context): void => {
  const owner = crypto.randomUUID();
  const publisher = createSnapshotPublisher(shared, setShared, Date.now);
  const state: HostState = { candidate: null, binding: null };

  const heldLease = (): Lease | null =>
    state.candidate !== null && holdsLease(shared, state.candidate, Date.now())
      ? state.candidate
      : null;

  const beat = (): void => {
    const now = Date.now();

    const renewed =
      state.candidate !== null && renewHeartbeat(shared, setShared, state.candidate, now);

    if (!renewed) {
      state.candidate = claimLease(shared, setShared, owner, now);
    }

    const held = checking() ? null : heldLease();

    if (held !== null) {
      const scheduler = schedulerFor(state, publisher, heldLease, held);

      publisher.publish(held, scheduler.facts());

      return;
    }

    stopScheduler(state);

    if (state.candidate !== null) {
      publisher.publish(state.candidate, emptyFacts());
    }
  };

  const tick = (timerCx: Context): void => {
    const held = checking() ? null : heldLease();

    if (held === null) {
      stopScheduler(state);

      return;
    }

    schedulerFor(state, publisher, heldLease, held).tick(gitWorld(), timerCx);
  };

  beat();
  repeat(cx, heartbeatIntervalMilliseconds, beat);

  if (!checking()) {
    repeat(cx, sweepMilliseconds, tick);
  }
};
