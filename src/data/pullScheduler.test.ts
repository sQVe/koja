import { beforeEach, describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { answerFrom } from '../../tests/pullAnswers.ts';
import { pullFacts } from '../../tests/pullFacts.ts';
import { PullSchedulerHarness, pullSchedulerStart } from '../../tests/pullSchedulerHarness.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { PullReadTimes } from './pullReadTimes.ts';
import { readPullReadTimes } from './pullReadTimes.ts';
import type { PullRetryRequest } from './pullRetry.ts';
import { pullRetryOutcomesKey, pullRetryRequestsKey } from './pullRetry.ts';
import type { Pull } from './pulls.ts';
import type { GitFacts, RepositoryPulls } from './snapshot.ts';

const pullPeriodMilliseconds = 60_000;

const folder = '/code/koja';
const repository = repositoryOf(null, `${folder}/.git`);
const defaultSource = { repository, folder };

const seededRepositoryPulls: Record<string, RepositoryPulls> = {
  [repository.key]: { pulls: [], failed: false },
};

const start = pullSchedulerStart;

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

const harness = new PullSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createPullScheduler', () => {
  test('two Retry requests for one repository cause one read and both get its outcome', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    const remoteCall = harness.call(0);

    expect(remoteCall).toMatchObject({ command: 'git', args: ['remote'] });

    harness.setRequests([requestFor('window-a', 'a-1'), requestFor('window-b', 'b-1')]);
    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);
    expect(harness.calls).toHaveLength(3);

    const pullsCall = harness.call(2);

    expect(pullsCall.command).toBe('gh');
    expect(pullsCall.args.slice(0, 2)).toEqual(['api', 'graphql']);

    await harness.respondPulls(2, pullList(7));

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

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.setRequests([requestFor('window-a', 'a-1'), requestFor('window-b', 'b-1')]);

    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    expect(harness.calls.filter((call) => call.command === 'gh')).toHaveLength(1);

    expect(harness.outcomes()).toEqual([
      { consumer: 'window-a', id: 'a-1', result: 'read' },
      { consumer: 'window-b', id: 'b-1', result: 'read' },
    ]);

    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.calls.map((call) => call.command)).toEqual(['git', 'git', 'gh']);
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

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.setRequests([
      requestFor('window-a', 'a-1'),
      { consumer: 'window-b', id: 'b-1', repository: other.key, at: start },
    ]);

    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });

  test('a re-asserted request whose answer is still in memory starts no second read', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);

    harness.setRequests([]);
    scheduler.tick(git, new Map(), harness.spawn);

    harness.setRequests([requestFor('window-a', 'a-1')]);
    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.calls.map((call) => call.command)).toEqual(['git', 'git', 'gh']);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });

  test('a failed PR read keeps the last good PRs with their read time and error', async () => {
    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({
      [repository.key]: { pulls: pullList(7), failed: false },
    });

    expect(readPullReadTimes(harness.store.read, harness.notices)).toEqual(
      timesForPulls(repository.key, start, [7]),
    );

    harness.setNow(start + pullPeriodMilliseconds);
    scheduler.tick(git, new Map(), harness.spawn);
    await harness.respond(3, { code: 1, stdout: '', stderr: 'offline' });

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

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respond(2, { code: 1, stdout: '', stderr: 'offline' });

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'failed' }]);
  });

  test('reads each repository at most once per 60 s', async () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start - 1000),
    });

    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.setNow(start + 58_999);
    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.setNow(start + 59_000);
    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    harness.setNow(start + 59_000 + 59_999);
    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(3);

    harness.setNow(start + 59_000 + 60_000);
    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(4);
  });

  test('a seeded read time without seeded PR facts does not delay the first read', () => {
    const scheduler = harness.start({ pulls: {}, readTimes: timesAt(repository.key, start) });

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(1);
  });

  test('a remote ref change starts a pull read while the periodic read is not due', () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start),
    });

    scheduler.tick(gitFactsOf(), new Map([[repository.key, start - 20_000]]), harness.spawn);

    expect(harness.calls).toHaveLength(1);
    expect(harness.call(0)).toMatchObject({ command: 'git', args: ['remote'] });
  });

  test('an inactive window suppresses the periodic read', () => {
    harness.windowActive = false;

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(repository.key, start - pullPeriodMilliseconds),
    });

    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.windowActive = true;
    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);
  });

  test('a read for a remote repository runs on its machine from its worktree root', async () => {
    const remote = repositoryOf('qa-remote', '/srv/app/.git');

    harness.setRequests([{ consumer: 'window-a', id: 'a-1', repository: remote.key, at: start }]);

    const scheduler = harness.start();

    scheduler.tick(
      gitFactsOf({ repository: remote, folder: '/srv/app' }),
      new Map(),
      harness.spawn,
    );

    const remoteCall = harness.call(0);

    expect(remoteCall).toMatchObject({ command: 'git', cwd: '/srv/app', on: 'qa-remote' });

    await harness.respondRemotes(0);

    const pullsCall = harness.call(2);

    expect(pullsCall).toMatchObject({ command: 'gh', cwd: '/srv/app', on: 'qa-remote' });

    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({ [remote.key]: { pulls: pullList(7), failed: false } });
  });

  test('a rate limit on one GitHub host leaves another host on the same machine due', async () => {
    const firstFolder = '/code/first';
    const secondFolder = '/code/second';
    const first = repositoryOf(null, `${firstFolder}/.git`);
    const second = repositoryOf(null, `${secondFolder}/.git`);
    const firstPlace = placeOf(null, firstFolder);
    const firstWorktree = worktreeOf(null, firstFolder);
    const secondPlace = placeOf(null, secondFolder);
    const secondWorktree = worktreeOf(null, secondFolder);

    const git: GitFacts = {
      places: {
        [firstPlace.key]: { kind: 'repository', worktree: firstWorktree.key },
        [secondPlace.key]: { kind: 'repository', worktree: secondWorktree.key },
      },
      worktrees: {
        [firstWorktree.key]: {
          repository: first,
          root: firstFolder,
          branch: 'main',
          linked: false,
        },
        [secondWorktree.key]: {
          repository: second,
          root: secondFolder,
          branch: 'main',
          linked: false,
        },
      },
    };

    const respondIn = async (inFolder: string, result: ExecResult): Promise<void> => {
      const call = harness.callsIn(inFolder).at(-1);

      if (call === undefined) {
        throw new Error(`no call in ${inFolder}`);
      }

      await harness.respondCall(call, result);
    };

    const scheduler = harness.start();

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(2);

    await respondIn(firstFolder, { code: 0, stdout: 'origin\n', stderr: '' });

    await respondIn(firstFolder, {
      code: 0,
      stdout: 'git@github.com:koja/koja.git\n',
      stderr: '',
    });

    await respondIn(firstFolder, {
      code: 1,
      stdout: '',
      stderr: 'API rate limit exceeded for user ID 1',
    });

    await respondIn(secondFolder, { code: 0, stdout: 'origin\n', stderr: '' });

    await respondIn(secondFolder, {
      code: 0,
      stdout: 'git@ghe.example.com:koja/koja.git\n',
      stderr: '',
    });

    await respondIn(secondFolder, {
      code: 0,
      stdout: answerFrom(1, pullList(7)),
      stderr: '',
    });

    expect(scheduler.pulls()[first.key]).toEqual({ pulls: [], failed: true });
    expect(scheduler.pulls()[second.key]).toEqual({ pulls: pullList(7), failed: false });

    harness.setNow(start + pullPeriodMilliseconds);
    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.callsIn(firstFolder)).toHaveLength(3);
    expect(harness.callsIn(secondFolder)).toHaveLength(4);
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

    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);

    expect(harness.calls).toHaveLength(3);

    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({ [repository.key]: { pulls: pullList(7), failed: false } });
  });

  test('a lease lost after git remote starts no gh and answers no request', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);
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

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);
    await harness.respondRemotes(0);

    expect(harness.calls.map((call) => call.command)).toEqual(['git', 'git', 'gh']);

    harness.publishedOutcomes = [];
    harness.held = { version: 1, owner: 'owner-b', generation: 2 };

    await harness.respondPulls(2, pullList(7));

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

    scheduler.tick({ places: {}, worktrees: {} }, new Map(), harness.spawn);

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

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);

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

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);

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

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.publishedOutcomes).toEqual([]);
    expect(harness.store.values.get(pullRetryRequestsKey)).toEqual(newerRequests);
    expect(harness.store.values.get(pullRetryOutcomesKey)).toEqual(newerOutcomes);
  });

  test('a newer outcomes record during a due read publishes no outcomes', async () => {
    const newerOutcomes = { version: 2, outcomes: [] };

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.publishedOutcomes = [];
    harness.store.write(pullRetryOutcomesKey, newerOutcomes);

    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));
    await harness.spawned[0];

    expect(harness.publishedOutcomes).toEqual([]);
    expect(harness.store.values.get(pullRetryOutcomesKey)).toEqual(newerOutcomes);
  });

  test('a newer requests record during a due read publishes no outcomes and does not throw', async () => {
    const newerRequests = { version: 2, requests: [requestFor('window-a', 'a-1')] };

    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    harness.publishedOutcomes = [];
    harness.store.write(pullRetryRequestsKey, newerRequests);

    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));
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

    scheduler.tick(git, new Map(), harness.spawn);
    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });
});
