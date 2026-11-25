import type { ExecResult } from 'herdr';

import { hasOnlyKeys, isRecord, numberOf, stringOf } from '../kit/fields.ts';
import type { RunCommand } from './gitIdentity.ts';
import { branchesPerQuery, pullQueryArgs } from './pullQuery.ts';
import type { PullRemote } from './pullQuery.ts';
import type { PullSource } from './pullSources.ts';

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

interface BatchErrors {
  checks: Set<number>;
  threads: Set<number>;
}

type BranchPull = { kind: 'pull'; pull: Pull } | { kind: 'none' } | { kind: 'malformed' };

interface BatchRead {
  pulls: Pull[];
  rateLimit: PullRateLimit | null;
}

type BatchAnswer = { kind: 'read'; read: BatchRead } | { kind: 'failed' };

interface PullRateLimit {
  remaining: number;
  resetAt: number;
}

export type PullRead =
  | { kind: 'read'; pulls: Pull[]; rateLimit: PullRateLimit | null }
  | { kind: 'failed'; rateLimited: boolean }
  | { kind: 'dropped' };

type PullNeedsFields = Pick<Pull, 'mergeable' | 'mergeState' | 'review' | 'checks' | 'threads'>;

type RemoteRead =
  | { kind: 'remote'; remote: PullRemote | null }
  | { kind: 'failed' }
  | { kind: 'dropped' };

const pullFieldNames = ['number', 'state', 'isDraft', 'title', 'headRefName'];

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

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

// SAFETY: Array.isArray checked the list, so every element is read as unknown from here on.
const unknownListOf = (value: unknown): unknown[] | null =>
  Array.isArray(value) ? (value as unknown[]) : null;

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

const rollupChecks: Record<string, PullChecks> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'running',
  EXPECTED: 'running',
};

const mergeablesByName: Record<string, PullMergeable> = {
  MERGEABLE: 'mergeable',
  CONFLICTING: 'conflicting',
};

const mergeStatesByName: Record<string, PullMergeState> = {
  CLEAN: 'clean',
  HAS_HOOKS: 'hasHooks',
  BLOCKED: 'blocked',
  BEHIND: 'behind',
  DIRTY: 'dirty',
  DRAFT: 'draft',
  UNSTABLE: 'unstable',
};

const reviewsByName: Record<string, PullReview> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changesRequested',
  REVIEW_REQUIRED: 'reviewRequired',
};

const checksPath: readonly unknown[] = ['commits', 'nodes', 0, 'commit', 'statusCheckRollup'];

const aliasPathLength = 4;

const openAlias = /^open(\d+)$/;

const isPrefixOf = (prefix: readonly unknown[], value: readonly unknown[]): boolean =>
  prefix.length <= value.length && prefix.every((step, index) => value[index] === step);

const isChecksPath = (path: readonly unknown[]): boolean =>
  isPrefixOf(checksPath, path) || isPrefixOf(path, checksPath);

const isThreadsPath = (path: readonly unknown[]): boolean =>
  path[0] === 'reviewThreads' && path[1] === 'nodes' && isCount(path[2]);

const recordOfOrNull = (value: unknown, key: string): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const entry = value[key];

  return isRecord(entry) ? entry : null;
};

const checksPartOf = (
  node: Record<string, unknown>,
  failed: boolean,
): PullPart<PullChecks> | null => {
  if (failed) {
    return { kind: 'failed', last: null };
  }

  const commits = node['commits'];
  const commitNodes = isRecord(commits) ? unknownListOf(commits['nodes']) : null;

  if (commitNodes === null) {
    return null;
  }

  const [first] = commitNodes;

  if (first === undefined) {
    return { kind: 'read', value: 'none' };
  }

  const commit = recordOfOrNull(first, 'commit');

  if (commit === null) {
    return null;
  }

  const rollup = commit['statusCheckRollup'];

  if (rollup === null) {
    return { kind: 'read', value: 'none' };
  }

  if (!isRecord(rollup)) {
    return null;
  }

  const checks = rollupChecks[String(rollup['state'])];

  return checks === undefined ? null : { kind: 'read', value: checks };
};

