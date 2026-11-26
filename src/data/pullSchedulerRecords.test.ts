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
import { pullRetryOutcomesKey, pullRetryRequestsKey } from './pullRetry.ts';

const harness = new PullSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createPullScheduler stored records', () => {
  test('a newer requests record stops request taking and outcome publishing', () => {
    const newerRequests = { version: 2, requests: [requestFor('window-a', 'a-1')] };

    harness.store.write(pullRetryRequestsKey, newerRequests);

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start),
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
      readTimes: timesAt(schedulerRepository.key, start),
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
      readTimes: timesAt(schedulerRepository.key, start),
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
});
