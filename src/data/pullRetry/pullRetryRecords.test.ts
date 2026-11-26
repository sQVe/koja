import { describe, expect, test } from 'bun:test';

import { fixture } from '../../../tests/fixtures.ts';
import { logged, noticeFor, repositoryKey, start, storeOf } from '../../../tests/pullRetryStore.ts';
import {
  pullRetryOutcomesKey,
  pullRetryRequestsKey,
  readPullRetryOutcomes,
  readPullRetryRequests,
} from './pullRetry.ts';

describe('readPullRetryRequests', () => {
  const requestId = '0f8a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

  test('reads the version 1 fixture', () => {
    const { messages, notices } = logged();

    const stored = readPullRetryRequests(
      storeOf(pullRetryRequestsKey, fixture('pull-retry-requests-v1.json')),
      notices,
    );

    expect(stored).toEqual({
      kind: 'current',
      items: [
        { consumer: 'window-a', id: requestId, repository: repositoryKey, at: 1_700_000_000_000 },
      ],
    });

    expect(messages).toEqual([]);
  });

  test('ignores the version 2 fixture with the newer notice once', () => {
    const { messages, notices } = logged();
    const read = storeOf(pullRetryRequestsKey, fixture('pull-retry-requests-v2.json'));

    expect(readPullRetryRequests(read, notices)).toEqual({ kind: 'newer' });
    expect(readPullRetryRequests(read, notices)).toEqual({ kind: 'newer' });
    expect(messages).toEqual([noticeFor('pullRetryRequests', 'newer')]);
  });

  const validRequest = {
    consumer: 'window-a',
    id: requestId,
    repository: repositoryKey,
    at: start,
  };

  const malformedRequests: [string, unknown][] = [
    ['a request with an extra key', { version: 1, requests: [{ ...validRequest, extra: true }] }],
    [
      'a request with a non-string consumer',
      { version: 1, requests: [{ ...validRequest, consumer: 1 }] },
    ],
    [
      'a request without at',
      {
        version: 1,
        requests: [{ consumer: 'window-a', id: requestId, repository: repositoryKey }],
      },
    ],
    ['a record with another version', { version: 0, requests: [] }],
    ['requests that are not an array', { version: 1, requests: {} }],
  ];

  for (const [name, stored] of malformedRequests) {
    test(`ignores ${name} with the malformed notice`, () => {
      const { messages, notices } = logged();

      expect(readPullRetryRequests(storeOf(pullRetryRequestsKey, stored), notices)).toEqual({
        kind: 'current',
        items: [],
      });

      expect(messages).toEqual([noticeFor('pullRetryRequests', 'malformed')]);
    });
  }

  test('treats a null record as absent', () => {
    const { messages, notices } = logged();

    expect(readPullRetryRequests(storeOf(pullRetryRequestsKey, null), notices)).toEqual({
      kind: 'current',
      items: [],
    });

    expect(messages).toEqual([]);
  });

  test('stays silent for an absent record', () => {
    const { messages, notices } = logged();

    expect(readPullRetryRequests(storeOf(pullRetryRequestsKey, undefined), notices)).toEqual({
      kind: 'current',
      items: [],
    });

    expect(messages).toEqual([]);
  });
});

describe('readPullRetryOutcomes', () => {
  const requestId = '0f8a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

  test('reads the version 1 fixture', () => {
    const { messages, notices } = logged();

    const stored = readPullRetryOutcomes(
      storeOf(pullRetryOutcomesKey, fixture('pull-retry-outcomes-v1.json')),
      notices,
    );

    expect(stored).toEqual({
      kind: 'current',
      items: [{ consumer: 'window-a', id: requestId, result: 'read' }],
    });

    expect(messages).toEqual([]);
  });

  test('ignores the version 2 fixture with the newer notice once', () => {
    const { messages, notices } = logged();
    const read = storeOf(pullRetryOutcomesKey, fixture('pull-retry-outcomes-v2.json'));

    expect(readPullRetryOutcomes(read, notices)).toEqual({ kind: 'newer' });
    expect(readPullRetryOutcomes(read, notices)).toEqual({ kind: 'newer' });
    expect(messages).toEqual([noticeFor('pullRetryOutcomes', 'newer')]);
  });

  const validOutcome = { consumer: 'window-a', id: requestId, result: 'read' };

  const malformedOutcomes: [string, unknown][] = [
    ['an outcome with an extra key', { version: 1, outcomes: [{ ...validOutcome, extra: true }] }],
    ['an outcome with a non-string id', { version: 1, outcomes: [{ ...validOutcome, id: 1 }] }],
    [
      'an outcome without a result',
      { version: 1, outcomes: [{ consumer: 'window-a', id: requestId }] },
    ],
    ['an unknown result', { version: 1, outcomes: [{ ...validOutcome, result: 'maybe' }] }],
    ['a record with another version', { version: 0, outcomes: [] }],
    ['outcomes that are not an array', { version: 1, outcomes: {} }],
  ];

  for (const [name, stored] of malformedOutcomes) {
    test(`ignores ${name} with the malformed notice`, () => {
      const { messages, notices } = logged();

      expect(readPullRetryOutcomes(storeOf(pullRetryOutcomesKey, stored), notices)).toEqual({
        kind: 'current',
        items: [],
      });

      expect(messages).toEqual([noticeFor('pullRetryOutcomes', 'malformed')]);
    });
  }

  test('treats a null record as absent', () => {
    const { messages, notices } = logged();

    expect(readPullRetryOutcomes(storeOf(pullRetryOutcomesKey, null), notices)).toEqual({
      kind: 'current',
      items: [],
    });

    expect(messages).toEqual([]);
  });
});