const threadsPartOf = (
  node: Record<string, unknown>,
  failed: boolean,
): PullPart<PullThreads> | null => {
  if (failed) {
    return { kind: 'failed', last: null };
  }

  const threads = node['reviewThreads'];

  if (!isRecord(threads)) {
    return null;
  }

  const pageInfo = threads['pageInfo'];

  if (!isRecord(pageInfo) || typeof pageInfo['hasNextPage'] !== 'boolean') {
    return null;
  }

  const nodes = unknownListOf(threads['nodes']);

  if (nodes === null) {
    return null;
  }

  let unresolved = 0;

  for (const entry of nodes) {
    const isResolved = isRecord(entry) ? entry['isResolved'] : null;

    if (typeof isResolved !== 'boolean') {
      return null;
    }

    if (!isResolved) {
      unresolved += 1;
    }
  }

  return { kind: 'read', value: { unresolved, complete: !pageInfo['hasNextPage'] } };
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

  const mergeable = mergeablesByName[String(node['mergeable'])] ?? 'unknown';
  const mergeState = mergeStatesByName[String(node['mergeStateStatus'])] ?? 'unknown';
  const review = reviewsByName[String(node['reviewDecision'])] ?? 'none';

  return { ...base, mergeable, mergeState, review, checks, threads };
};

const summaryPullOf = (node: unknown): Pull | null => (isRecord(node) ? decodePull(node) : null);

const aliasNodesOf = (repository: Record<string, unknown>, alias: string): unknown[] | null => {
  const entry = repository[alias];

  return isRecord(entry) ? unknownListOf(entry['nodes']) : null;
};

const rateLimitOf = (data: Record<string, unknown>): PullRateLimit | null => {
  const stored = data['rateLimit'];

  if (!isRecord(stored)) {
    return null;
  }

  const remaining = stored['remaining'];
  const resetAt = stringOf(stored['resetAt']);
  const resetTime = resetAt === null ? Number.NaN : Date.parse(resetAt);

  if (!isCount(remaining) || Number.isNaN(resetTime)) {
    return null;
  }

  return { remaining, resetAt: resetTime };
};

const branchOfPath = (path: readonly unknown[], branchCount: number): number | null => {
  const [root, alias, nodes, index] = path;
  const aliasName = typeof alias === 'string' ? alias : null;
  const match = aliasName === null ? null : openAlias.exec(aliasName);
  const branch = match === null ? Number.NaN : Number(match[1]);
  const knownBranch = Number.isSafeInteger(branch) && branch >= 0 && branch < branchCount;
  const atNode = root === 'repository' && nodes === 'nodes' && index === 0;

  return atNode && knownBranch ? branch : null;
};

const addErrorOf = (
  errors: BatchErrors,
  path: readonly unknown[],
  branchCount: number,
): boolean => {
  const branch = branchOfPath(path, branchCount);

  if (branch === null) {
    return false;
  }

  const rest = path.slice(aliasPathLength);

  if (isChecksPath(rest)) {
    errors.checks.add(branch);

    return true;
  }

  if (isThreadsPath(rest)) {
    errors.threads.add(branch);

    return true;
  }

  return false;
};

