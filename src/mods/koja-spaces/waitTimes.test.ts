import { describe, expect, test } from 'bun:test';

import type { Status } from 'herdr';

import type { WaitTimes } from './waitTimes.ts';
import { advanceWaitTimes, emptyWaitTimes, readWaitTimes, waitAge } from './waitTimes.ts';

const minute = 60_000;

const start = 1_700_000_000_000;

const advanced = (
  times: WaitTimes,
  statuses: Record<string, Status | null>,
  active: string | null,
  now: number,
): WaitTimes => advanceWaitTimes(times, { statuses, active, now }).times;

const ageOf = (
  times: WaitTimes,
  space: { id: string; status: Status | null; active?: boolean },
  now: number,
): string | null => waitAge(times, { active: false, ...space }, now);

describe('waitAge', () => {
  test('a blocked space has the age since it became blocked', () => {
    const times = advanced(emptyWaitTimes, { a: 'blocked' }, null, start);

    expect(ageOf(times, { id: 'a', status: 'blocked' }, start + 5 * minute)).toBe('5m');
  });

  test('a blocked space has no age once its agent works again', () => {
    const blocked = advanced(emptyWaitTimes, { a: 'blocked' }, null, start);
    const working = advanced(blocked, { a: 'working' }, null, start + minute);

    expect(ageOf(working, { id: 'a', status: 'working' }, start + 5 * minute)).toBeNull();
  });

  test('a done space keeps the time it entered done while it stays done', () => {
    const first = advanced(emptyWaitTimes, { a: 'done' }, null, start);
    const later = advanced(first, { a: 'done' }, null, start + 3 * minute);

    expect(ageOf(later, { id: 'a', status: 'done' }, start + 7 * minute)).toBe('7m');
  });

  test('a space that turns from blocked to done starts a new clock', () => {
    const blocked = advanced(emptyWaitTimes, { a: 'blocked' }, null, start);
    const done = advanced(blocked, { a: 'done' }, null, start + 4 * minute);

    expect(ageOf(done, { id: 'a', status: 'done' }, start + 6 * minute)).toBe('2m');
  });

  test('an idle space has the age since the user last showed it', () => {
    const opened = advanced(emptyWaitTimes, { a: 'idle', b: null }, 'a', start);
    const shown = advanced(opened, { a: 'idle', b: null }, 'a', start + 2 * minute);
    const left = advanced(shown, { a: 'idle', b: null }, 'b', start + 3 * minute);

    expect(ageOf(left, { id: 'a', status: 'idle' }, start + 10 * minute)).toBe('8m');
  });

  test('a space without an agent has the age since the user last showed it', () => {
    const shown = advanced(emptyWaitTimes, { a: null, b: null }, 'a', start);
    const left = advanced(shown, { a: null, b: null }, 'b', start + minute);

    expect(ageOf(left, { id: 'a', status: null }, start + 4 * minute)).toBe('4m');
  });

  test('the shown space has no age', () => {
    const times = advanced(emptyWaitTimes, { a: 'blocked' }, 'a', start);

    expect(
      ageOf(times, { id: 'a', status: 'blocked', active: true }, start + 9 * minute),
    ).toBeNull();
  });

  test('an idle space the user never showed has no age', () => {
    const times = advanced(emptyWaitTimes, { a: 'idle' }, null, start);

    expect(ageOf(times, { id: 'a', status: 'idle' }, start + 9 * minute)).toBeNull();
  });

  test('a blocked space with no recorded time has no age', () => {
    expect(ageOf(emptyWaitTimes, { id: 'a', status: 'blocked' }, start)).toBeNull();
  });

  test('a removed space loses its times', () => {
    const shown = advanced(emptyWaitTimes, { a: 'blocked', b: null }, 'a', start);
    const gone = advanced(shown, { b: null }, 'b', start + minute);
    const back = advanced(gone, { a: 'blocked', b: null }, 'b', start + 2 * minute);

    expect(ageOf(back, { id: 'a', status: 'blocked' }, start + 5 * minute)).toBe('3m');
  });

  test('a shown id that is not a live space gets no shown time', () => {
    const missing = advanced(emptyWaitTimes, { a: null }, 'b', start);
    const appeared = advanced(missing, { a: null, b: 'idle' }, 'a', start + minute);

    expect(ageOf(appeared, { id: 'b', status: 'idle' }, start + 5 * minute)).toBeNull();
  });
});

