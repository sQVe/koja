import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { click, clickablesWithText, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  anotherOwner,
  flush,
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  runTimers,
  runTimersUntil,
  setupKojaSpaces,
  showFacts,
  space,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';
import type { PullRetryRequest } from '../../data/pullRetry/pullRetry.ts';
import { pullRetryOutcomesKey, pullRetryRequestsKey } from '../../data/pullRetry/pullRetry.ts';
import type { RepositoryPulls } from '../../data/snapshot.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

let generatedIds = 0;

const stubId = (number: number): `${string}-${string}-${string}-${string}-${string}` =>
  `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

const stubIds = (): void => {
  generatedIds = 0;

  crypto.randomUUID = () => {
    generatedIds += 1;

    return stubId(generatedIds);
  };
};

const fixturePull = pullFacts({ number: 7, headRefName: 'main', title: 'Fixture pull request' });

const kojaRepositoryKey = repositoryOf(null, '/code/koja/.git').key;

const storedPullRequests = (): PullRetryRequest[] => {
  const stored = state.sharedValues[pullRetryRequestsKey] as
    | { requests?: PullRetryRequest[] }
    | undefined;

  return stored?.requests ?? [];
};

const onlyPullRetryRequest = (): PullRetryRequest => {
  const [request] = storedPullRequests();

  if (request === undefined) {
    throw new Error('No stored pull request');
  }

  return request;
};

const usePullFacts = (pulls: RepositoryPulls): void => {
  showFacts(
    storedFacts(
      [
        { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
        { folder: '/code/koja-fix', commonDirectory: '/code/koja/.git', linked: true },
      ],
      { [kojaRepositoryKey]: pulls },
    ),
  );

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-fix')];
};

describe('koja-spaces pull facts', () => {
  test('runs no git or gh command', async () => {
    anotherOwner();
    usePullFacts({ pulls: [fixturePull], failed: false });

    await loadView();
    runTimersUntil(200_000);
    await flush();

    expect(state.execCalls).toEqual([]);
  });

  test('titles an unnamed row with its PR from the snapshot', async () => {
    anotherOwner();
    usePullFacts({ pulls: [fixturePull], failed: false });

    state.spaceList = [
      space('m', true, '/code/koja'),
      { ...space('w', false, '/code/koja-fix'), named: false },
    ];

    const view = await loadView();

    expect(drawnTexts(view.render())).toContain('Fixture pull request');
  });

  test("shows Could not read PRs from the snapshot's failed PR facts", async () => {
    anotherOwner();
    usePullFacts({ pulls: [], failed: true });

    const view = await loadView();

    expect(drawnTexts(view.render())).toContain('Could not read PRs');
  });

  test("Retry writes one request with this copy's consumer and the repository key", async () => {
    anotherOwner();
    stubIds();
    usePullFacts({ pulls: [], failed: true });

    const view = await loadView();

    click(clickablesWithText(view.render(), 'Retry')[0] as DrawnElement);

    const request = onlyPullRetryRequest();

    expect(storedPullRequests()).toHaveLength(1);
    expect(request.consumer).toBe(stubId(1));
    expect(request.repository).toBe(kojaRepositoryKey);
    expect(request.id).not.toBe(request.consumer);
    expect(request.at).toBeGreaterThan(0);
  });

  test('a second Retry while the first is pending writes nothing', async () => {
    anotherOwner();
    stubIds();
    usePullFacts({ pulls: [], failed: true });

    const view = await loadView();

    click(clickablesWithText(view.render(), 'Retry')[0] as DrawnElement);
    click(clickablesWithText(view.render(), 'Retry')[0] as DrawnElement);

    const requestWrites = state.sharedWrites.filter((key) => key === pullRetryRequestsKey);

    expect(requestWrites).toHaveLength(1);
    expect(storedPullRequests()).toHaveLength(1);
  });

  test('an outcome for the request lets Retry request again', async () => {
    anotherOwner();
    stubIds();
    usePullFacts({ pulls: [], failed: true });

    const view = await loadView();

    click(clickablesWithText(view.render(), 'Retry')[0] as DrawnElement);

    const first = onlyPullRetryRequest();

    state.sharedValues[pullRetryOutcomesKey] = {
      version: 1,
      outcomes: [{ consumer: first.consumer, id: first.id, result: 'read' }],
    };

    runTimers(250);

    expect(storedPullRequests()).toEqual([]);

    click(clickablesWithText(view.render(), 'Retry')[0] as DrawnElement);

    const second = onlyPullRetryRequest();

    expect(second.consumer).toBe(first.consumer);
    expect(second.id).not.toBe(first.id);
    expect(second.repository).toBe(kojaRepositoryKey);
  });
});
