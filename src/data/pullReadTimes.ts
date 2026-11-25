import { hasOnlyKeys, isRecord, recordOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';
import type { Lease, ReadShared, WriteShared } from './lease.ts';
import { holdsLease } from './lease.ts';
import type { RecordNotices } from './recordNotices.ts';
import { recordNotices } from './recordNotices.ts';
import { sameValue } from './sortedValue.ts';

export interface RepositoryReadTimes {
  list: number;
  checks: Record<string, number>;
  threads: Record<string, number>;
}

export type PullReadTimes = Record<string, RepositoryReadTimes>;

interface PullReadTimesRecord {
  version: 2;
  repositories: PullReadTimes;
}

export interface PullReadTimesPublisher {
  publish: (lease: Lease, times: PullReadTimes) => void;
}

export const pullReadTimesKey = 'koja.data.v1.pullReadTimes';

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isPartKey = (key: string): boolean => {
  const number = Number(key);

  return isPositiveWholeNumber(number) && String(number) === key;
};

const parseTimes = (value: unknown): Record<string, number> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const entries: [string, number][] = [];

  for (const [key, time] of Object.entries(value)) {
    if (!isPartKey(key) || !isTime(time)) {
      return null;
    }

    entries.push([key, time]);
  }

  return Object.fromEntries(entries);
};

const parseRepositoryReadTimes = (value: unknown): RepositoryReadTimes | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['list', 'checks', 'threads'])) {
    return null;
  }

  const list = value['list'];

  if (!isTime(list)) {
    return null;
  }

  const checks = parseTimes(value['checks']);

  if (checks === null) {
    return null;
  }

  const threads = parseTimes(value['threads']);

  if (threads === null) {
    return null;
  }

  return { list, checks, threads };
};

const parseVersion1 = (value: Record<string, unknown>): PullReadTimes | null => {
  if (!hasOnlyKeys(value, ['version', 'pulls']) || !isRecord(value['pulls'])) {
    return null;
  }

  const entries: [string, RepositoryReadTimes][] = [];

  for (const [key, time] of Object.entries(value['pulls'])) {
    if (!isTime(time)) {
      return null;
    }

    entries.push([key, { list: time, checks: {}, threads: {} }]);
  }

  return Object.fromEntries(entries);
};

const parseVersion2 = (value: Record<string, unknown>): PullReadTimes | null => {
  if (!hasOnlyKeys(value, ['version', 'repositories']) || !isRecord(value['repositories'])) {
    return null;
  }

  const entries: [string, RepositoryReadTimes][] = [];

  for (const [key, stored] of Object.entries(value['repositories'])) {
    const parsed = parseRepositoryReadTimes(stored);

    if (parsed === null) {
      return null;
    }

    entries.push([key, parsed]);
  }

  return Object.fromEntries(entries);
};

const parsePullReadTimes = (value: unknown): PullReadTimes | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value['version'] === 1) {
    return parseVersion1(value);
  }

  if (value['version'] !== 2) {
    return null;
  }

  return parseVersion2(value);
};

const isNewerVersion = (version: unknown): boolean => isPositiveWholeNumber(version) && version > 2;

const storedPullReadTimes = (read: ReadShared, notices: RecordNotices): PullReadTimes | null => {
  const value = read(pullReadTimesKey);
  const times = parsePullReadTimes(value);

  if (times !== null) {
    return times;
  }

  if (value === undefined || value === null) {
    return null;
  }

  const rejection = isNewerVersion(recordOf(value).version) ? 'newer' : 'malformed';

  notices.report('pullReadTimes', rejection);

  return null;
};

export const readPullReadTimes = (read: ReadShared, notices: RecordNotices): PullReadTimes =>
  storedPullReadTimes(read, notices) ?? {};

export const createPullReadTimesPublisher = (
  read: ReadShared,
  write: WriteShared,
  now: () => number,
): PullReadTimesPublisher => ({
  publish: (lease, times) => {
    if (!holdsLease(read, lease, now())) {
      return;
    }

    const stored = storedPullReadTimes(read, recordNotices);

    if (stored !== null && sameValue(stored, times)) {
      return;
    }

    const record: PullReadTimesRecord = { version: 2, repositories: times };

    write(pullReadTimesKey, record);
  },
});
