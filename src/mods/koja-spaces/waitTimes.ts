import type { Status } from 'herdr';

import { shortAge } from '../../kit/age.ts';
import { recordOf, stringOf } from '../../kit/fields.ts';
import { pruneRecord } from './cache.ts';

interface EnteredTime {
  status: Status;
  at: number;
}

export interface WaitTimes {
  entered: Record<string, EnteredTime>;
  shown: Record<string, number>;
  active: string | null;
}

export interface WaitInput {
  statuses: Readonly<Record<string, Status | null>>;
  active: string | null;
  now: number;
}

export interface WaitAdvance {
  times: WaitTimes;
  changed: boolean;
}

export interface WaitingSpace {
  id: string;
  status: Status | null;
  active: boolean;
}

export const emptyWaitTimes: WaitTimes = {
  entered: {},
  shown: {},
  active: null,
};

const statuses: readonly Status[] = ['working', 'blocked', 'done', 'idle'];

const statusOf = (value: unknown): Status | null =>
  statuses.find((status) => status === value) ?? null;

const timeOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const readEntered = (value: unknown): EnteredTime | null => {
  const record = recordOf(value);
  const status = statusOf(record['status']);
  const at = timeOf(record['at']);

  if (status === null || at === null) {
    return null;
  }

  return { status, at };
};

const readRecord = <T>(
  value: unknown,
  readEntry: (entry: unknown) => T | null,
): Record<string, T> => {
  const read: Record<string, T> = {};

  for (const [id, entry] of Object.entries(recordOf(value))) {
    const parsed = readEntry(entry);

    if (parsed !== null) {
      read[id] = parsed;
    }
  }

  return read;
};

const parsedJson = (text: string): unknown => {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return null;
  }
};

export const readWaitTimes = (text: string | null): WaitTimes => {
  const record = recordOf(parsedJson(text ?? '{}'));

  return {
    entered: readRecord(record['entered'], readEntered),
    shown: readRecord(record['shown'], timeOf),
    active: stringOf(record['active']),
  };
};

const advanceEntered = (
  entered: Readonly<Record<string, EnteredTime>>,
  input: WaitInput,
): Record<string, EnteredTime> => {
  const next: Record<string, EnteredTime> = {};

  for (const [id, status] of Object.entries(input.statuses)) {
    const previous = entered[id];

    if (status !== null) {
      next[id] = previous?.status === status ? previous : { status, at: input.now };
    }
  }

  return next;
};

const statusChanged = (
  before: Readonly<Record<string, EnteredTime>>,
  after: Readonly<Record<string, EnteredTime>>,
): boolean => {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);

  return [...ids].some((id) => before[id] !== after[id]);
};

export const advanceWaitTimes = (times: WaitTimes, input: WaitInput): WaitAdvance => {
  const live = new Set(Object.keys(input.statuses));
  const entered = advanceEntered(times.entered, input);
  const shown = pruneRecord(times.shown, live);

  if (input.active !== null && live.has(input.active)) {
    shown[input.active] = input.now;
  }

  const changed = statusChanged(times.entered, entered) || times.active !== input.active;

  return { times: { entered, shown, active: input.active }, changed };
};

const waitStart = (times: WaitTimes, space: WaitingSpace): number | null => {
  if (space.status === 'working') {
    return null;
  }

  if (space.status === null || space.status === 'idle') {
    return times.shown[space.id] ?? null;
  }

  const entered = times.entered[space.id];

  return entered?.status === space.status ? entered.at : null;
};

const millisecondsPerSecond = 1000;

export const waitAge = (times: WaitTimes, space: WaitingSpace, now: number): string | null => {
  const since = space.active ? null : waitStart(times, space);

  if (since === null) {
    return null;
  }

  return shortAge(since / millisecondsPerSecond, now / millisecondsPerSecond);
};
