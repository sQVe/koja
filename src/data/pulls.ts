import { hasOnlyKeys, isRecord, listOf, numberOf, recordOf, stringOf } from '../kit/fields.ts';
import type { RepositoryIdentity, RunCommand } from './gitIdentity.ts';

export type PullChecks = 'passing' | 'failing' | 'running' | 'none';

export interface PullThreads {
  unresolved: number;
  complete: boolean;
}

export type PullPart<T> =
  | { kind: 'read'; value: T }
  | { kind: 'failed'; last: T | null }
  | { kind: 'unread' };

export type PullMergeable = 'mergeable' | 'conflicting' | 'unknown';

export type PullMergeState =
  | 'clean'
  | 'hasHooks'
  | 'blocked'
  | 'behind'
  | 'dirty'
  | 'draft'
  | 'unstable'
  | 'unknown';

export type PullReview = 'approved' | 'changesRequested' | 'reviewRequired' | 'none';

export interface Pull {
  number: number;
  state: string;
  isDraft: boolean;
  title: string;
  headRefName: string;
  mergeable: PullMergeable;
  mergeState: PullMergeState;
  review: PullReview;
  checks: PullPart<PullChecks>;
  threads: PullPart<PullThreads>;
}

export type PullRead = { kind: 'read'; pulls: Pull[] } | { kind: 'failed' } | { kind: 'dropped' };

type PullNeedsFields = Pick<Pull, 'mergeable' | 'mergeState' | 'review' | 'checks' | 'threads'>;

const pullFieldNames = ['number', 'state', 'isDraft', 'title', 'headRefName'];

const needsFieldNames = ['mergeable', 'mergeState', 'review', 'checks', 'threads'];

const storedPullFieldNames = [...pullFieldNames, ...needsFieldNames];

const pullFields = pullFieldNames.join(',');

const mergeables: readonly PullMergeable[] = ['mergeable', 'conflicting', 'unknown'];

const mergeStates: readonly PullMergeState[] = [
  'clean',
  'hasHooks',
  'blocked',
  'behind',
  'dirty',
  'draft',
  'unstable',
  'unknown',
];

const reviews: readonly PullReview[] = ['approved', 'changesRequested', 'reviewRequired', 'none'];

const checksValues: readonly PullChecks[] = ['passing', 'failing', 'running', 'none'];

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  values.some((entry) => entry === value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const unreadPullNeeds = (): PullNeedsFields => ({
  mergeable: 'unknown',
  mergeState: 'unknown',
  review: 'none',
  checks: { kind: 'unread' },
  threads: { kind: 'unread' },
});

const decodePull = (fields: Record<string, unknown>): Pull | null => {
  const number = numberOf(fields['number']);

  if (number === null) {
    return null;
  }

  const state = stringOf(fields['state']);

  if (state === null) {
    return null;
  }

  const isDraft = fields['isDraft'];

  if (typeof isDraft !== 'boolean') {
    return null;
  }

  const title = stringOf(fields['title']);

  if (title === null) {
    return null;
  }

  const headRefName = stringOf(fields['headRefName']);

  if (headRefName === null) {
    return null;
  }

  return { number, state, isDraft, title, headRefName, ...unreadPullNeeds() };
};

const decodePart = <T>(
  value: unknown,
  decodeValue: (stored: unknown) => T | null,
): PullPart<T> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const kind = value['kind'];

  if (kind === 'unread') {
    return hasOnlyKeys(value, ['kind']) ? { kind } : null;
  }

  if (kind === 'read') {
    if (!hasOnlyKeys(value, ['kind', 'value'])) {
      return null;
    }

    const decoded = decodeValue(value['value']);

    return decoded === null ? null : { kind, value: decoded };
  }

  if (kind !== 'failed' || !hasOnlyKeys(value, ['kind', 'last'])) {
    return null;
  }

  const last = value['last'];

  if (last === null) {
    return { kind, last: null };
  }

  const decoded = decodeValue(last);

  return decoded === null ? null : { kind, last: decoded };
};

const decodeThreads = (value: unknown): PullThreads | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['unresolved', 'complete'])) {
    return null;
  }

  const unresolved = value['unresolved'];

  if (!isCount(unresolved)) {
    return null;
  }

  const complete = value['complete'];

  if (typeof complete !== 'boolean') {
    return null;
  }

  return { unresolved, complete };
};

const decodeChecks = (value: unknown): PullChecks | null =>
  isOneOf(checksValues, value) ? value : null;

const decodePullNeeds = (fields: Record<string, unknown>): PullNeedsFields | null => {
  const mergeable = fields['mergeable'];

  if (!isOneOf(mergeables, mergeable)) {
    return null;
  }

  const mergeState = fields['mergeState'];

  if (!isOneOf(mergeStates, mergeState)) {
    return null;
  }

  const review = fields['review'];

  if (!isOneOf(reviews, review)) {
    return null;
  }

  const checks = decodePart(fields['checks'], decodeChecks);

  if (checks === null) {
    return null;
  }

  const threads = decodePart(fields['threads'], decodeThreads);

  if (threads === null) {
    return null;
  }

  return { mergeable, mergeState, review, checks, threads };
};

export const parseStoredPull = (value: unknown): Pull | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, storedPullFieldNames)) {
    return null;
  }

  const pull = decodePull(value);

  if (pull === null) {
    return null;
  }

  const needs = decodePullNeeds(value);

  return needs === null ? null : { ...pull, ...needs };
};

const decodeCommandPull = (value: unknown): Pull | null => {
  const fields = recordOf(value);

  const base = decodePull({
    ...fields,
    title: stringOf(fields['title']) ?? '',
    isDraft: fields['isDraft'] === true,
  });

  return base === null ? null : { ...base, ...unreadPullNeeds() };
};

export const readPullList = (value: unknown): Pull[] =>
  listOf(value)
    .map(decodeCommandPull)
    .filter((pull): pull is Pull => pull !== null);

export const readRepositoryPulls = async (
  run: RunCommand,
  repository: RepositoryIdentity,
  cwd: string,
  stillOwner: () => boolean,
): Promise<PullRead> => {
  try {
    const remotes = await run('git', ['remote'], { cwd, on: repository.machine });

    if (remotes.code !== 0) {
      return { kind: 'failed' };
    }

    if (!stillOwner()) {
      return { kind: 'dropped' };
    }

    if (remotes.stdout.trim() === '') {
      return { kind: 'read', pulls: [] };
    }

    const args = ['pr', 'list', '--state', 'all', '--limit', '100', '--json', pullFields];
    const result = await run('gh', args, { cwd, on: repository.machine });

    if (result.code !== 0) {
      return { kind: 'failed' };
    }

    const value: unknown = JSON.parse(result.stdout);

    if (!Array.isArray(value)) {
      return { kind: 'failed' };
    }

    const pulls = readPullList(value);

    if (value.length > 0 && pulls.length === 0) {
      return { kind: 'failed' };
    }

    return { kind: 'read', pulls };
  } catch {
    return { kind: 'failed' };
  }
};
