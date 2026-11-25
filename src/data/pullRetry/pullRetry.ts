import { hasOnlyKeys, isRecord, recordOf } from '../../kit/fields.ts';
import { isPositiveWholeNumber } from '../fields.ts';
import type { Lease, ReadShared, WriteShared } from '../lease.ts';
import { holdsLease } from '../lease.ts';
import type { RecordNotices } from '../recordNotices.ts';
import { recordNotices } from '../recordNotices.ts';
import { sameValue } from '../sortedValue.ts';

export interface PullRetryRequest {
  consumer: string;
  id: string;
  repository: string;
  at: number;
}

export type PullRetryResult = 'read' | 'failed';

export interface PullRetryOutcome {
  consumer: string;
  id: string;
  result: PullRetryResult;
}

export type StoredList<T> = { kind: 'current'; items: T[] } | { kind: 'newer' };

export interface PullRetryClient {
  request: (repository: string, now: number) => void;
  pending: (repository: string, now: number) => boolean;
  settle: (now: number) => void;
}

export interface PullRetryOutcomesPublisher {
  publish: (lease: Lease, outcomes: PullRetryOutcome[]) => void;
}

type PullRetryRecordName = 'pullRetryRequests' | 'pullRetryOutcomes';

interface PendingRequest {
  id: string;
  repository: string;
  at: number;
}

export const pullRetryRequestsKey = 'koja.data.v1.pullRetryRequests';
export const pullRetryOutcomesKey = 'koja.data.v1.pullRetryOutcomes';
export const pullRetryLifetimeMilliseconds = 120_000;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isResult = (value: unknown): value is PullRetryResult =>
  value === 'read' || value === 'failed';

export const isExpired = (at: number, now: number): boolean =>
  now >= at + pullRetryLifetimeMilliseconds;

const isNewerVersion = (version: unknown): boolean => isPositiveWholeNumber(version) && version > 1;

const parseRequest = (value: unknown): PullRetryRequest | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['consumer', 'id', 'repository', 'at'])) {
    return null;
  }

  if (!isNonEmptyString(value.consumer) || !isNonEmptyString(value.id)) {
    return null;
  }

  if (!isNonEmptyString(value.repository) || !isTime(value.at)) {
    return null;
  }

  return { consumer: value.consumer, id: value.id, repository: value.repository, at: value.at };
};

const parseOutcome = (value: unknown): PullRetryOutcome | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['consumer', 'id', 'result'])) {
    return null;
  }

  if (!isNonEmptyString(value.consumer) || !isNonEmptyString(value.id)) {
    return null;
  }

  if (!isResult(value.result)) {
    return null;
  }

  return { consumer: value.consumer, id: value.id, result: value.result };
};

const parseItems = <T>(
  value: unknown,
  field: string,
  parseItem: (item: unknown) => T | null,
): T[] | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', field])) {
    return null;
  }

  if (value.version !== 1 || !Array.isArray(value[field])) {
    return null;
  }

  const items: T[] = [];

  for (const item of value[field]) {
    const parsed = parseItem(item);

    if (parsed === null) {
      return null;
    }

    items.push(parsed);
  }

  return items;
};

const storedList = <T>(
  read: ReadShared,
  notices: RecordNotices,
  record: PullRetryRecordName,
  key: string,
  field: string,
  parseItem: (item: unknown) => T | null,
): StoredList<T> => {
  const value = read(key);
  const items = parseItems(value, field, parseItem);

  if (items !== null) {
    return { kind: 'current', items };
  }

  if (value === undefined || value === null) {
    return { kind: 'current', items: [] };
  }

  if (isNewerVersion(recordOf(value).version)) {
    notices.report(record, 'newer');

    return { kind: 'newer' };
  }

  notices.report(record, 'malformed');

  return { kind: 'current', items: [] };
};

export const readPullRetryRequests = (
  read: ReadShared,
  notices: RecordNotices,
): StoredList<PullRetryRequest> =>
  storedList(read, notices, 'pullRetryRequests', pullRetryRequestsKey, 'requests', parseRequest);

export const readPullRetryOutcomes = (
  read: ReadShared,
  notices: RecordNotices,
): StoredList<PullRetryOutcome> =>
  storedList(read, notices, 'pullRetryOutcomes', pullRetryOutcomesKey, 'outcomes', parseOutcome);

export const requestKey = (request: { consumer: string; id: string }): string =>
  JSON.stringify([request.consumer, request.id]);

export const answeredRequestKeys = (read: ReadShared): Set<string> => {
  const stored = readPullRetryOutcomes(read, recordNotices);

  if (stored.kind === 'newer') {
    return new Set();
  }

  return new Set(stored.items.map(requestKey));
};

export const createPullRetryClient = (
  store: { read: ReadShared; write: WriteShared },
  consumer: string,
  newId: () => string,
): PullRetryClient => {
  const pending = new Map<string, PendingRequest>();

  const isLive = (entry: PendingRequest, now: number): boolean => !isExpired(entry.at, now);

  const pendingFor = (repository: string, now: number): boolean => {
    for (const entry of pending.values()) {
      if (entry.repository === repository && isLive(entry, now)) {
        return true;
      }
    }

    return false;
  };

  const isLiveStoredRequest = (request: PullRetryRequest, now: number): boolean => {
    if (isExpired(request.at, now)) {
      return false;
    }

    return request.consumer !== consumer || pending.has(requestKey(request));
  };

  const settle = (now: number): void => {
    const stored = readPullRetryRequests(store.read, recordNotices);
    const answered = answeredRequestKeys(store.read);

    for (const [key, entry] of pending) {
      if (!isLive(entry, now) || answered.has(key)) {
        pending.delete(key);
      }
    }

    if (stored.kind === 'newer') {
      return;
    }

    const live = stored.items.filter((request) => isLiveStoredRequest(request, now));
    const present = new Set(live.map(requestKey));

    const appended = [...pending.entries()]
      .filter(([key]) => !present.has(key))
      .map(([, entry]) => ({
        consumer,
        id: entry.id,
        repository: entry.repository,
        at: entry.at,
      }));

    const requests = [...live, ...appended];

    if (sameValue(requests, stored.items)) {
      return;
    }

    store.write(pullRetryRequestsKey, { version: 1, requests });
  };

  return {
    request: (repository, now) => {
      if (pendingFor(repository, now)) {
        return;
      }

      const id = newId();

      pending.set(requestKey({ consumer, id }), { id, repository, at: now });
      settle(now);
    },
    pending: pendingFor,
    settle,
  };
};

export const createPullRetryOutcomesPublisher = (
  read: ReadShared,
  write: WriteShared,
  now: () => number,
): PullRetryOutcomesPublisher => ({
  publish: (lease, outcomes) => {
    if (!holdsLease(read, lease, now())) {
      return;
    }

    const stored = readPullRetryOutcomes(read, recordNotices);

    if (stored.kind === 'newer' || sameValue(stored.items, outcomes)) {
      return;
    }

    write(pullRetryOutcomesKey, { version: 1, outcomes });
  },
});