describe('advanceWaitTimes', () => {
  test('reports a change when a status changes', () => {
    const first = advanced(emptyWaitTimes, { a: 'working' }, 'a', start);

    expect(
      advanceWaitTimes(first, {
        statuses: { a: 'blocked' },
        active: 'a',
        now: start + 1,
      }).changed,
    ).toBe(true);
  });

  test('reports a change when the shown space changes', () => {
    const first = advanced(emptyWaitTimes, { a: null, b: null }, 'a', start);

    expect(
      advanceWaitTimes(first, {
        statuses: { a: null, b: null },
        active: 'b',
        now: start + 1,
      }).changed,
    ).toBe(true);
  });

  test('reports no change when only time passes', () => {
    const first = advanced(emptyWaitTimes, { a: 'blocked' }, 'a', start);

    expect(
      advanceWaitTimes(first, {
        statuses: { a: 'blocked' },
        active: 'a',
        now: start + minute,
      }).changed,
    ).toBe(false);
  });

  test('reports a change when one of several spaces changes status', () => {
    const first = advanced(emptyWaitTimes, { a: 'idle', b: 'working', c: 'done' }, 'a', start);
    const statuses = { a: 'idle', b: 'blocked', c: 'done' } as const;

    expect(advanceWaitTimes(first, { statuses, active: 'a', now: start + 1 }).changed).toBe(true);
  });
});

const saved = (times: WaitTimes): string => JSON.stringify(times);

describe('readWaitTimes', () => {
  test('a state read from its saved value keeps both ages', () => {
    const opened = advanced(emptyWaitTimes, { a: 'blocked', b: 'idle' }, 'b', start);
    const shown = advanced(opened, { a: 'blocked', b: 'idle' }, 'b', start + minute);
    const left = advanced(shown, { a: 'blocked', b: 'idle' }, 'a', start + 2 * minute);
    const restored = readWaitTimes(saved(left));
    const later = advanced(restored, { a: 'blocked', b: 'idle' }, 'a', start + 6 * minute);

    expect(ageOf(later, { id: 'a', status: 'blocked' }, start + 6 * minute)).toBe('6m');
    expect(ageOf(later, { id: 'b', status: 'idle' }, start + 6 * minute)).toBe('5m');
  });

  test('a state read from its saved value keeps its shown space', () => {
    const statuses = { a: 'blocked', b: 'idle' } as const;
    const first = advanced(emptyWaitTimes, statuses, 'b', start);
    const restored = readWaitTimes(saved(first));

    expect(advanceWaitTimes(restored, { statuses, active: 'b', now: start + 1 }).changed).toBe(
      false,
    );
  });

  test('a saved status that differs from the current one starts a new clock', () => {
    const blocked = advanced(emptyWaitTimes, { a: 'blocked' }, null, start);
    const restored = readWaitTimes(saved(blocked));
    const done = advanced(restored, { a: 'done' }, null, start + 4 * minute);

    expect(ageOf(done, { id: 'a', status: 'done' }, start + 5 * minute)).toBe('1m');
  });

  test('invalid JSON gives an empty state', () => {
    expect(readWaitTimes('{broken')).toEqual(emptyWaitTimes);
  });

  test('a value that is not an object gives an empty state', () => {
    expect(readWaitTimes('"broken"')).toEqual(emptyWaitTimes);
  });

  test('no saved value gives an empty state', () => {
    expect(readWaitTimes(null)).toEqual(emptyWaitTimes);
  });

  test('drops malformed entries and keeps the rest', () => {
    const entered = {
      a: { status: 'blocked', at: start },
      b: { status: 'asleep', at: start },
      c: { status: 'done', at: 'soon' },
      e: 'blocked',
    };

    const text = JSON.stringify({
      entered,
      shown: { a: start, b: 'yesterday', c: null },
      active: 7,
    });

    expect(readWaitTimes(text)).toEqual({
      entered: { a: { status: 'blocked', at: start } },
      shown: { a: start },
      active: null,
    });
  });

  test('drops a time that is not a finite number', () => {
    const text = `{"entered":{"a":{"status":"done","at":1e999}},"shown":{"a":-1e999}}`;

    expect(readWaitTimes(text)).toEqual(emptyWaitTimes);
  });
});
