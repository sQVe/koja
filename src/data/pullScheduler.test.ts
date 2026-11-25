import { beforeEach, describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { answerFrom } from '../../tests/pullAnswers.ts';
import { pullFacts } from '../../tests/pullFacts.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { Lease, ReadShared, WriteShared } from './lease.ts';
import { heartbeatKey, leaseKey } from './lease.ts';
import type { PullReadTimes } from './pullReadTimes.ts';
import {
  createPullReadTimesPublisher,
  pullReadTimesKey,
  readPullReadTimes,
} from './pullReadTimes.ts';
import type { PullRetryOutcome, PullRetryRequest } from './pullRetry.ts';
import {
  createPullRetryOutcomesPublisher,
  pullRetryOutcomesKey,
  pullRetryRequestsKey,
  readPullRetryOutcomes,
} from './pullRetry.ts';
import type { Pull } from './pulls.ts';
import type { PullScheduler } from './pullScheduler.ts';
import { createPullScheduler } from './pullScheduler.ts';
import type { RecordNotices } from './recordNotices.ts';
import { createRecordNotices } from './recordNotices.ts';
import type { GitFacts, RepositoryPulls } from './snapshot.ts';

interface PendingCall {
  command: string;
  args: string[];
  cwd: string;
  on: string | null;
  respond: (result: ExecResult) => void;
}

interface Store {
  values: Map<string, unknown>;
  read: ReadShared;
  write: WriteShared;
}

const pullPeriodMilliseconds = 180_000;

const memoryStore = (): Store => {
  const values = new Map<string, unknown>();

  return {
    values,
    read: (key) => values.get(key),
    write: (key, value) => {
      values.set(key, structuredClone(value));
    },
  };
};

const silentNotices = (): RecordNotices => createRecordNotices(() => {});

const folder = '/code/koja';
const repository = repositoryOf(null, `${folder}/.git`);
const defaultSource = { repository, folder };

const seededRepositoryPulls: Record<string, RepositoryPulls> = {
  [repository.key]: { pulls: [], failed: false },
};

const start = 1_000_000;

const requestFor = (consumer: string, id: string, at = start): PullRetryRequest => ({
  consumer,
  id,
  repository: repository.key,
  at,
});

const pullList = (number: number): Pull[] => [
  pullFacts({
    number,
    headRefName: `feature-${number}`,
    title: `Pull ${number}`,
    mergeable: 'mergeable',
    mergeState: 'clean',
    review: 'approved',
    checks: { kind: 'read', value: 'passing' },
    threads: { kind: 'read', value: { unresolved: 0, complete: true } },
  }),
];

const timesAt = (key: string, time: number): PullReadTimes => ({
  [key]: { list: time, checks: {}, threads: {} },
});

const timesForPulls = (key: string, time: number, numbers: number[]): PullReadTimes => {
  const parts = Object.fromEntries(numbers.map((number) => [String(number), time]));

  return { [key]: { list: time, checks: parts, threads: parts } };
};

const gitFactsOf = (
  source: { repository: RepositoryIdentity; folder: string } = defaultSource,
): GitFacts => {
  const sourcePlace = placeOf(source.repository.machine, source.folder);
  const sourceWorktree = worktreeOf(source.repository.machine, source.folder);

  return {
    places: { [sourcePlace.key]: { kind: 'repository', worktree: sourceWorktree.key } },
    worktrees: {
      [sourceWorktree.key]: {
        repository: source.repository,
        root: source.folder,
        branch: 'main',
        linked: false,
      },
    },
  };
};

class PullSchedulerHarness {
  store = memoryStore();
  notices = silentNotices();
  calls: PendingCall[] = [];
  spawned: Promise<unknown>[] = [];
  published: Record<string, RepositoryPulls>[] = [];
  publishedTimes: PullReadTimes[] = [];
  publishedOutcomes: PullRetryOutcome[][] = [];
  now = start;
  lease: Lease = { version: 1, owner: 'owner-a', generation: 1 };
  held: Lease | null = this.lease;

  spawn = (body: () => Promise<void>): void => {
    this.spawned.push(body());
  };

  private readonly run = async (
    command: string,
    args: string[],
    options: { cwd: string; on: string | null },
  ): Promise<ExecResult> => {
    const settled = Promise.withResolvers<ExecResult>();

    const call: PendingCall = {
      command,
      args,
      cwd: options.cwd,
      on: options.on,
      respond: settled.resolve,
    };

    this.calls.push(call);

    return settled.promise;
  };

  constructor() {
    this.seedLease();
  }

  seedLease(): void {
    this.store.write(leaseKey, this.lease);
    this.store.write(heartbeatKey, { ...this.lease, at: this.now });
  }

  setNow(at: number): void {
    this.now = at;
    this.store.write(heartbeatKey, { ...this.lease, at });
  }

  setRequests(requests: PullRetryRequest[]): void {
    this.store.write(pullRetryRequestsKey, { version: 1, requests });
  }

  setOutcomes(outcomes: PullRetryOutcome[]): void {
    this.store.write(pullRetryOutcomesKey, { version: 1, outcomes });
  }

  setReadTimes(times: PullReadTimes): void {
    this.store.write(pullReadTimesKey, { version: 2, repositories: times });
  }

  start(seed?: {
    pulls: Record<string, RepositoryPulls>;
    readTimes: PullReadTimes;
  }): PullScheduler {
    const initial = seed ?? { pulls: {}, readTimes: {} };

    const readTimes = createPullReadTimesPublisher(
      this.store.read,
      this.store.write,
      () => this.now,
    );

    const outcomes = createPullRetryOutcomesPublisher(
      this.store.read,
      this.store.write,
      () => this.now,
    );

    let scheduler: PullScheduler | null = null;

    const created = createPullScheduler(
      {
        run: this.run,
        now: () => this.now,
        heldLease: () => this.held,
        read: this.store.read,
        notices: this.notices,
        publish: () => {
          if (scheduler !== null) {
            this.published.push(structuredClone(scheduler.pulls()));
          }
        },
        publishReadTimes: (lease, times) => {
          this.publishedTimes.push(structuredClone(times));
          readTimes.publish(lease, times);
        },
        publishOutcomes: (lease, list) => {
          this.publishedOutcomes.push(structuredClone(list));
          outcomes.publish(lease, list);
        },
      },
      this.lease,
      initial,
    );

    scheduler = created;

    return created;
  }

  async settle(): Promise<void> {
    for (let index = 0; index < 30; index += 1) {
      await Promise.resolve();
    }
  }

  call(index: number): PendingCall {
    const call = this.calls[index];

    if (call === undefined) {
      throw new Error(`no call at ${index}`);
    }

    return call;
  }

  async respond(index: number, result: ExecResult): Promise<void> {
    this.call(index).respond(result);
    await this.settle();
  }

  async respondRemotes(index: number): Promise<void> {
    await this.respond(index, { code: 0, stdout: 'origin\n', stderr: '' });
  }

  async respondPulls(index: number, pulls: Pull[]): Promise<void> {
    const call = this.call(index);
    const branchCount = call.args.filter((argument) => argument.startsWith('branch')).length;

    await this.respond(index, { code: 0, stdout: answerFrom(branchCount, pulls), stderr: '' });
  }

  outcomes(): PullRetryOutcome[] {
    const stored = readPullRetryOutcomes(this.store.read, this.notices);

    if (stored.kind !== 'current') {
      throw new Error('the store holds a newer outcomes record');
    }

    return stored.items;
  }
}

const harness = new PullSchedulerHarness();

beforeEach(() => {
  harness.store = memoryStore();
  harness.notices = silentNotices();
  harness.calls = [];
  harness.spawned = [];
  harness.published = [];
  harness.publishedTimes = [];
  harness.publishedOutcomes = [];
  harness.now = start;
  harness.lease = { version: 1, owner: 'owner-a', generation: 1 };
  harness.held = harness.lease;
  harness.seedLease();
});

describe('createPullScheduler', () => {
  test('two Retry requests for one repository cause one read and both get its outcome', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(1);

    const remoteCall = harness.call(0);

    expect(remoteCall).toMatchObject({ command: 'git', args: ['remote'] });

    harness.setRequests([requestFor('window-a', 'a-1'), requestFor('window-b', 'b-1')]);
    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);
    expect(harness.calls).toHaveLength(2);

    const pullsCall = harness.call(1);

    expect(pullsCall.command).toBe('gh');
    expect(pullsCall.args.slice(0, 2)).toEqual(['api', 'graphql']);

    await harness.respondPulls(1, pullList(7));

    expect(harness.calls.filter((call) => call.command === 'gh')).toHaveLength(1);

    expect(harness.outcomes()).toEqual([
      { consumer: 'window-a', id: 'a-1', result: 'read' },
      { consumer: 'window-b', id: 'b-1', result: 'read' },
    ]);
  });

  test('a request written before an in-flight read completes gets that read outcome', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.setRequests([requestFor('window-a', 'a-1'), requestFor('window-b', 'b-1')]);

    await harness.respondRemotes(0);
    await harness.respondPulls(1, pullList(7));

    expect(harness.calls.filter((call) => call.command === 'gh')).toHaveLength(1);

    expect(harness.outcomes()).toEqual([
      { consumer: 'window-a', id: 'a-1', result: 'read' },
      { consumer: 'window-b', id: 'b-1', result: 'read' },
    ]);

    scheduler.tick(git, harness.spawn);

    expect(harness.calls.map((call) => call.command)).toEqual(['git', 'gh']);
  });

  test('a read for one repository answers no unanswered request for another', async () => {
    const other = repositoryOf(null, '/code/other/.git');
    const otherPlace = placeOf(null, '/code/other');
    const otherWorktree = worktreeOf(null, '/code/other');
    const base = gitFactsOf();

    const git: GitFacts = {
      places: {
        ...base.places,
        [otherPlace.key]: { kind: 'repository', worktree: otherWorktree.key },
      },
      worktrees: {
        ...base.worktrees,
        [otherWorktree.key]: {
          repository: other,
          root: '/code/other',
          branch: 'main',
          linked: false,
        },
      },
    };

    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start({
      pulls: {
        [repository.key]: { pulls: [], failed: false },
        [other.key]: { pulls: [], failed: false },
      },
      readTimes: timesAt(other.key, start),
    });

    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.setRequests([
      requestFor('window-a', 'a-1'),
      { consumer: 'window-b', id: 'b-1', repository: other.key, at: start },
    ]);

    await harness.respondRemotes(0);
    await harness.respondPulls(1, pullList(7));

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });

  test('a re-asserted request whose answer is still in memory starts no second read', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(1, pullList(7));

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);

    harness.setRequests([]);
    scheduler.tick(git, harness.spawn);

    harness.setRequests([requestFor('window-a', 'a-1')]);
    scheduler.tick(git, harness.spawn);

    expect(harness.calls.map((call) => call.command)).toEqual(['git', 'gh']);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });

  test('a failed PR read keeps the last good PRs with their read time and error', async () => {
    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(1, pullList(7));

    expect(scheduler.pulls()).toEqual({
      [repository.key]: { pulls: pullList(7), failed: false },
    });

    expect(readPullReadTimes(harness.store.read, harness.notices)).toEqual(
      timesForPulls(repository.key, start, [7]),
    );

    harness.setNow(start + pullPeriodMilliseconds);
    scheduler.tick(git, harness.spawn);
    await harness.respond(2, { code: 1, stdout: '', stderr: 'offline' });

    expect(scheduler.pulls()).toEqual({
      [repository.key]: { pulls: pullList(7), failed: true },
    });

    expect(readPullReadTimes(harness.store.read, harness.notices)).toEqual(
      timesForPulls(repository.key, start, [7]),
    );
  });

  test('a Retry whose PR read fails is answered failed', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respond(1, { code: 1, stdout: '', stderr: 'offline' });

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'failed' }]);
  });

  test('reads each repository at most once per 180 s', async () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start - 1000),
    });

    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.setNow(start + 178_999);
    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.setNow(start + 179_000);
    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);
    await harness.respondPulls(1, pullList(7));

    harness.setNow(start + 179_000 + 179_999);
    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(2);

    harness.setNow(start + 179_000 + 180_000);
    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(3);
  });

  test('a seeded read time without seeded PR facts does not delay the first read', () => {
    const scheduler = harness.start({ pulls: {}, readTimes: timesAt(repository.key, start) });

    scheduler.tick(gitFactsOf(), harness.spawn);

    expect(harness.calls).toHaveLength(1);
  });

  test('a read for a remote repository runs on its machine from its worktree root', async () => {
    const remote = repositoryOf('qa-remote', '/srv/app/.git');

    harness.setRequests([{ consumer: 'window-a', id: 'a-1', repository: remote.key, at: start }]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf({ repository: remote, folder: '/srv/app' }), harness.spawn);

    const remoteCall = harness.call(0);

    expect(remoteCall).toMatchObject({ command: 'git', cwd: '/srv/app', on: 'qa-remote' });

    await harness.respondRemotes(0);

    const pullsCall = harness.call(1);

    expect(pullsCall).toMatchObject({ command: 'gh', cwd: '/srv/app', on: 'qa-remote' });

    await harness.respondPulls(1, pullList(7));

    expect(scheduler.pulls()).toEqual({ [remote.key]: { pulls: pullList(7), failed: false } });
  });

  test('reads once for one repository with two worktrees', async () => {
    const main = worktreeOf(null, '/code/koja-z');
    const linked = worktreeOf(null, '/code/koja-a');

    const git: GitFacts = {
      places: {
        [placeOf(null, '/code/koja-z').key]: { kind: 'repository', worktree: main.key },
        [placeOf(null, '/code/koja-a').key]: { kind: 'repository', worktree: linked.key },
      },
      worktrees: {
        [main.key]: { repository, root: '/code/koja-z', branch: 'main', linked: false },
        [linked.key]: { repository, root: '/code/koja-a', branch: 'main', linked: true },
      },
    };

    const scheduler = harness.start();

    scheduler.tick(git, harness.spawn);

    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);

    expect(harness.calls).toHaveLength(2);

    await harness.respondPulls(1, pullList(7));

    expect(scheduler.pulls()).toEqual({ [repository.key]: { pulls: pullList(7), failed: false } });
  });

  test('a lease lost after git remote starts no gh and answers no request', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.held = { version: 1, owner: 'owner-b', generation: 2 };

    await harness.respondRemotes(0);

    expect(harness.calls.map((call) => call.command)).toEqual(['git']);
    expect(harness.published).toEqual([]);
    expect(harness.publishedTimes).toEqual([]);
    expect(harness.outcomes()).toEqual([]);
    expect(scheduler.pulls()).toEqual({});

    expect(harness.store.values.get(pullRetryRequestsKey)).toEqual({
      version: 1,
      requests: [requestFor('window-a', 'a-1')],
    });
  });

  test('a gh result after the lease moves publishes nothing and answers no waiter', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf(), harness.spawn);
    await harness.respondRemotes(0);

    expect(harness.calls.map((call) => call.command)).toEqual(['git', 'gh']);

    harness.publishedOutcomes = [];
    harness.held = { version: 1, owner: 'owner-b', generation: 2 };

    await harness.respondPulls(1, pullList(7));

    expect(harness.published).toEqual([]);
    expect(harness.publishedTimes).toEqual([]);
    expect(harness.publishedOutcomes).toEqual([]);
    expect(harness.outcomes()).toEqual([]);
    expect(scheduler.pulls()).toEqual({});

    expect(harness.store.values.get(pullRetryRequestsKey)).toEqual({
      version: 1,
      requests: [requestFor('window-a', 'a-1')],
    });
  });

  test('a Retry for a repository with no worktree is answered failed without a read', () => {
    const missing = JSON.stringify([null, '/code/missing/.git']);

    harness.setRequests([{ consumer: 'window-a', id: 'a-1', repository: missing, at: start }]);

    const scheduler = harness.start();

    scheduler.tick({ places: {}, worktrees: {} }, harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'failed' }]);
  });

  test('a newer requests record stops request taking and outcome publishing', () => {
    const newerRequests = { version: 2, requests: [requestFor('window-a', 'a-1')] };

    harness.store.write(pullRetryRequestsKey, newerRequests);

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start),
    });

    scheduler.tick(gitFactsOf(), harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.publishedOutcomes).toEqual([]);
    expect(harness.store.values.get(pullRetryRequestsKey)).toEqual(newerRequests);
    expect(harness.store.values.get(pullRetryOutcomesKey)).toBeUndefined();
  });

  test('a newer outcomes record stops request taking and outcome publishing', () => {
    const newerOutcomes = { version: 2, outcomes: [] };

    harness.setRequests([requestFor('window-a', 'a-1')]);
    harness.store.write(pullRetryOutcomesKey, newerOutcomes);

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start),
    });

    scheduler.tick(gitFactsOf(), harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.publishedOutcomes).toEqual([]);

    expect(harness.store.values.get(pullRetryRequestsKey)).toEqual({
      version: 1,
      requests: [requestFor('window-a', 'a-1')],
    });

    expect(harness.store.values.get(pullRetryOutcomesKey)).toEqual(newerOutcomes);
  });

  test('a newer requests and outcomes record stops request taking and outcome publishing', () => {
    const newerRequests = { version: 2, requests: [requestFor('window-a', 'a-1')] };
    const newerOutcomes = { version: 2, outcomes: [] };

    harness.store.write(pullRetryRequestsKey, newerRequests);
    harness.store.write(pullRetryOutcomesKey, newerOutcomes);

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start),
    });

    scheduler.tick(gitFactsOf(), harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.publishedOutcomes).toEqual([]);
    expect(harness.store.values.get(pullRetryRequestsKey)).toEqual(newerRequests);
    expect(harness.store.values.get(pullRetryOutcomesKey)).toEqual(newerOutcomes);
  });

  test('a newer outcomes record during a due read publishes no outcomes', async () => {
    const newerOutcomes = { version: 2, outcomes: [] };

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.publishedOutcomes = [];
    harness.store.write(pullRetryOutcomesKey, newerOutcomes);

    await harness.respondRemotes(0);
    await harness.respondPulls(1, pullList(7));
    await harness.spawned[0];

    expect(harness.publishedOutcomes).toEqual([]);
    expect(harness.store.values.get(pullRetryOutcomesKey)).toEqual(newerOutcomes);
  });

  test('a newer requests record during a due read publishes no outcomes and does not throw', async () => {
    const newerRequests = { version: 2, requests: [requestFor('window-a', 'a-1')] };

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.publishedOutcomes = [];
    harness.store.write(pullRetryRequestsKey, newerRequests);

    await harness.respondRemotes(0);
    await harness.respondPulls(1, pullList(7));
    await harness.spawned[0];

    expect(harness.publishedOutcomes).toEqual([]);
    expect(harness.store.values.get(pullRetryRequestsKey)).toEqual(newerRequests);
    expect(harness.store.values.get(pullRetryOutcomesKey)).toBeUndefined();
  });

  test('a request answered by a previous owner is not read again', () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);
    harness.setOutcomes([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start),
    });

    const git = gitFactsOf();

    scheduler.tick(git, harness.spawn);
    scheduler.tick(git, harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });
});
