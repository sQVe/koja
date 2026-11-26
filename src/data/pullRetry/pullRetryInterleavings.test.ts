import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { answerFrom } from '../../../tests/pullAnswers.ts';
import { ids } from '../../../tests/pullRetryStore.ts';
import {
  gitFactsOf,
  pullList,
  schedulerRepository,
  seededRepositoryPulls,
  start,
} from '../../../tests/pullSchedulerFixtures.ts';
import { branchCountOf, PullSchedulerHarness } from '../../../tests/pullSchedulerHarness.ts';
import type { PendingCall } from '../../../tests/pullSchedulerHarness.ts';
import { repositoryOf } from '../gitIdentity.ts';
import {
  createPullRetryClient,
  isExpired,
  pullRetryLifetimeMilliseconds,
  requestKey,
} from './pullRetry.ts';
import type { PullRetryOutcome, PullRetryRequest } from './pullRetry.ts';

interface IssuedRequest {
  request: PullRetryRequest;
  expiresAt: number;
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

const seededRandom = (seed: number): (() => number) => {
  let state = seed + 1;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const repositoryForFolder = (folder: string): string => {
  for (const worktree of Object.values(gitFacts.worktrees)) {
    if (worktree.root === folder) {
      return worktree.repository.key;
    }
  }

  throw new Error(`no repository for ${folder}`);
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
): void => {
  for (const outcome of outcomes) {
    const key = requestKey(outcome);
    const results = recorded.get(key) ?? new Set<string>();

    results.add(outcome.result);
    recorded.set(key, results);
  }
};

const observeSeen = (outcomes: PullRetryOutcome[], seen: Set<string>): void => {
  for (const outcome of outcomes) {
    seen.add(requestKey(outcome));
  }
};

const recordRead = (
  harness: PullSchedulerHarness,
  call: PendingCall,
  now: number,
  decisions: Map<string, number>,
): void => {
  const repository = repositoryForFolder(call.cwd);
  const outcomes = harness.outcomes();
  const answered = new Set(outcomes.map(requestKey));

  for (const request of harness.requests()) {
    const key = requestKey(request);
    const claimable = request.repository === repository && !isExpired(request.at, now);

    if (!claimable || answered.has(key)) {
      continue;
    }

    decisions.set(key, (decisions.get(key) ?? 0) + 1);
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
    const branchCount = branchCountOf(call);
    const pulls = pullList(7);

    return { code: 0, stdout: answerFrom(branchCount, pulls), stderr: '' };
  }

  return { code: 1, stdout: '', stderr: 'offline' };
};

const answerPending = async (
  harness: PullSchedulerHarness,
  random: () => number,
  now: number,
  decisions: Map<string, number>,
): Promise<void> => {
  for (const call of harness.calls) {
    if (call.settled) {
      continue;
    }

    if (call.command === 'gh') {
      recordRead(harness, call, now, decisions);
    }

    await harness.respondCall(call, answerCall(call, random));
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
  const decisions = new Map<string, number>();
  const seenByClient = new Set<string>();
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
    const repository = random() < 0.5 ? schedulerRepository.key : otherRepository.key;

    if (action === 0) {
      clientA.request(repository, now);
    } else if (action === 1) {
      clientB.request(repository, now);
    } else if (action === 2) {
      clientA.settle(now);
      observeSeen(harness.outcomes(), seenByClient);
    } else if (action === 3) {
      clientB.settle(now);
      observeSeen(harness.outcomes(), seenByClient);
    } else if (action === 4) {
      harness.setRequests([]);
    } else {
      if (random() < 0.4) {
        scheduler = harness.start({ pulls: seedPulls, readTimes: {} });
      }

      scheduler.tick(gitFacts, new Map(), harness.spawn);
      await answerPending(harness, random, now, decisions);
    }

    observeRequests(harness.requests(), issued);
    observeOutcomes(harness.outcomes(), recorded);
  }

  clientA.settle(now);
  observeSeen(harness.outcomes(), seenByClient);
  clientB.settle(now);
  observeSeen(harness.outcomes(), seenByClient);

  const stored = harness.requests();
  const outcomes = harness.outcomes();
  const answered = new Set(outcomes.map(requestKey));
  const storedKeys = new Set(stored.map(requestKey));

  observeOutcomes(outcomes, recorded);

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
    const reads = decisions.get(key) ?? 0;

    expect(
      results.size,
      `seed ${seed}: the owner recorded ${results.size} results for ${key}`,
    ).toBe(1);

    expect(reads, `seed ${seed}: the owner read ${key} ${reads} times`).toBe(1);

    answeredKeys.add(key);
  }

  for (const [key, entry] of issued) {
    if (entry.expiresAt <= now || seenByClient.has(key)) {
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
