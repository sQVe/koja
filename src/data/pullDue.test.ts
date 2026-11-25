import { describe, expect, test } from 'bun:test';

import { pick, seededRandom } from '../../tests/gitSchedulerHarness.ts';
import type { PullDueState } from './pullDue.ts';
import { duePullReads, emptyPullDueState, notePush, noteResult, noteStart } from './pullDue.ts';
import type { PullRead } from './pulls.ts';

const nothingRunning = new Set<string>();

const goodRead = (): Exclude<PullRead, { kind: 'dropped' }> => ({
  kind: 'read',
  pulls: [],
  rateLimit: null,
});

const failedRead = (): Exclude<PullRead, { kind: 'dropped' }> => ({
  kind: 'failed',
  rateLimited: false,
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

  test('pauses every read until the rate limit resets', () => {
    const state = emptyPullDueState();

    noteStart(state, 'a', 0);

    noteResult(
      state,
      'a',
      { kind: 'read', pulls: [], rateLimit: { remaining: 50, resetAt: 900_000 } },
      0,
    );

    notePush(state, 'a', 800_000);

    expect(duePullReads(state, ['a'], nothingRunning, 899_999, false)).toEqual([]);
    expect(duePullReads(state, ['a'], nothingRunning, 900_000, true)).toEqual(['a']);
  });

  test('the queue keeps its limits for any order of events', () => {
    const keys = ['a', 'b', 'c', 'd'];
    const random = seededRandom(20_260_125);

    for (let run = 0; run < 200; run += 1) {
      const state = emptyPullDueState();
      const running = new Set<string>();
      const pushStartAt: Record<string, number> = {};
      let now = 0;
      let windowActive = true;

      for (let step = 0; step < 60; step += 1) {
        const action = pick(['push', 'wait', 'window', 'finish', 'tick'], random);

        if (action === 'push') {
          notePush(state, pick(keys, random), now);
        }

        if (action === 'wait') {
          now += Math.floor(random() * 20_000);
        }

        if (action === 'window') {
          windowActive = random() < 0.5;
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

        const due = duePullReads(state, keys, running, now, windowActive);

        expect(due.length + running.size).toBeLessThanOrEqual(2);

        for (const key of due) {
          const pushDueAt = state.repositories[key]?.pushDueAt ?? null;
          const pushRead = pushDueAt !== null && pushDueAt <= now;
          const lastPushStart = pushStartAt[key];

          if (!pushRead && lastPushStart !== undefined) {
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
