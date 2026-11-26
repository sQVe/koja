import { sameItems } from './fields.ts';
import type { RunCommand } from './gitIdentity.ts';
import type { Lease, ReadShared } from './lease.ts';
import { sameHolder } from './lease.ts';
import type { PullDueState } from './pullDue.ts';
import {
  duePullReads,
  emptyPullDueRepository,
  emptyPullDueState,
  noteBranches,
  notePush,
  noteResult,
  noteStart,
} from './pullDue.ts';
import { mergePulls, mergeReadTimes } from './pullMerge.ts';
import type { PullReadTimes } from './pullReadTimes.ts';
import type { PullRetryOutcome, PullRetryResult } from './pullRetry/pullRetry.ts';
import type { PullRetrySession } from './pullRetry/pullRetrySession.ts';
import { createPullRetrySession } from './pullRetry/pullRetrySession.ts';
import type { PullRead } from './pulls.ts';
import { readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';
import { pullSources } from './pullSources.ts';
import type { RecordNotices } from './recordNotices.ts';
import type { GitFacts, RepositoryPulls, RepositoryStacks } from './snapshot.ts';

export interface PullSchedulerDependencies {
  run: RunCommand;
  now: () => number;
  heldLease: () => Lease | null;
  read: ReadShared;
  notices: RecordNotices;
  publish: () => void;
  publishReadTimes: (lease: Lease, times: PullReadTimes) => void;
  publishOutcomes: (lease: Lease, outcomes: PullRetryOutcome[]) => void;
  windowActive: () => boolean;
}

export interface PullSchedulerSeed {
  pulls: Record<string, RepositoryPulls>;
  readTimes: PullReadTimes;
}

export interface PullScheduler {
  tick: (
    git: GitFacts,
    stacks: Readonly<Record<string, RepositoryStacks>>,
    remoteRefEvents: Map<string, number>,
    spawn: Spawn,
  ) => void;
  pulls: () => Record<string, RepositoryPulls>;
  stop: () => void;
}

type SettledPullRead = Exclude<PullRead, { kind: 'dropped' }>;

type Spawn = (body: () => Promise<void>) => void;

// A read time without its PR facts would delay the first read of a reopened repository.
const readTimesWithFacts = (seed: PullSchedulerSeed): PullReadTimes => {
  const entries = Object.entries(seed.readTimes).filter(([key]) => Object.hasOwn(seed.pulls, key));

  return Object.fromEntries(entries);
};

const seededDue = (times: PullReadTimes): PullDueState => {
  const state = emptyPullDueState();

  for (const [key, repository] of Object.entries(times)) {
    state.repositories[key] = {
      ...emptyPullDueRepository(),
      lastSuccess: repository.list,
    };
  }

  return state;
};

class Scheduler implements PullScheduler {
  private readonly pullsByRepository: Record<string, RepositoryPulls>;
  private readonly readTimes: PullReadTimes;
  private readonly due: PullDueState;
  private readonly session: PullRetrySession;
  private readonly running = new Map<string, number>();
  private readonly branches = new Map<string, string[]>();
  private sequence = 0;
  private stopped = false;

  constructor(
    private readonly dependencies: PullSchedulerDependencies,
    private readonly lease: Lease,
    seed: PullSchedulerSeed,
  ) {
    this.pullsByRepository = { ...seed.pulls };
    this.readTimes = readTimesWithFacts(seed);
    this.due = seededDue(this.readTimes);

    this.session = createPullRetrySession({
      read: dependencies.read,
      notices: dependencies.notices,
      lease,
      publishOutcomes: dependencies.publishOutcomes,
    });
  }

  pulls(): Record<string, RepositoryPulls> {
    return this.pullsByRepository;
  }

  tick(
    git: GitFacts,
    stacks: Readonly<Record<string, RepositoryStacks>>,
    remoteRefEvents: Map<string, number>,
    spawn: Spawn,
  ): void {
    if (this.stopped) {
      return;
    }

    const now = this.dependencies.now();
    const sources = pullSources(git, stacks);

    for (const [key, source] of sources) {
      const previous = this.branches.get(key);

      if (previous !== undefined && !sameItems(previous, source.branches)) {
        noteBranches(this.due, key, now);
      }

      this.branches.set(key, source.branches);
    }

    for (const [key, at] of remoteRefEvents) {
      if (sources.has(key)) {
        notePush(this.due, key, at);
      }
    }

    for (const request of this.session.claim(now)) {
      const source = sources.get(request.repository);

      if (source === undefined) {
        this.session.complete(request, 'failed');

        continue;
      }

      this.startRead(source, spawn);
    }

    this.startDueReads(sources, spawn, now);
    this.session.publish(now);
  }

  stop(): void {
    this.stopped = true;
  }

  private startDueReads(sources: Map<string, PullSource>, spawn: Spawn, now: number): void {
    const running = new Set(this.running.keys());
    const active = this.dependencies.windowActive();
    const due = duePullReads(this.due, [...sources.keys()], running, now, active);

    for (const key of due) {
      const source = sources.get(key);

      if (source !== undefined) {
        this.startRead(source, spawn);
      }
    }
  }

  private startRead(source: PullSource, spawn: Spawn): void {
    const key = source.repository.key;

    // The read in flight answers the claim when it completes.
    if (this.running.has(key)) {
      return;
    }

    this.sequence += 1;

    const sequence = this.sequence;

    noteStart(this.due, key, this.dependencies.now());
    this.running.set(key, sequence);

    spawn(async () => {
      const read = await readRepositoryPulls(this.dependencies.run, source, () =>
        this.stillOwner(),
      );

      this.apply(key, sequence, read);
    });
  }

  private stillOwner(): boolean {
    const held = this.dependencies.heldLease();

    return held !== null && sameHolder(held, this.lease);
  }

  private apply(key: string, sequence: number, read: PullRead): void {
    if (this.running.get(key) !== sequence) {
      return;
    }

    this.running.delete(key);

    if (this.stopped) {
      return;
    }

    if (read.kind === 'dropped') {
      return;
    }

    if (!this.stillOwner()) {
      return;
    }

    const now = this.dependencies.now();

    this.writeRead(key, read, now);
    noteResult(this.due, key, read, now);
    this.dependencies.publish();
    this.dependencies.publishReadTimes(this.lease, this.readTimes);

    const result: PullRetryResult = read.kind === 'read' ? 'read' : 'failed';
    // An answer is judged when it is published, which is later than when the read finished.
    const completedAt = this.dependencies.now();

    this.session.completeRead(key, result, completedAt);

    const publishedAt = this.dependencies.now();

    this.session.publish(publishedAt);
  }

  private writeRead(key: string, read: SettledPullRead, now: number): void {
    if (read.kind === 'read') {
      const pulls = mergePulls(this.pullsByRepository[key]?.pulls ?? [], read.pulls);

      this.pullsByRepository[key] = { pulls, failed: false };
      this.readTimes[key] = mergeReadTimes(this.readTimes[key], pulls, now);

      return;
    }

    const lastGood = this.pullsByRepository[key]?.pulls ?? [];

    this.pullsByRepository[key] = { pulls: lastGood, failed: true };
  }
}

export const createPullScheduler = (
  dependencies: PullSchedulerDependencies,
  lease: Lease,
  seed: PullSchedulerSeed,
): PullScheduler => new Scheduler(dependencies, lease, seed);
