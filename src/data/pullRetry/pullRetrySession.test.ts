import { describe, expect, test } from 'bun:test';

import type { Lease, ReadShared, WriteShared } from '../lease.ts';
import type { RecordNotices } from '../recordNotices.ts';
import { createRecordNotices } from '../recordNotices.ts';
import type { PullRetryOutcome, PullRetryRequest } from './pullRetry.ts';
import {
  pullRetryLifetimeMilliseconds,
  pullRetryOutcomesKey,
  pullRetryRequestsKey,
} from './pullRetry.ts';
import type { PullRetrySession } from './pullRetrySession.ts';
import { createPullRetrySession } from './pullRetrySession.ts';

interface Store {
  values: Record<string, unknown>;
  read: ReadShared;
  write: WriteShared;
}

interface Fixture {
  store: Store;
  published: PullRetryOutcome[][];
  session: PullRetrySession;
}

const repositoryKey = JSON.stringify([null, '/code/koja/.git']);
const otherRepositoryKey = JSON.stringify([null, '/code/other/.git']);

const start = 1_000_000;

const lease: Lease = { version: 1, owner: 'window-a', generation: 1 };

const memoryStore = (): Store => {
  const values: Record<string, unknown> = {};

  return {
    values,
    read: (key) => values[key],
    write: (key, value) => {
      values[key] = value;
    },
  };
};

const silentNotices = (): RecordNotices => createRecordNotices(() => {});

const requestFor = (
  consumer: string,
  id: string,
  at = start,
  repository = repositoryKey,
): PullRetryRequest => ({ consumer, id, repository, at });

const fixture = (requests: PullRetryRequest[] = [], outcomes: PullRetryOutcome[] = []): Fixture => {
  const store = memoryStore();
  const published: PullRetryOutcome[][] = [];

  store.write(pullRetryRequestsKey, { version: 1, requests });
  store.write(pullRetryOutcomesKey, { version: 1, outcomes });

  const session = createPullRetrySession({
    read: store.read,
    notices: silentNotices(),
    lease,
    publishOutcomes: (_lease, publishedOutcomes) => {
      published.push(structuredClone(publishedOutcomes));
    },
  });

  return { store, published, session };
};

const claimedIds = (fixtureUnderTest: Fixture, now: number): string[] =>
  fixtureUnderTest.session.claim(now).map((request) => request.id);

const soleClaim = (fixtureUnderTest: Fixture, now: number): PullRetryRequest => {
  const [claim] = fixtureUnderTest.session.claim(now);

  if (claim === undefined) {
    throw new Error('the session claimed no request');
  }

  return claim;
};