const batchErrorsOf = (body: Record<string, unknown>, branchCount: number): BatchErrors | null => {
  const entries = unknownListOf(body['errors'] ?? []);

  if (entries === null) {
    return null;
  }

  const errors: BatchErrors = { checks: new Set(), threads: new Set() };

  for (const entry of entries) {
    const stored = isRecord(entry) ? entry['path'] : null;
    const path = unknownListOf(stored);

    if (path === null || !addErrorOf(errors, path, branchCount)) {
      return null;
    }
  }

  return errors;
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

const bodyOf = (result: ExecResult): Record<string, unknown> | null => {
  let body: unknown;

  try {
    body = JSON.parse(result.stdout);
  } catch {
    return null;
  }

  return isRecord(body) ? body : null;
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

const batchesOf = (branches: string[]): string[][] => {
  const batches: string[][] = [];

  for (let index = 0; index < branches.length; index += branchesPerQuery) {
    batches.push(branches.slice(index, index + branchesPerQuery));
  }

  return batches;
};

const rateLimitedIn = (result: ExecResult): boolean =>
  result.code !== 0 && /rate limit/i.test(result.stderr);

const remoteNameOf = (remotes: string): string | null => {
  const names = remotes
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');

  if (names.includes('origin')) {
    return 'origin';
  }

  return names[0] ?? null;
};

const withoutGitSuffix = (name: string): string => name.replace(/\.git$/, '');

const decodedComponent = (component: string): string | null => {
  try {
    return decodeURIComponent(component);
  } catch {
    return null;
  }
};

const remotePathOf = (path: string): Pick<PullRemote, 'owner' | 'repository'> | null => {
  const parts = path.split('/').filter((part) => part !== '');

  if (parts.length !== 2) {
    return null;
  }

  const [ownerPart, repositoryPart] = parts;

  if (ownerPart === undefined || repositoryPart === undefined) {
    return null;
  }

  const owner = decodedComponent(ownerPart);
  const repository = decodedComponent(repositoryPart);

  if (owner === null || repository === null) {
    return null;
  }

  return { owner: withoutGitSuffix(owner), repository: withoutGitSuffix(repository) };
};

// GitHub serves SSH over 443 at ssh.github.com, but its API is at github.com.
const apiHostOf = (host: string): string => (host === 'ssh.github.com' ? 'github.com' : host);

const remoteOfUrl = (remoteUrl: string): PullRemote | null => {
  const url = remoteUrl.trim();
  const shorthand = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(url);
  const uri = /^(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?([^:/\s]+)(?::\d+)?\/(.+)$/.exec(url);
  const match = shorthand ?? uri;

  if (match === null) {
    return null;
  }

  const host = match[1];
  const path = match[2];
  const parts = path === undefined ? null : remotePathOf(path);

  if (host === undefined || parts === null) {
    return null;
  }

  return { host: apiHostOf(host), ...parts };
};

const remoteLookup = async (
  run: RunCommand,
  source: PullSource,
  remote: string,
  stillOwner: () => boolean,
): Promise<RemoteRead> => {
  const result = await run('git', ['remote', 'get-url', remote], {
    cwd: source.cwd,
    on: source.repository.machine,
  });

  if (result.code !== 0) {
    return { kind: 'failed' };
  }

  if (!stillOwner()) {
    return { kind: 'dropped' };
  }

  return { kind: 'remote', remote: remoteOfUrl(result.stdout) };
};

export const readRepositoryPulls = async (
  run: RunCommand,
  source: PullSource,
  stillOwner: () => boolean,
): Promise<PullRead> => {
  try {
    const remotes = await run('git', ['remote'], {
      cwd: source.cwd,
      on: source.repository.machine,
    });

    if (remotes.code !== 0) {
      return { kind: 'failed', rateLimited: false };
    }

    if (!stillOwner()) {
      return { kind: 'dropped' };
    }

    const remote = remoteNameOf(remotes.stdout);

    if (remote === null || source.branches.length === 0) {
      return { kind: 'read', pulls: [], rateLimit: null };
    }

    const remoteRead = await remoteLookup(run, source, remote, stillOwner);

    if (remoteRead.kind === 'failed') {
      return { kind: 'failed', rateLimited: false };
    }

    if (remoteRead.kind === 'dropped') {
      return { kind: 'dropped' };
    }

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
        return { kind: 'failed', rateLimited: rateLimitedIn(result) };
      }

      pulls.push(...answer.read.pulls);
      rateLimit = answer.read.rateLimit;
    }

    return { kind: 'read', pulls, rateLimit };
  } catch {
    return { kind: 'failed', rateLimited: false };
  }
};
