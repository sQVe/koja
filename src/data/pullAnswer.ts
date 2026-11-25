import type { ExecResult } from 'herdr';

import { isRecord, stringOf } from '../kit/fields.ts';

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

export interface PullStatusNames {
  mergeable: PullMergeable;
  mergeState: PullMergeState;
  review: PullReview;
}

export interface BatchErrors {
  checks: Set<number>;
  threads: Set<number>;
}

export interface PullRateLimit {
  remaining: number;
  resetAt: number;
}

export const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

// SAFETY: Array.isArray checked the list, so every element is read as unknown from here on.
export const unknownListOf = (value: unknown): unknown[] | null =>
  Array.isArray(value) ? (value as unknown[]) : null;

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

const valueIn = <T>(table: Record<string, T>, name: string): T | undefined =>
  Object.hasOwn(table, name) ? table[name] : undefined;

export const statusNamesOf = (node: Record<string, unknown>): PullStatusNames => ({
  mergeable: valueIn(mergeablesByName, String(node['mergeable'])) ?? 'unknown',
  mergeState: valueIn(mergeStatesByName, String(node['mergeStateStatus'])) ?? 'unknown',
  review: valueIn(reviewsByName, String(node['reviewDecision'])) ?? 'none',
});

const checksPath: readonly unknown[] = ['commits', 'nodes', 0, 'commit', 'statusCheckRollup'];

const aliasPathLength = 4;

const openAliasName = /^open(\d+)$/;

const isPrefixOf = (prefix: readonly unknown[], value: readonly unknown[]): boolean =>
  prefix.length <= value.length && prefix.every((step, index) => value[index] === step);

const isChecksPath = (path: readonly unknown[]): boolean =>
  isPrefixOf(checksPath, path) || isPrefixOf(path, checksPath);

const isThreadsPath = (path: readonly unknown[]): boolean =>
  path[0] === 'reviewThreads' && path[1] === 'nodes' && isCount(path[2]);

const branchOfPath = (path: readonly unknown[], branchCount: number): number | null => {
  const [root, alias, nodes, index] = path;
  const aliasName = typeof alias === 'string' ? alias : null;
  const match = aliasName === null ? null : openAliasName.exec(aliasName);
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

  if (rest.length === 0) {
    return false;
  }

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

export const batchErrorsOf = (
  body: Record<string, unknown>,
  branchCount: number,
): BatchErrors | null => {
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

const recordOfOrNull = (value: unknown, key: string): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const entry = value[key];

  return isRecord(entry) ? entry : null;
};

export const checksPartOf = (
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

  const checks = valueIn(rollupChecks, String(rollup['state']));

  return checks === undefined ? null : { kind: 'read', value: checks };
};

export const threadsPartOf = (
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

export const rateLimitOf = (data: Record<string, unknown>): PullRateLimit | null => {
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

export const bodyOf = (result: ExecResult): Record<string, unknown> | null => {
  let body: unknown;

  try {
    body = JSON.parse(result.stdout);
  } catch {
    return null;
  }

  return isRecord(body) ? body : null;
};

export const rateLimitedIn = (result: ExecResult): boolean =>
  result.code !== 0 && /rate limit/i.test(result.stderr);
