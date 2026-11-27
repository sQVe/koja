import type { ExecResult } from 'herdr';

import { hasOnlyKeys, isRecord, numberOf, stringOf } from '../kit/fields.ts';
import type { RunCommand } from './gitIdentity.ts';
import type {
  BatchErrors,
  PullChecks,
  PullMergeable,
  PullMergeState,
  PullPart,
  PullRateLimit,
  PullReview,
  PullStatusNames,
  PullThreads,
} from './pullAnswer.ts';
import {
  batchErrorsOf,
  bodyOf,
  checksPartOf,
  isCount,
  rateLimitedIn,
  rateLimitOf,
  statusNamesOf,
  threadsPartOf,
  unknownListOf,
} from './pullAnswer.ts';
import { batchesOf, pullQueryArgs } from './pullQuery.ts';
import type { PullRemote } from './pullRemote.ts';
import {
  ghResolvedConfigKey,
  markedRemoteOf,
  remoteLookup,
  remoteNameOf,
  remoteNamesOf,
} from './pullRemote.ts';
import type { PullSource } from './pullSources.ts';

export interface Pull extends PullStatusNames {
  number: number;
  state: string;
  isDraft: boolean;
  title: string;
  url: string;
  headRefName: string;
  checks: PullPart<PullChecks>;
  threads: PullPart<PullThreads>;
}

type BranchPull = { kind: 'pull'; pull: Pull } | { kind: 'none' } | { kind: 'malformed' };

interface BatchRead {
  pulls: Pull[];
  rateLimit: PullRateLimit | null;
}

type BatchAnswer = { kind: 'read'; read: BatchRead } | { kind: 'failed' };

export type PullRead =
  | { kind: 'read'; pulls: Pull[]; rateLimit: PullRateLimit | null; host: string | null }
  | { kind: 'failed'; rateLimited: boolean; host: string | null }
  | { kind: 'dropped' };

type PullNeedsFields = Pick<Pull, 'mergeable' | 'mergeState' | 'review' | 'checks' | 'threads'>;

type RemoteChoice =
  | { kind: 'remote'; remote: string }
  | { kind: 'none' }
  | { kind: 'failed' }
  | { kind: 'dropped' };

type PullBase = Pick<Pull, 'number' | 'state' | 'isDraft' | 'title' | 'headRefName'>;

export const partValueOf = <T>(part: PullPart<T>): T | null => {
  if (part.kind === 'read') {
    return part.value;
  }

  if (part.kind === 'failed') {
    return part.last;
  }

  return null;
};

const pullFieldNames = ['number', 'state', 'isDraft', 'title', 'url', 'headRefName'];

const needsFieldNames = ['mergeable', 'mergeState', 'review', 'checks', 'threads'];

const storedPullFieldNames = [...pullFieldNames, ...needsFieldNames];

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

export const unreadPullNeeds = (): PullNeedsFields => ({
  mergeable: 'unknown',
  mergeState: 'unknown',
  review: 'none',
  checks: { kind: 'unread' },
  threads: { kind: 'unread' },
});

export const decodePullBase = (fields: Record<string, unknown>): PullBase | null => {
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

  return { number, state, isDraft, title, headRefName };
};

