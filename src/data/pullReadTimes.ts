import { hasOnlyKeys, isRecord, recordOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';
import type { Lease, ReadShared, WriteShared } from './lease.ts';
import { holdsLease } from './lease.ts';
import type { RecordNotices } from './recordNotices.ts';
import { recordNotices } from './recordNotices.ts';
import { sameValue } from './sortedValue.ts';

interface PullReadTimesRecord {
  version: 1;
  pulls: Record<string, number>;
}

export interface PullReadTimesPublisher {
  publish: (lease: Lease, times: Record<string, number>) => void;
}

export const pullReadTimesKey = 'koja.data.v1.pullReadTimes';

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const parsePullReadTimes = (value: unknown): Record<string, number> | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['version', 'pulls'])) {
    return null;
  }

  if (value.version !== 1) {
    return null;
  }

  if (!isRecord(value.pulls)) {
    return null;
  }

  const entries: [string, number][] = [];

  for (const [key, time] of Object.entries(value.pulls)) {
    if (!isTime(time)) {
      return null;
    }

    entries.push([key, time]);
  }

  return Object.fromEntries(entries);
};

const isNewerVersion = (version: unknown): boolean => isPositiveWholeNumber(version) && version > 1;

const storedPullReadTimes = (
  read: ReadShared,
  notices: RecordNotices,
): Record<string, number> | null => {
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

export const readPullReadTimes = (
  read: ReadShared,
  notices: RecordNotices,
): Record<string, number> => storedPullReadTimes(read, notices) ?? {};

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

    const record: PullReadTimesRecord = { version: 1, pulls: times };

    write(pullReadTimesKey, record);
  },
});
