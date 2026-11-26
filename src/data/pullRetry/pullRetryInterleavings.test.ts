import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { answerFrom } from '../../../tests/pullAnswers.ts';
import {
  ids,
  otherRepositoryKey,
  repositoryKey,
  silentNotices,
  start,
} from '../../../tests/pullRetryStore.ts';
import { gitFactsOf, pullList } from '../../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../../tests/pullSchedulerHarness.ts';
import type { PendingCall } from '../../../tests/pullSchedulerHarness.ts';
import { repositoryOf } from '../gitIdentity.ts';
import {
  createPullRetryClient,
  pullRetryLifetimeMilliseconds,
  readPullRetryOutcomes,
  readPullRetryRequests,
  requestKey,
} from './pullRetry.ts';
import type { PullRetryOutcome, PullRetryRequest } from './pullRetry.ts';

interface IssuedRequest {
  request: PullRetryRequest;
  expiresAt: number;
}

const gitFacts = gitFactsOf(
  { repository: repositoryOf(null, '/code/koja/.git'), folder: '/code/koja' },
  { repository: repositoryOf(null, '/code/other/.git'), folder: '/code/other' },
);

const seedPulls = {
  [repositoryKey]: { pulls: [], failed: false },
  [otherRepositoryKey]: { pulls: [], failed: false },
};

const seededRandom = (seed: number): (() => number) => {
  let state = seed + 1;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const requestsIn = (harness: PullSchedulerHarness): PullRetryRequest[] => {
  const stored = readPullRetryRequests(harness.store.read, silentNotices());

  if (stored.kind !== 'current') {
    throw new Error('the store holds a newer request record');
  }

  return stored.items;
};

const outcomesIn = (harness: PullSchedulerHarness): PullRetryOutcome[] => {
  const stored = readPullRetryOutcomes(harness.store.read, silentNotices());

  if (stored.kind !== 'current') {
    throw new Error('the store holds a newer outcome record');
  }

  return stored.items;
};

const observeRequests = (
  requests: PullRetryRequest[],
  issued: Map<string, IssuedRequest>,
): void => {
  for (const request of requests) {
    issued.set(requestKey(request), {
      request,
      expiresAt: request.at + pullRetryLifetimeMilliseconds,
    });
  }
};

const observeOutcomes = (
  outcomes: PullRetryOutcome[],
  recorded: Map<string, Set<string>>,
  answered: Set<string>,
): void => {
  for (const outcome of outcomes) {
    const key = requestKey(outcome);
    const results = recorded.get(key) ?? new Set<string>();

    results.add(outcome.result);
    recorded.set(key, results);
    answered.add(key);
  }
};

const branchCountOf = (call: PendingCall): number =>
  call.args.filter((argument) => argument.startsWith('branch')).length;

const answerCall = (call: PendingCall, random: () => number): ExecResult => {
  if (call.command === 'git' && call.args[1] === 'get-url') {
    return { code: 0, stdout: 'git@github.com:koja/koja.git\n', stderr: '' };
  }

  if (call.command === 'git') {
    return { code: 0, stdout: 'origin\n', stderr: '' };
  }

  if (random() < 0.5) {
    return { code: 0, stdout: answerFrom(branchCountOf(call), pullList(7)), stderr: '' };
  }

  return { code: 1, stdout: '', stderr: 'offline' };
};

const answerPending = async (
  harness: PullSchedulerHarness,
  random: () => number,
): Promise<void> => {
  for (const call of harness.calls) {
    if (!call.settled) {
      await harness.respondCall(call, answerCall(call, random));
    }
  }

  await Promise.all(harness.spawned.splice(0));
};

const checkInterleaving = async (seed: number, answeredKeys: Set<string>): Promise<void> => {
  const random = seededRandom(seed);
  const harness = new PullSchedulerHarness();
  const clientA = createPullRetryClient(harness.store, 'window-a', ids(`a${seed}`));
  const clientB = createPullRetryClient(harness.store, 'window-b', ids(`b${seed}`));
  const issued = new Map<string, IssuedRequest>();
  const recorded = new Map<string, Set<string>>();
  const everAnswered = new Set<string>();
  const steps = 6 + Math.floor(random() * 10);
  let scheduler = harness.start({ pulls: seedPulls, readTimes: {} });
  let now = start;

  harness.windowActive = false;

  for (let step = 0; step < steps; step += 1) {
    const jump =
      random() < 0.2
        ? Math.floor(random() * 3 * pullRetryLifetimeMilliseconds)
        : Math.floor(random() * 4_000);

    now += jump;
    harness.setNow(now);

    const action = Math.floor(random() * 6);
    const repository = random() < 0.5 ? repositoryKey : otherRepositoryKey;

    if (action === 0) {
      clientA.request(repository, now);
    } else if (action === 1) {
      clientB.request(repository, now);
    } else if (action === 2) {
      clientA.settle(now);
    } else if (action === 3) {
      clientB.settle(now);
    } else if (action === 4) {
      harness.setRequests([]);
    } else {
      if (random() < 0.4) {
        scheduler = harness.start({ pulls: seedPulls, readTimes: {} });
      }

      scheduler.tick(gitFacts, new Map(), harness.spawn);
      await answerPending(harness, random);
    }

    observeRequests(requestsIn(harness), issued);
    observeOutcomes(outcomesIn(harness), recorded, everAnswered);
  }

  clientA.settle(now);
  clientB.settle(now);

  const stored = requestsIn(harness);
  const outcomes = outcomesIn(harness);
  const answered = new Set(outcomes.map(requestKey));
  const storedKeys = new Set(stored.map(requestKey));

  observeOutcomes(outcomes, recorded, everAnswered);

  for (const request of stored) {
    const key = requestKey(request);

    expect(answered.has(key), `seed ${seed}: the answered request ${key} stays in the key`).toBe(
      false,
    );

    expect(
      request.at + pullRetryLifetimeMilliseconds > now,
      `seed ${seed}: the expired request ${key} stays in the key`,
    ).toBe(true);
  }

  for (const [key, results] of recorded) {
    expect(
      results.size,
      `seed ${seed}: the owner recorded ${results.size} results for ${key}`,
    ).toBe(1);

    answeredKeys.add(key);
  }

  for (const [key, entry] of issued) {
    if (entry.expiresAt <= now || everAnswered.has(key)) {
      continue;
    }

    expect(
      storedKeys.has(key),
      `seed ${seed}: the unexpired unanswered request ${key} left the key`,
    ).toBe(true);
  }
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