const decodePull = (fields: Record<string, unknown>): Pull | null => {
  const base = decodePullBase(fields);

  if (base === null) {
    return null;
  }

  const url = stringOf(fields['url']);

  if (url === null || url === '') {
    return null;
  }

  return { ...base, url, ...unreadPullNeeds() };
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

const openPullOf = (node: unknown, errors: BatchErrors, branch: number): Pull | null => {
  if (!isRecord(node)) {
    return null;
  }

  const base = decodePull(node);

  if (base === null) {
    return null;
  }

  const checks = checksPartOf(node, errors.checks.has(branch));

  if (checks === null) {
    return null;
  }

  const threads = threadsPartOf(node, errors.threads.has(branch));

  if (threads === null) {
    return null;
  }

  return { ...base, ...statusNamesOf(node), checks, threads };
};

const summaryPullOf = (node: unknown): Pull | null => (isRecord(node) ? decodePull(node) : null);

const aliasNodesOf = (repository: Record<string, unknown>, alias: string): unknown[] | null => {
  const entry = repository[alias];

  return isRecord(entry) ? unknownListOf(entry['nodes']) : null;
};

const branchPullOf = (
  repository: Record<string, unknown>,
  index: number,
  errors: BatchErrors,
): BranchPull => {
  const open = aliasNodesOf(repository, `open${index}`);
  const latest = aliasNodesOf(repository, `latest${index}`);

  if (open === null || latest === null) {
    return { kind: 'malformed' };
  }

  const [openNode] = open;
  const [latestNode] = latest;

  if (openNode !== undefined) {
    const pull = openPullOf(openNode, errors, index);

    return pull === null ? { kind: 'malformed' } : { kind: 'pull', pull };
  }

  if (latestNode === undefined) {
    return { kind: 'none' };
  }

  const pull = summaryPullOf(latestNode);

  return pull === null ? { kind: 'malformed' } : { kind: 'pull', pull };
};

const repositoryPullsOf = (
  repository: Record<string, unknown>,
  branches: string[],
  errors: BatchErrors,
): Pull[] | null => {
  const pulls: Pull[] = [];

  for (const [index] of branches.entries()) {
    const found = branchPullOf(repository, index, errors);

    if (found.kind === 'malformed') {
      return null;
    }

    if (found.kind === 'pull') {
      pulls.push(found.pull);
    }
  }

  return pulls;
};

const batchAnswerOf = (result: ExecResult, branches: string[]): BatchAnswer => {
  const failed: BatchAnswer = { kind: 'failed' };
  const body = bodyOf(result);

  if (body === null) {
    return failed;
  }

  const data = body['data'];

  if (!isRecord(data)) {
    return failed;
  }

  const repository = data['repository'];

  if (!isRecord(repository)) {
    return failed;
  }

  const errors = batchErrorsOf(body, branches.length);

  if (errors === null) {
    return failed;
  }

  const pulls = repositoryPullsOf(repository, branches, errors);

  if (pulls === null) {
    return failed;
  }

  return { kind: 'read', read: { pulls, rateLimit: rateLimitOf(data) } };
};

const hostOf = (remote: PullRemote | null): string | null => remote?.host ?? null;

const remoteChoiceOf = async (
  run: RunCommand,
  source: PullSource,
  stillOwner: () => boolean,
): Promise<RemoteChoice> => {
  const remotes = await run('git', ['remote'], {
    cwd: source.cwd,
    on: source.repository.machine,
  });

  if (remotes.code !== 0) {
    return { kind: 'failed' };
  }

  if (!stillOwner()) {
    return { kind: 'dropped' };
  }

  const names = remoteNamesOf(remotes.stdout);

  if (names.length === 0 || source.branches.length === 0) {
    return { kind: 'none' };
  }

  const [first] = names;

  // One remote is always the answer, so only a repository with a choice reads the mark.
  if (first !== undefined && names.length === 1) {
    return { kind: 'remote', remote: first };
  }

  const marked = await run('git', ['config', '--get-regexp', ghResolvedConfigKey], {
    cwd: source.cwd,
    on: source.repository.machine,
  });

  // git config exits 1 when no key matches, which means no remote is marked.
  if (marked.code !== 0 && marked.code !== 1) {
    return { kind: 'failed' };
  }

  if (!stillOwner()) {
    return { kind: 'dropped' };
  }

  const remote = remoteNameOf(names, markedRemoteOf(marked.stdout));

  return remote === null ? { kind: 'none' } : { kind: 'remote', remote };
};

export const readRepositoryPulls = async (
  run: RunCommand,
  source: PullSource,
  stillOwner: () => boolean,
): Promise<PullRead> => {
  try {
    const choice = await remoteChoiceOf(run, source, stillOwner);

    if (choice.kind === 'failed') {
      return { kind: 'failed', rateLimited: false, host: null };
    }

    if (choice.kind === 'dropped') {
      return { kind: 'dropped' };
    }

    if (choice.kind === 'none') {
      return { kind: 'read', pulls: [], rateLimit: null, host: null };
    }

    const remoteRead = await remoteLookup(run, source, choice.remote, stillOwner);

    if (remoteRead.kind === 'failed') {
      return { kind: 'failed', rateLimited: false, host: null };
    }

    if (remoteRead.kind === 'dropped') {
      return { kind: 'dropped' };
    }

    const host = hostOf(remoteRead.remote);

    const pulls: Pull[] = [];
    let rateLimit: PullRateLimit | null = null;

    for (const batch of batchesOf(source.branches)) {
      if (!stillOwner()) {
        return { kind: 'dropped' };
      }

      // eslint-disable-next-line no-await-in-loop -- one batch at a time, so a rate limit stops the read early
      const result = await run('gh', pullQueryArgs(batch, remoteRead.remote), {
        cwd: source.cwd,
        on: source.repository.machine,
      });

      const answer = batchAnswerOf(result, batch);

      if (answer.kind === 'failed') {
        return { kind: 'failed', rateLimited: rateLimitedIn(result), host };
      }

      pulls.push(...answer.read.pulls);
      rateLimit = answer.read.rateLimit;
    }

    return { kind: 'read', pulls, rateLimit, host };
  } catch {
    return { kind: 'failed', rateLimited: false, host: null };
  }
};
