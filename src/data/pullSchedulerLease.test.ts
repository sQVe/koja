import { beforeEach, describe, expect, test } from 'bun:test';

import { gitFactsOf, pullList, requestFor } from '../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../tests/pullSchedulerHarness.ts';
import { pullRetryRequestsKey } from './pullRetry.ts';

const harness = new PullSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createPullScheduler lease fences', () => {
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
});
