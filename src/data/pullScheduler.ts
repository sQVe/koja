import type { RunCommand } from './gitIdentity.ts';
import type { Lease, ReadShared } from './lease.ts';
import { sameHolder } from './lease.ts';
import type { PullRetryOutcome, PullRetryRequest, PullRetryResult } from './pullRetry.ts';
import {
  answeredRequestKeys,
  freshRequests,
  isExpired,
  outcomesFor,
  readPullRetryOutcomes,
  readPullRetryRequests,
  requestKey,
} from './pullRetry.ts';
import type { PullRead } from './pulls.ts';
import { readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';
import { pullSources } from './pullSources.ts';
import type { RecordNotices } from './recordNotices.ts';
import type { GitFacts, RepositoryPulls } from './snapshot.ts';

export interface PullSchedulerDependencies {
  run: RunCommand;
  now: () => number;
  heldLease: () => Lease | null;
  read: ReadShared;
  notices: RecordNotices;
  publish: () => void;
  publishReadTimes: (lease: Lease, times: Record<string, number>) => void;
  publishOutcomes: (lease: Lease, outcomes: PullRetryOutcome[]) => void;
}

export interface PullSchedulerSeed {
  pulls: Record<string, RepositoryPulls>;
  readTimes: Record<string, number>;
}

export interface PullScheduler {
  tick: (git: GitFacts, spawn: Spawn) => void;
  pulls: () => Record<string, RepositoryPulls>;
  stop: () => void;
}

interface RunningRead {
  sequence: number;
  waiters: Map<string, number>;
}

interface Answer {
  result: PullRetryResult | null;
  at: number;
}

type SettledPullRead = Exclude<PullRead, { kind: 'dropped' }>;

type Spawn = (body: () => Promise<void>) => void;

const pullPeriodMilliseconds = 180_000;

// A read time without its PR facts would delay the first read of a reopened repository.
const readTimesWithFacts = (seed: PullSchedulerSeed): Record<string, number> => {
  const entries = Object.entries(seed.readTimes).filter(([key]) => Object.hasOwn(seed.pulls, key));

  return Object.fromEntries(entries);
};

class Scheduler implements PullScheduler {
  private readonly pullsByRepository: Record<string, RepositoryPulls>;
  private readonly readTimes: Record<string, number>;
  private readonly triedAt: Record<string, number> = {};
  private readonly answers = new Map<string, Answer>();
  private readonly running = new Map<string, RunningRead>();
  private sequence = 0;
  private stopped = false;

  constructor(
    private readonly dependencies: PullSchedulerDependencies,
    private readonly lease: Lease,
    seed: PullSchedulerSeed,
  ) {
    this.pullsByRepository = { ...seed.pulls };
    this.readTimes = readTimesWithFacts(seed);
  }

  pulls(): Record<string, RepositoryPulls> {
    return this.pullsByRepository;
  }

  tick(git: GitFacts, spawn: Spawn): void {
    if (this.stopped) {
      return;
    }

    const now = this.dependencies.now();
    const sources = pullSources(git);
    const requests = readPullRetryRequests(this.dependencies.read, this.dependencies.notices);
    const outcomes = readPullRetryOutcomes(this.dependencies.read, this.dependencies.notices);
    const newer = requests.kind === 'newer' || outcomes.kind === 'newer';

    if (!newer) {
      this.takeRequests(requests.items, outcomes.items, sources, spawn, now);
    }

    this.startDueReads(sources, spawn, now);

    if (!newer) {
      this.dependencies.publishOutcomes(this.lease, this.outcomesForAnswers(requests.items, now));
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private takeRequests(
    requests: PullRetryRequest[],
    outcomes: PullRetryOutcome[],
    sources: Map<string, PullSource>,
    spawn: Spawn,
    now: number,
  ): void {
    const live = freshRequests(requests, new Set(), now);

    this.dropAnswers(now);
    this.adoptOutcomes(outcomes, live);

    const taken = new Set(this.answers.keys());

    for (const key of answeredRequestKeys(this.dependencies.read)) {
      taken.add(key);
    }

    for (const request of freshRequests(requests, taken, now)) {
      const key = requestKey(request);

      this.answers.set(key, { result: null, at: request.at });

      const source = sources.get(request.repository);

      if (source === undefined) {
        this.answers.set(key, { result: 'failed', at: request.at });

        continue;
      }

      this.joinOrStart(source, request, spawn);
    }
  }

  private dropAnswers(now: number): void {
    for (const [key, answer] of this.answers) {
      if (isExpired(answer.at, now)) {
        this.answers.delete(key);
      }
    }
  }

  private adoptOutcomes(outcomes: PullRetryOutcome[], live: PullRetryRequest[]): void {
    const requestTimes = new Map(live.map((request) => [requestKey(request), request.at]));

    for (const outcome of outcomes) {
      const key = requestKey(outcome);
      const at = requestTimes.get(key);

      if (at !== undefined && !this.answers.has(key)) {
        this.answers.set(key, { result: outcome.result, at });
      }
    }
  }

  private joinOrStart(source: PullSource, request: PullRetryRequest, spawn: Spawn): void {
    const key = requestKey(request);
    const running = this.running.get(source.repository.key);

    if (running !== undefined) {
      running.waiters.set(key, request.at);

      return;
    }

    this.startRead(source, new Map([[key, request.at]]), spawn);
  }

  private startDueReads(sources: Map<string, PullSource>, spawn: Spawn, now: number): void {
    for (const [key, source] of sources) {
      if (this.running.has(key)) {
        continue;
      }

      const last = Math.max(this.readTimes[key] ?? 0, this.triedAt[key] ?? 0);

      if (now - last < pullPeriodMilliseconds) {
        continue;
      }

      this.startRead(source, new Map(), spawn);
    }
  }

  private startRead(source: PullSource, waiters: Map<string, number>, spawn: Spawn): void {
    const key = source.repository.key;

    this.sequence += 1;

    const sequence = this.sequence;

    this.triedAt[key] = this.dependencies.now();
    this.running.set(key, { sequence, waiters: new Map(waiters) });

    spawn(async () => {
      const read = await readRepositoryPulls(
        this.dependencies.run,
        source.repository,
        source.cwd,
        () => this.stillOwner(),
      );

      this.apply(key, sequence, read);
    });
  }

  private stillOwner(): boolean {
    const held = this.dependencies.heldLease();

    return held !== null && sameHolder(held, this.lease);
  }

  private apply(key: string, sequence: number, read: PullRead): void {
    const running = this.running.get(key);

    if (running?.sequence !== sequence) {
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

    this.writeRead(key, read);
    this.dependencies.publish();
    this.dependencies.publishReadTimes(this.lease, this.readTimes);

    const result: PullRetryResult = read.kind === 'read' ? 'read' : 'failed';

    for (const [waiter, at] of running.waiters) {
      this.answers.set(waiter, { result, at });
    }

    this.publishStoredOutcomes();
  }

  private writeRead(key: string, read: SettledPullRead): void {
    if (read.kind === 'read') {
      this.pullsByRepository[key] = { pulls: read.pulls, failed: false };
      this.readTimes[key] = this.dependencies.now();

      return;
    }

    const lastGood = this.pullsByRepository[key]?.pulls ?? [];

    this.pullsByRepository[key] = { pulls: lastGood, failed: true };
  }

  private outcomesForAnswers(requests: PullRetryRequest[], now: number): PullRetryOutcome[] {
    const results = new Map<string, PullRetryResult>();

    for (const [key, answer] of this.answers) {
      if (answer.result !== null) {
        results.set(key, answer.result);
      }
    }

    return outcomesFor(requests, results, now);
  }

  private publishStoredOutcomes(): void {
    const requests = readPullRetryRequests(this.dependencies.read, this.dependencies.notices);
    const outcomes = readPullRetryOutcomes(this.dependencies.read, this.dependencies.notices);

    if (requests.kind === 'newer' || outcomes.kind === 'newer') {
      return;
    }

    const now = this.dependencies.now();
    const list = this.outcomesForAnswers(requests.items, now);

    this.dependencies.publishOutcomes(this.lease, list);
  }
}

export const createPullScheduler = (
  dependencies: PullSchedulerDependencies,
  lease: Lease,
  seed: PullSchedulerSeed,
): PullScheduler => new Scheduler(dependencies, lease, seed);
