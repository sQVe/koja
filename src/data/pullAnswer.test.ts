import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import {
  batchErrorsOf,
  bodyOf,
  checksPartOf,
  rateLimitedIn,
  rateLimitOf,
  statusNamesOf,
  threadsPartOf,
} from './pullAnswer.ts';

const resultOf = (stdout: string, code = 0, stderr = ''): ExecResult => ({
  code,
  stdout,
  stderr,
});

const checksNodeOf = (state: string): Record<string, unknown> => ({
  commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] },
});

const errorsAt = (...path: unknown[]): Record<string, unknown> => ({ errors: [{ path }] });

describe('statusNamesOf', () => {
  test('maps the names GitHub answers to the pull values', () => {
    const node = {
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: 'APPROVED',
    };

    expect(statusNamesOf(node)).toEqual({
      mergeable: 'mergeable',
      mergeState: 'clean',
      review: 'approved',
    });
  });

  test('reads a name outside the table as unknown or none', () => {
    const node = {
      mergeable: 'UNKNOWN',
      mergeStateStatus: 'constructor',
      reviewDecision: null,
    };

    expect(statusNamesOf(node)).toEqual({
      mergeable: 'unknown',
      mergeState: 'unknown',
      review: 'none',
    });
  });
});

describe('checksPartOf', () => {
  test('reads a failed part when the batch reported the checks path', () => {
    expect(checksPartOf({}, true)).toEqual({ kind: 'failed', last: null });
  });

  test('maps the rollup state to the checks value', () => {
    expect(checksPartOf(checksNodeOf('SUCCESS'), false)).toEqual({
      kind: 'read',
      value: 'passing',
    });

    expect(checksPartOf(checksNodeOf('FAILURE'), false)).toEqual({
      kind: 'read',
      value: 'failing',
    });
  });

  test('reads no checks from an empty commit list', () => {
    expect(checksPartOf({ commits: { nodes: [] } }, false)).toEqual({
      kind: 'read',
      value: 'none',
    });
  });

  test('refuses a node without a commit list', () => {
    expect(checksPartOf({}, false)).toBeNull();
  });
});

describe('threadsPartOf', () => {
  test('counts the unresolved threads and marks an incomplete page', () => {
    const node = {
      reviewThreads: {
        pageInfo: { hasNextPage: true },
        nodes: [{ isResolved: false }, { isResolved: true }, { isResolved: false }],
      },
    };

    expect(threadsPartOf(node, false)).toEqual({
      kind: 'read',
      value: { unresolved: 2, complete: false },
    });
  });

  test('reads a failed part when the batch reported the threads path', () => {
    expect(threadsPartOf({}, true)).toEqual({ kind: 'failed', last: null });
  });

  test('refuses a thread without a resolved flag', () => {
    const node = {
      reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ isResolved: 'yes' }] },
    };

    expect(threadsPartOf(node, false)).toBeNull();
  });
});

describe('batchErrorsOf', () => {
  test('marks the branch of a checks error', () => {
    const body = errorsAt(
      'repository',
      'open1',
      'nodes',
      0,
      'commits',
      'nodes',
      0,
      'commit',
      'statusCheckRollup',
    );

    expect(batchErrorsOf(body, 2)).toEqual({ checks: new Set([1]), threads: new Set() });
  });

  test('marks the branch of a threads error', () => {
    const body = errorsAt('repository', 'open0', 'nodes', 0, 'reviewThreads', 'nodes', 3);

    expect(batchErrorsOf(body, 1)).toEqual({ checks: new Set(), threads: new Set([0]) });
  });

  test('refuses an error path outside the checks and threads', () => {
    expect(batchErrorsOf(errorsAt('repository', 'open0', 'nodes', 0, 'title'), 1)).toBeNull();
    expect(batchErrorsOf(errorsAt('repository', 'open0', 'nodes', 0), 1)).toBeNull();
  });

  test('reads no errors from an answer without them', () => {
    expect(batchErrorsOf({}, 1)).toEqual({ checks: new Set(), threads: new Set() });
  });
});

describe('rateLimitOf', () => {
  test('reads the remaining calls and the reset time', () => {
    const data = { rateLimit: { remaining: 42, resetAt: '2026-11-25T12:00:00Z' } };

    expect(rateLimitOf(data)).toEqual({
      remaining: 42,
      resetAt: Date.parse('2026-11-25T12:00:00Z'),
    });
  });

  test('refuses a count or reset time it cannot use', () => {
    expect(
      rateLimitOf({ rateLimit: { remaining: -1, resetAt: '2026-11-25T12:00:00Z' } }),
    ).toBeNull();

    expect(rateLimitOf({ rateLimit: { remaining: 1, resetAt: 'soon' } })).toBeNull();
    expect(rateLimitOf({ rateLimit: null })).toBeNull();
  });
});

describe('bodyOf', () => {
  test('reads a JSON object', () => {
    expect(bodyOf(resultOf('{"data":{}}'))).toEqual({ data: {} });
  });

  test('refuses output that is not a JSON object', () => {
    expect(bodyOf(resultOf('not json'))).toBeNull();
    expect(bodyOf(resultOf('[]'))).toBeNull();
  });
});

describe('rateLimitedIn', () => {
  test('reads a failed call whose error names the rate limit', () => {
    expect(rateLimitedIn(resultOf('', 1, 'API rate limit exceeded'))).toBe(true);
  });

  test('reads any other failed call as not rate limited', () => {
    expect(rateLimitedIn(resultOf('', 1, 'offline'))).toBe(false);
    expect(rateLimitedIn(resultOf('', 0, 'API rate limit exceeded'))).toBe(false);
  });
});