describe('createPullRetrySession', () => {
  test('claims a request once, skipping an answered and an expired one', () => {
    const underTest = fixture(
      [
        requestFor('window-a', 'a-1'),
        requestFor('window-b', 'b-1'),
        requestFor('window-c', 'c-1', start - pullRetryLifetimeMilliseconds),
      ],
      [{ consumer: 'window-b', id: 'b-1', result: 'read' }],
    );

    expect(claimedIds(underTest, start)).toEqual(['a-1']);
    expect(claimedIds(underTest, start)).toEqual([]);
  });

  test('publishes the answers of live requests in request order', () => {
    const underTest = fixture([
      requestFor('window-a', 'a-1'),
      requestFor('window-b', 'b-1'),
      requestFor('window-c', 'c-1'),
    ]);

    const [first, second] = underTest.session.claim(start);

    if (first === undefined || second === undefined) {
      throw new Error('the session claimed fewer than two requests');
    }

    underTest.session.complete(first, 'read');
    underTest.session.complete(second, 'failed');
    underTest.session.publish(start);

    expect(underTest.published).toEqual([
      [
        { consumer: 'window-a', id: 'a-1', result: 'read' },
        { consumer: 'window-b', id: 'b-1', result: 'failed' },
      ],
    ]);
  });

  test('publishes no answer for a request that expired before it was published', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);
    const claim = soleClaim(underTest, start);

    underTest.session.complete(claim, 'read');
    underTest.session.publish(start + pullRetryLifetimeMilliseconds);

    expect(underTest.published).toEqual([[]]);
  });

  test('a finished read answers every claim for its repository', () => {
    const underTest = fixture([
      requestFor('window-a', 'a-1'),
      requestFor('window-b', 'b-1'),
      requestFor('window-c', 'c-1', start, otherRepositoryKey),
    ]);

    underTest.session.claim(start);
    underTest.session.completeRead(repositoryKey, 'read', start);
    underTest.session.publish(start);

    expect(underTest.published).toEqual([
      [
        { consumer: 'window-a', id: 'a-1', result: 'read' },
        { consumer: 'window-b', id: 'b-1', result: 'read' },
      ],
    ]);
  });

  test('a finished read answers a request written while it ran', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);

    underTest.session.claim(start);

    underTest.store.write(pullRetryRequestsKey, {
      version: 1,
      requests: [requestFor('window-a', 'a-1'), requestFor('window-b', 'b-1')],
    });

    underTest.session.completeRead(repositoryKey, 'read', start);
    underTest.session.publish(start);

    expect(underTest.published).toEqual([
      [
        { consumer: 'window-a', id: 'a-1', result: 'read' },
        { consumer: 'window-b', id: 'b-1', result: 'read' },
      ],
    ]);
  });

  test('an outcome leaves with its request and returns when the request is asserted again', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);
    const claim = soleClaim(underTest, start);

    underTest.session.complete(claim, 'read');

    underTest.store.write(pullRetryRequestsKey, { version: 1, requests: [] });
    underTest.session.claim(start);
    underTest.session.publish(start);

    expect(underTest.published).toEqual([[]]);

    underTest.store.write(pullRetryRequestsKey, {
      version: 1,
      requests: [requestFor('window-a', 'a-1')],
    });

    underTest.session.claim(start);
    underTest.session.publish(start);

    expect(underTest.published.at(-1)).toEqual([
      { consumer: 'window-a', id: 'a-1', result: 'read' },
    ]);
  });

  test('a newer outcomes record stops claiming a request it has not seen', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);

    underTest.store.write(pullRetryOutcomesKey, { version: 2, outcomes: [] });

    expect(claimedIds(underTest, start)).toEqual([]);
  });

  test('a newer requests record stops claiming a request it has not seen', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);

    underTest.store.write(pullRetryRequestsKey, { version: 2, requests: [] });

    expect(claimedIds(underTest, start)).toEqual([]);
  });

  test('claims a request again once its earlier answer expired', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);
    const claim = soleClaim(underTest, start);

    underTest.session.complete(claim, 'read');

    underTest.store.write(pullRetryRequestsKey, {
      version: 1,
      requests: [requestFor('window-a', 'a-1', start + pullRetryLifetimeMilliseconds)],
    });

    expect(claimedIds(underTest, start + pullRetryLifetimeMilliseconds)).toEqual(['a-1']);
  });

  test('a finished read keeps an answer the request already has', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);
    const claim = soleClaim(underTest, start);

    underTest.session.complete(claim, 'failed');
    underTest.session.completeRead(repositoryKey, 'read', start);
    underTest.session.publish(start);

    expect(underTest.published).toEqual([[{ consumer: 'window-a', id: 'a-1', result: 'failed' }]]);
  });

  test('a newer record stops claiming and publishing', () => {
    const underTest = fixture([requestFor('window-a', 'a-1')]);
    const claim = soleClaim(underTest, start);

    underTest.session.complete(claim, 'read');
    underTest.store.write(pullRetryOutcomesKey, { version: 2, outcomes: [] });

    expect(claimedIds(underTest, start)).toEqual([]);

    underTest.session.publish(start);

    expect(underTest.published).toEqual([]);
  });
});
