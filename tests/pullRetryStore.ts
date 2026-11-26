import type { ReadShared } from '../src/data/lease.ts';
import type { PullRetryRequest } from '../src/data/pullRetry/pullRetry.ts';
import { readPullRetryRequests } from '../src/data/pullRetry/pullRetry.ts';
import type { RecordNotices, RecordRejection } from '../src/data/recordNotices.ts';
import { createRecordNotices } from '../src/data/recordNotices.ts';

export interface MemoryStore {
  values: Record<string, unknown>;
  writes: string[];
  read: (key: string) => unknown;
  write: (key: string, value: unknown) => void;
}

export const repositoryKey = JSON.stringify([null, '/code/koja/.git']);
export const otherRepositoryKey = JSON.stringify([null, '/code/other/.git']);
export const start = 1_000_000;

export const memoryStore = (): MemoryStore => {
  const values: Record<string, unknown> = {};
  const writes: string[] = [];

  return {
    values,
    writes,
    read: (key: string): unknown => values[key],
    write: (key: string, value: unknown): void => {
      writes.push(key);
      values[key] = value;
    },
  };
};

const silentNotices = (): RecordNotices => createRecordNotices(() => {});

export const storeOf =
  (key: string, value: unknown): ReadShared =>
  (readKey: string): unknown =>
    readKey === key ? value : undefined;

export const logged = (): { messages: string[]; notices: RecordNotices } => {
  const messages: string[] = [];

  const notices = createRecordNotices((message) => {
    messages.push(message);
  });

  return { messages, notices };
};

export const noticeFor = (
  record: 'pullRetryRequests' | 'pullRetryOutcomes',
  rejection: RecordRejection,
): string => {
  const { messages, notices } = logged();

  notices.report(record, rejection);

  const [message] = messages;

  if (message === undefined) {
    throw new Error(`the ${record} reporter logged no ${rejection} notice`);
  }

  return message;
};

export const storedRequests = (
  store: { read: ReadShared },
  notices: RecordNotices = silentNotices(),
): PullRetryRequest[] => {
  const stored = readPullRetryRequests(store.read, notices);

  if (stored.kind !== 'current') {
    throw new Error('the store holds a newer request record');
  }

  return stored.items;
};

export const ids = (prefix: string): (() => string) => {
  let next = 0;

  return () => {
    next += 1;

    return `${prefix}-${next}`;
  };
};

export const requestFor = (consumer: string, id: string, at: number): PullRetryRequest => ({
  consumer,
  id,
  repository: repositoryKey,
  at,
});
