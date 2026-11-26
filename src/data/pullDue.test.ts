import { describe, expect, test } from 'bun:test';

import { pick, seededRandom } from '../../tests/seeded.ts';
import { repositoryOf } from './gitIdentity.ts';
import type { PullDueState } from './pullDue.ts';
import {
  duePullReads,
  emptyPullDueState,
  noteBranches,
  notePush,
  noteResult,
  noteStart,
} from './pullDue.ts';
import type { PullRead } from './pulls.ts';

const nothingRunning = new Set<string>();

const goodRead = (host: string | null = null): Exclude<PullRead, { kind: 'dropped' }> => ({
  kind: 'read',
  pulls: [],
  rateLimit: null,
  host,
});

const failedRead = (
  host: string | null = null,
  rateLimited = false,
): Exclude<PullRead, { kind: 'dropped' }> => ({ kind: 'failed', rateLimited, host });

const rateLimitedRead = (host: string | null): Exclude<PullRead, { kind: 'dropped' }> => ({
  kind: 'read',
  pulls: [],
  rateLimit: { remaining: 50, resetAt: 900_000 },
  host,
});

const keysOf = (state: PullDueState, keys: string[]): string[] =>
  duePullReads(state, keys, nothingRunning, 0, true);

describe('duePullReads', () => {
  test('three ref changes within the spacing cause one read', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    notePush(state, 'a', 1000);
    notePush(state, 'a', 3000);
    notePush(state, 'a', 9000);

    expect(duePullReads(state, ['a'], nothingRunning, 14_999, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 15_000, true)).toEqual(['a']);

    noteStart(state, 'a', 15_000);
    noteResult(state, 'a', goodRead(), 15_000);

    expect(duePullReads(state, ['a'], nothingRunning, 20_000, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 74_999, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 75_000, true)).toEqual(['a']);
  });

  test('reads every 60 s while the window is active and not while inactive', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    noteResult(state, 'a', goodRead(), 0);

    expect(duePullReads(state, ['a'], nothingRunning, 59_999, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 60_000, false)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 60_000, true)).toEqual(['a']);
  });

  test('a push read runs while the window is inactive', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    notePush(state, 'a', 1000);

    expect(duePullReads(state, ['a'], nothingRunning, 14_999, false)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 15_000, false)).toEqual(['a']);
  });

  test('a push read waits for the backoff to end', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    noteResult(state, 'a', failedRead(), 0);
    notePush(state, 'a', 1000);

    expect(duePullReads(state, ['a'], nothingRunning, 15_000, false)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 59_999, false)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 60_000, false)).toEqual(['a']);
  });

  test('an inactive window due check creates no repository entries', () => {
    const state = emptyPullDueState();

    expect(duePullReads(state, ['a', 'b'], nothingRunning, 0, false)).toEqual([]);
    expect(state.repositories).toEqual({});
  });

  test('sorting due reads creates no repository entries', () => {
    const state = emptyPullDueState();

    expect(duePullReads(state, ['a', 'b'], nothingRunning, 60_000, true)).toEqual(['a', 'b']);
    expect(state.repositories).toEqual({});
  });

  test('starts at most two reads, oldest first', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 30);
    noteStart(state, 'b', 10);
    noteStart(state, 'c', 20);

    expect(duePullReads(state, ['a', 'b', 'c'], nothingRunning, 100_000, true)).toEqual(['b', 'c']);

    expect(duePullReads(state, ['a', 'b', 'c'], new Set(['b']), 100_000, true)).toEqual(['c']);
  });

  test('backs off after failures', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    noteResult(state, 'a', failedRead(), 0);

    expect(duePullReads(state, ['a'], nothingRunning, 59_999, true)).toEqual([]);

    noteStart(state, 'a', 60_000);
    noteResult(state, 'a', failedRead(), 60_000);

    const nextReadAt = 60_000 + 120_000;

    expect(duePullReads(state, ['a'], nothingRunning, nextReadAt - 1, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, nextReadAt, true)).toEqual(['a']);
  });

  test('a pending branch due makes a read due before the read period ends', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    noteResult(state, 'a', goodRead(), 0);
    noteBranches(state, 'a', 1_000);

    expect(duePullReads(state, ['a'], nothingRunning, 999, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 1_000, true)).toEqual(['a']);
  });

  test('a pending branch due waits for the backoff to end', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    noteBranches(state, 'a', 1_000);
    noteResult(state, 'a', failedRead(), 1_000);

    expect(duePullReads(state, ['a'], nothingRunning, 60_999, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 61_000, true)).toEqual(['a']);
  });

  test('a pending branch due waits for a host pause', () => {
    const host = 'github.com';
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);
    noteResult(state, 'a', goodRead(host), 0);
    noteBranches(state, 'a', 1_000);
    noteResult(state, 'a', rateLimitedRead(host), 1_000);

    expect(duePullReads(state, ['a'], nothingRunning, 899_999, true)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 900_000, true)).toEqual(['a']);
  });

  test('a read start clears a pending branch due', () => {
    const state = emptyPullDueState();

    noteBranches(state, 'a', 1_000);
    noteStart(state, 'a', 1_000);

    expect(duePullReads(state, ['a'], nothingRunning, 2_000, true)).toEqual([]);
  });

  test('pauses every read until the rate limit resets', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);

    noteResult(state, 'a', rateLimitedRead(null), 0);

    notePush(state, 'a', 800_000);

    expect(duePullReads(state, ['a'], nothingRunning, 899_999, false)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 900_000, true)).toEqual(['a']);
  });

  test('a rate limit on one GitHub host leaves another host on the same machine readable', () => {
    const first = repositoryOf(null, '/code/first/.git').key;
    const second = repositoryOf(null, '/code/second/.git').key;
    const state = emptyPullDueState();

    noteStart(state, first, 0);
    noteResult(state, first, goodRead('github.com'), 0);
    noteStart(state, second, 0);
    noteResult(state, second, goodRead('ghe.example.com'), 0);
    noteResult(state, first, rateLimitedRead('github.com'), 0);

    expect(duePullReads(state, [first, second], nothingRunning, 60_000, true)).toEqual([second]);
    expect(duePullReads(state, [first, second], nothingRunning, 899_999, true)).toEqual([second]);

    expect(duePullReads(state, [first, second], nothingRunning, 900_000, true)).toEqual([
      first,
      second,
    ]);
  });

  test('a rate limit on one host withholds every repository on that host', () => {
    const first = repositoryOf(null, '/code/first/.git').key;
    const second = repositoryOf(null, '/code/second/.git').key;
    const other = repositoryOf(null, '/code/other/.git').key;
    const state = emptyPullDueState();

    noteStart(state, first, 0);
    noteResult(state, first, goodRead('github.com'), 0);
    noteStart(state, second, 0);
    noteResult(state, second, goodRead('github.com'), 0);
    noteStart(state, other, 0);
    noteResult(state, other, goodRead('ghe.example.com'), 0);
    noteResult(state, first, rateLimitedRead('github.com'), 0);

    expect(duePullReads(state, [first, second], nothingRunning, 899_999, true)).toEqual([]);
    expect(duePullReads(state, [other], nothingRunning, 899_999, true)).toEqual([other]);

    expect(duePullReads(state, [first], nothingRunning, 900_000, true)).toEqual([first]);
    expect(duePullReads(state, [second], nothingRunning, 900_000, true)).toEqual([second]);
  });

  test('a rate-limited failure pauses only the host that reported it', () => {
    const first = repositoryOf(null, '/code/first/.git').key;
    const second = repositoryOf(null, '/code/second/.git').key;
    const state = emptyPullDueState();

    noteStart(state, first, 0);
    noteResult(state, first, failedRead('github.com', true), 0);
    noteStart(state, second, 0);
    noteResult(state, second, goodRead('ghe.example.com'), 0);

    expect(duePullReads(state, [first, second], nothingRunning, 60_000, true)).toEqual([second]);
    expect(duePullReads(state, [first, second], nothingRunning, 299_999, true)).toEqual([second]);

    expect(duePullReads(state, [first, second], nothingRunning, 300_000, true)).toEqual([
      first,
      second,
    ]);
  });

  test('a repository with no known host is withheld while any host is paused', () => {
    const unknown = repositoryOf(null, '/code/unknown/.git').key;
    const known = repositoryOf(null, '/code/known/.git').key;
    const state = emptyPullDueState();

    noteStart(state, known, 0);
    noteResult(state, known, rateLimitedRead('github.com'), 0);
    noteStart(state, unknown, 0);

    expect(duePullReads(state, [unknown], nothingRunning, 899_999, true)).toEqual([]);
    expect(duePullReads(state, [unknown], nothingRunning, 900_000, true)).toEqual([unknown]);
  });

  test('a repository with no known host respects the global pause', () => {
    const unknown = repositoryOf(null, '/code/unknown/.git').key;
    const known = repositoryOf(null, '/code/known/.git').key;
    const state = emptyPullDueState();

    noteStart(state, unknown, 0);
    noteStart(state, known, 0);
    noteResult(state, known, goodRead('github.com'), 0);
    noteResult(state, unknown, rateLimitedRead(null), 0);

    expect(duePullReads(state, [unknown, known], nothingRunning, 899_999, true)).toEqual([]);

    expect(duePullReads(state, [unknown, known], nothingRunning, 900_000, true)).toEqual([
      known,
      unknown,
    ]);
  });

  test('a read with no known host keeps the pause of the host read before', () => {
    const key = repositoryOf(null, '/code/repo/.git').key;
    const state = emptyPullDueState();

    noteStart(state, key, 0);
    noteResult(state, key, rateLimitedRead('github.com'), 0);

    noteStart(state, key, 100_000);
    noteResult(state, key, goodRead(null), 100_000);

    expect(duePullReads(state, [key], nothingRunning, 899_999, true)).toEqual([]);
    expect(duePullReads(state, [key], nothingRunning, 900_000, true)).toEqual([key]);
  });

  test('a rate-limited failure with no known host pauses periodic and push reads', () => {
    const periodic = repositoryOf(null, '/code/periodic/.git').key;
    const pushed = repositoryOf(null, '/code/pushed/.git').key;
    const state = emptyPullDueState();

    noteStart(state, periodic, 0);
    noteStart(state, pushed, 0);
    notePush(state, pushed, 1000);
    noteResult(state, periodic, failedRead(null, true), 0);

    expect(duePullReads(state, [periodic, pushed], nothingRunning, 299_999, true)).toEqual([]);

    expect(duePullReads(state, [periodic, pushed], nothingRunning, 300_000, true)).toEqual([
      periodic,
      pushed,
    ]);
  });

  test('the queue keeps its limits for any order of events', () => {
    const keys = ['a', 'b', 'c', 'd'];
    const random = seededRandom(20_260_125);

    for (let run = 0; run < 200; run += 1) {
      const state = emptyPullDueState();
      const running = new Set<string>();
      const pushStartAt: Record<string, number> = {};
      let now = 0;
      let windowVisible = true;

      for (let step = 0; step < 60; step += 1) {
        const action = pick(['push', 'branches', 'wait', 'window', 'finish', 'tick'], random);

        if (action === 'push') {
          notePush(state, pick(keys, random), now);
        }

        if (action === 'branches') {
          noteBranches(state, pick(keys, random), now);
        }

        if (action === 'wait') {
          now += Math.floor(random() * 20_000);
        }

        if (action === 'window') {
          windowVisible = random() < 0.5;
        }

        if (action === 'finish' && running.size > 0) {
          const key = pick([...running], random);

          running.delete(key);

          const read = random() < 0.3 ? failedRead() : goodRead();

          noteResult(state, key, read, now);
        }

        if (action !== 'tick') {
          continue;
        }

        const due = duePullReads(state, keys, running, now, windowVisible);

        expect(due.length + running.size).toBeLessThanOrEqual(2);

        for (const key of due) {
          const pushDueAt = state.repositories[key]?.pushDueAt ?? null;
          const pushRead = pushDueAt !== null && pushDueAt <= now;
          const branchesDueAt = state.repositories[key]?.branchesDueAt ?? null;
          const branchRead = branchesDueAt !== null && branchesDueAt <= now;
          const lastPushStart = pushStartAt[key];

          if (!pushRead && !branchRead && lastPushStart !== undefined) {
            expect(now - lastPushStart).toBeGreaterThanOrEqual(15_000);
          }

          if (pushRead) {
            pushStartAt[key] = now;
          }

          running.add(key);
          noteStart(state, key, now);
        }
      }
    }
  });
});

describe('emptyPullDueState', () => {
  test('leaves every repository undecided and no pause', () => {
    const state = emptyPullDueState();

    expect(keysOf(state, ['a'])).toEqual([]);
    expect(state.pausedUntil).toBe(0);
  });
});
