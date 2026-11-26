import { beforeEach, describe, expect, test } from 'bun:test';

import {
  gitFactsOf,
  pullList,
  requestFor,
  schedulerRepository,
  seededRepositoryPulls,
  start,
  timesAt,
} from '../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../tests/pullSchedulerHarness.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import { pullRetryLifetimeMilliseconds, pullRetryOutcomesKey } from './pullRetry/pullRetry.ts';
import type { GitFacts } from './snapshot.ts';

const harness = new PullSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createPullScheduler request answering', () => {
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
        [schedulerRepository.key]: { pulls: [], failed: false },
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

    expect(harness.outcomes()).toEqual([]);

    harness.setRequests([requestFor('window-a', 'a-1')]);
    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.calls.map((call) => call.command)).toEqual(['git', 'git', 'gh']);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });

  const expireOnFirstOutcomesRead = (at: number): void => {
    harness.onStoreRead = (key) => {
      if (key !== pullRetryOutcomesKey) {
        return;
      }

      harness.onStoreRead = null;
      harness.setNow(at);
    };
  };

  test('a Retry that is still live when its answer is published is answered', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);
    await harness.respondRemotes(0);

    harness.setNow(start + pullRetryLifetimeMilliseconds - 2);
    expireOnFirstOutcomesRead(start + pullRetryLifetimeMilliseconds - 1);

    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({
      [schedulerRepository.key]: { pulls: pullList(7), failed: false },
    });

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });

  test('a Retry that expires while its answer is published is not answered', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);
    await harness.respondRemotes(0);

    harness.setNow(start + pullRetryLifetimeMilliseconds - 2);
    expireOnFirstOutcomesRead(start + pullRetryLifetimeMilliseconds);

    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({
      [schedulerRepository.key]: { pulls: pullList(7), failed: false },
    });

    expect(harness.outcomes()).toEqual([]);
  });

  test('a Retry whose PR read fails is answered failed', async () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);

    const scheduler = harness.start();

    scheduler.tick(gitFactsOf(), new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respond(2, { code: 1, stdout: '', stderr: 'offline' });

    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'failed' }]);
  });

  test('a Retry for a repository with no worktree is answered failed without a read', () => {
    const missing = JSON.stringify([null, '/code/missing/.git']);

    harness.setRequests([{ consumer: 'window-a', id: 'a-1', repository: missing, at: start }]);

    const scheduler = harness.start();

    scheduler.tick({ places: {}, worktrees: {} }, new Map(), harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'failed' }]);
  });

  test('a request answered by a previous owner is not read again', () => {
    harness.setRequests([requestFor('window-a', 'a-1')]);
    harness.setOutcomes([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start),
    });

    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.calls).toEqual([]);
    expect(harness.outcomes()).toEqual([{ consumer: 'window-a', id: 'a-1', result: 'read' }]);
  });
});
