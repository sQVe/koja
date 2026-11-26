import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { seededRandom } from '../../../tests/gitSchedulerHarness.ts';
import { answerFrom, branchCountOf } from '../../../tests/pullAnswers.ts';
import { ids } from '../../../tests/pullRetryStore.ts';
import {
  gitFactsOf,
  pullList,
  schedulerRepository,
  seededRepositoryPulls,
  start,
} from '../../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../../tests/pullSchedulerHarness.ts';
import type { PendingCall } from '../../../tests/pullSchedulerHarness.ts';
import { repositoryOf } from '../gitIdentity.ts';
import { createPullRetryClient, pullRetryLifetimeMilliseconds, requestKey } from './pullRetry.ts';
import type { PullRetryClient, PullRetryOutcome, PullRetryRequest } from './pullRetry.ts';
import type { PullScheduler } from '../pullScheduler.ts';

interface InterleavingState {
  harness: PullSchedulerHarness;
  clientA: PullRetryClient;
  clientB: PullRetryClient;
  scheduler: PullScheduler;
  now: number;
  seenByClient: Set<string>;
  issued: Map<string, number>;
  random: () => number;
}

const otherRepository = repositoryOf(null, '/code/other/.git');

const gitFacts = gitFactsOf(
  { repository: schedulerRepository, folder: '/code/koja' },
  { repository: otherRepository, folder: '/code/other' },
);

const seedPulls = {
  ...seededRepositoryPulls,
  [otherRepository.key]: { pulls: [], failed: false },
};

const observeRequests = (requests: PullRetryRequest[], issued: Map<string, number>): void => {
  for (const request of requests) {
    issued.set(requestKey(request), request.at + pullRetryLifetimeMilliseconds);
  }
};

const observeSeen = (outcomes: PullRetryOutcome[], consumer: string, seen: Set<string>): void => {
  for (const outcome of outcomes) {
    if (outcome.consumer === consumer) {
      seen.add(requestKey(outcome));
    }
  }
};

const observeAnswered = (outcomes: PullRetryOutcome[], answeredKeys: Set<string>): void => {
  for (const outcome of outcomes) {
    answeredKeys.add(requestKey(outcome));
  }
};

const answerCall = (call: PendingCall, random: () => number): ExecResult => {
  if (call.command === 'git') {
    if (call.args[0] === 'remote' && call.args[1] === 'get-url') {
      return { code: 0, stdout: 'git@github.com:koja/koja.git\n', stderr: '' };
    }

    if (call.args.length === 1 && call.args[0] === 'remote') {
      return { code: 0, stdout: 'origin\n', stderr: '' };
    }

    throw new Error(`unexpected git call ${call.args.join(' ')}`);
  }

  if (random() < 0.5) {
    const branchCount = branchCountOf(call.args);
    const pulls = pullList(7);

    return { code: 0, stdout: answerFrom(branchCount, pulls), stderr: '' };
  }

  return { code: 1, stdout: '', stderr: 'offline' };
};

const answerPending = async (
  harness: PullSchedulerHarness,
  random: () => number,
): Promise<void> => {
  for (const call of harness.calls) {
    if (call.settled) {
      continue;
    }

    await harness.respondCall(call, answerCall(call, random));
  }

  await Promise.all(harness.spawned.splice(0));
};

const settleClient = (
  state: InterleavingState,
  client: PullRetryClient,
  consumer: string,
): void => {
  client.settle(state.now);
  observeSeen(state.harness.outcomes(), consumer, state.seenByClient);
};

const applyStep = async (state: InterleavingState, answeredKeys: Set<string>): Promise<void> => {
  const jump =
    state.random() < 0.2
      ? Math.floor(state.random() * 3 * pullRetryLifetimeMilliseconds)
      : Math.floor(state.random() * 4_000);

  state.now += jump;
  state.harness.setNow(state.now);

  const action = Math.floor(state.random() * 6);
  const repository = state.random() < 0.5 ? schedulerRepository.key : otherRepository.key;

  if (action === 0) {
    state.clientA.request(repository, state.now);
    observeSeen(state.harness.outcomes(), 'window-a', state.seenByClient);
  } else if (action === 1) {
    state.clientB.request(repository, state.now);
    observeSeen(state.harness.outcomes(), 'window-b', state.seenByClient);
  } else if (action === 2) {
    settleClient(state, state.clientA, 'window-a');
  } else if (action === 3) {
    settleClient(state, state.clientB, 'window-b');
  } else if (action === 4) {
    state.harness.setRequests([]);
  } else {
    if (state.random() < 0.4) {
      state.scheduler = state.harness.start({ pulls: seedPulls, readTimes: {} });
    }

    state.scheduler.tick(gitFacts, new Map(), state.harness.spawn);
    await answerPending(state.harness, state.random);
    observeAnswered(state.harness.outcomes(), answeredKeys);
  }

  observeRequests(state.harness.requests(), state.issued);
};

const expectFinalState = (state: InterleavingState, seed: number): void => {
  const stored = state.harness.requests();
  const outcomes = state.harness.outcomes();
  const answered = new Set(outcomes.map(requestKey));
  const storedKeys = new Set(stored.map(requestKey));

  for (const request of stored) {
    const key = requestKey(request);

    expect(answered.has(key), `seed ${seed}: the answered request ${key} stays in the key`).toBe(
      false,
    );

    expect(
      request.at + pullRetryLifetimeMilliseconds > state.now,
      `seed ${seed}: the expired request ${key} stays in the key`,
    ).toBe(true);
  }

  const outcomeKeys = outcomes.map(requestKey);

  expect(
    new Set(outcomeKeys).size,
    `seed ${seed}: the owner recorded two outcomes for one request`,
  ).toBe(outcomeKeys.length);

  for (const [key, expiresAt] of state.issued) {
    if (expiresAt <= state.now || state.seenByClient.has(key)) {
      continue;
    }

    expect(
      storedKeys.has(key),
      `seed ${seed}: the unexpired unanswered request ${key} left the key`,
    ).toBe(true);
  }
};

const checkInterleaving = async (seed: number, answeredKeys: Set<string>): Promise<void> => {
  const random = seededRandom(seed);
  const harness = new PullSchedulerHarness();

  const state: InterleavingState = {
    harness,
    clientA: createPullRetryClient(harness.store, 'window-a', ids(`a${seed}`)),
    clientB: createPullRetryClient(harness.store, 'window-b', ids(`b${seed}`)),
    scheduler: harness.start({ pulls: seedPulls, readTimes: {} }),
    now: start,
    seenByClient: new Set(),
    issued: new Map(),
    random,
  };

  const steps = 6 + Math.floor(random() * 10);

  harness.windowActive = false;

  for (let step = 0; step < steps; step += 1) {
    await applyStep(state, answeredKeys);
  }

  settleClient(state, state.clientA, 'window-a');
  settleClient(state, state.clientB, 'window-b');
  expectFinalState(state, seed);
};

describe('client interleavings', () => {
  test('a final settle keeps every live pending request and drops answered ones', async () => {
    const answeredKeys = new Set<string>();

    for (let seed = 1; seed <= 100; seed += 1) {
      await checkInterleaving(seed, answeredKeys);
    }

    expect(answeredKeys.size).toBeGreaterThan(0);
  });
});
