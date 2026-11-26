import type { Context } from 'gpui-kit';
import {
  checking,
  exec,
  machines,
  panes,
  readTextFile,
  setShared,
  shared,
  spaces,
  watchFolder,
} from 'herdr';

import { repeat } from '../kit/timer.ts';
import { currentWindow } from '../kit/window.ts';
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
import { readTickets } from './linearTickets.ts';
import type { SnapshotPublisher } from './publisher.ts';
import { createSnapshotPublisher } from './publisher.ts';
import type { PullReadTimesPublisher } from './pullReadTimes.ts';
import { createPullReadTimesPublisher, readPullReadTimes } from './pullReadTimes.ts';
import type { PullRetryOutcomesPublisher } from './pullRetry/pullRetry.ts';
import { createPullRetryOutcomesPublisher } from './pullRetry/pullRetry.ts';
import type { PullScheduler } from './pullScheduler.ts';
import { createPullScheduler } from './pullScheduler.ts';
import { recordNotices } from './recordNotices.ts';
import type { Facts } from './snapshot.ts';
import { emptyFacts, joinFacts } from './snapshot.ts';
import type { StackScheduler } from './stackScheduler.ts';
import { createStackScheduler } from './stackScheduler.ts';
import { readStoredSnapshot } from './storedSnapshot.ts';
import type { TicketRunner, TrackerScheduler } from './trackerScheduler.ts';
import { createTrackerScheduler } from './trackerScheduler.ts';

interface SchedulerBinding {
  lease: Lease;
  git: GitScheduler;
  pulls: PullScheduler;
  trackers: TrackerScheduler;
  stacks: StackScheduler;
  readTickets: TicketRunner;
  publish: () => void;
}

interface HostState {
  candidate: Lease | null;
  binding: SchedulerBinding | null;
}

// Herdr's runtime has the Web Crypto global, but its declarations do not name it.
declare const crypto: { randomUUID: () => string };

const sweepMilliseconds = 250;

const seedFacts = (): Facts => readStoredSnapshot(shared, recordNotices)?.facts ?? emptyFacts();

const gitWorld = (): GitWorld => ({ spaces: spaces(), panes: panes(), machines: machines() });

const stopScheduler = (state: HostState): void => {
  state.binding?.git.stop();
  state.binding?.pulls.stop();
  state.binding?.trackers.stop();
  state.binding?.stacks.stop();
  state.binding = null;
};

const createSchedulerBinding = (
  publisher: SnapshotPublisher,
  readTimesPublisher: PullReadTimesPublisher,
  outcomesPublisher: PullRetryOutcomesPublisher,
  heldLease: () => Lease | null,
  held: Lease,
): SchedulerBinding => {
  const seed = seedFacts();
  let binding: SchedulerBinding | null = null;

  const publishSnapshot = (): void => {
    if (binding === null) {
      return;
    }

    publisher.publish(
      binding.lease,
      joinFacts(
        binding.git.gitFacts(),
        binding.pulls.pulls(),
        binding.trackers.trackers(),
        binding.stacks.stacks(),
      ),
    );
  };

  const git = createGitScheduler(
    {
      run: exec,
      watchFolder,
      now: Date.now,
      heldLease,
      publish: publishSnapshot,
    },
    held,
    seed.git,
  );

  const pulls = createPullScheduler(
    {
      run: exec,
      now: Date.now,
      heldLease,
      read: shared,
      notices: recordNotices,
      publish: publishSnapshot,
      publishReadTimes: readTimesPublisher.publish,
      publishOutcomes: outcomesPublisher.publish,
      windowActive: () => currentWindow()?.active ?? false,
    },
    held,
    { pulls: seed.pulls, readTimes: readPullReadTimes(shared, recordNotices) },
  );

  const stillOwner = (): boolean => {
    const now = heldLease();

    return now !== null && sameHolder(now, held);
  };

  const readTicketFacts: TicketRunner = (source) => readTickets(exec, source, stillOwner);

  const trackers = createTrackerScheduler(
    { run: exec, now: Date.now, publish: publishSnapshot },
    seed.trackers,
  );

  const stacks = createStackScheduler(
    {
      run: exec,
      readTextFile,
      watchFolder,
      now: Date.now,
      heldLease,
      publish: publishSnapshot,
    },
    held,
    seed.stacks,
  );

  binding = {
    lease: held,
    git,
    pulls,
    trackers,
    stacks,
    readTickets: readTicketFacts,
    publish: publishSnapshot,
  };

  return binding;
};

const schedulerFor = (
  state: HostState,
  publisher: SnapshotPublisher,
  readTimesPublisher: PullReadTimesPublisher,
  outcomesPublisher: PullRetryOutcomesPublisher,
  heldLease: () => Lease | null,
  held: Lease,
): SchedulerBinding => {
  if (state.binding !== null && sameHolder(state.binding.lease, held)) {
    return state.binding;
  }

  stopScheduler(state);

  state.binding = createSchedulerBinding(
    publisher,
    readTimesPublisher,
    outcomesPublisher,
    heldLease,
    held,
  );

  return state.binding;
};

// A hot reload stops the old copy's timers without calling close(), so the host never releases
// the lease; the next copy takes it over once the last heartbeat expires.
export const startDataHost = (cx: Context): void => {
  const owner = crypto.randomUUID();
  const publisher = createSnapshotPublisher(shared, setShared, Date.now);
  const readTimesPublisher = createPullReadTimesPublisher(shared, setShared, Date.now);
  const outcomesPublisher = createPullRetryOutcomesPublisher(shared, setShared, Date.now);
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
      schedulerFor(
        state,
        publisher,
        readTimesPublisher,
        outcomesPublisher,
        heldLease,
        held,
      ).publish();

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

    const binding = schedulerFor(
      state,
      publisher,
      readTimesPublisher,
      outcomesPublisher,
      heldLease,
      held,
    );

    binding.git.tick(gitWorld(), timerCx);

    binding.stacks.tick(binding.git.gitFacts(), timerCx);

    binding.pulls.tick(
      binding.git.gitFacts(),
      binding.stacks.stacks(),
      binding.git.takeRemoteRefEvents(),
      (body) => timerCx.spawn(body),
    );

    binding.trackers.tick(binding.git.gitFacts(), binding.stacks.stacks(), binding.readTickets);
  };

  beat();
  repeat(cx, heartbeatIntervalMilliseconds, beat);

  if (!checking()) {
    repeat(cx, sweepMilliseconds, tick);
  }
};
