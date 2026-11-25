import { hasOnlyKeys, isRecord, recordOf, stringOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import { repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { Pull } from './pulls.ts';
import { parseStoredPull, unreadPullNeeds } from './pulls.ts';

type StoredPullParser = (stored: unknown) => Pull | null;

export type PlaceGit =
  | { kind: 'repository'; worktree: string }
  | { kind: 'none' }
  | { kind: 'failed' };

export interface WorktreeGit {
  repository: RepositoryIdentity;
  root: string;
  branch: string | null;
  linked: boolean;
}

export interface GitFacts {
  places: Record<string, PlaceGit>;
  worktrees: Record<string, WorktreeGit>;
}

export interface RepositoryPulls {
  pulls: Pull[];
  failed: boolean;
}

export interface TicketFacts {
  id: string;
  title: string;
  state: string;
  url: string;
  parent: string | null;
  failed: boolean;
}

export interface RepositoryTracker {
  workspace: string | null;
  tickets: Record<string, TicketFacts>;
  failed: boolean;
}

export interface Facts {
  git: GitFacts;
  pulls: Record<string, RepositoryPulls>;
  trackers: Record<string, RepositoryTracker>;
}

export const snapshotVersion = 5;

const versionWithGitFactsOnly = 2;

const versionWithoutPullNeeds = 3;

const versionWithoutTrackers = 4;

export interface Snapshot {
  version: typeof snapshotVersion;
  revision: number;
  facts: Facts;
}

export const snapshotKey = 'koja.data.v1.snapshot';

export const emptyFacts = (): Facts => ({
  git: { places: {}, worktrees: {} },
  pulls: {},
  trackers: {},
});

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const pathOf = (value: unknown): string | null => {
  const path = stringOf(value);

  if (path === null) {
    return null;
  }

  if (path === '') {
    return null;
  }

  return path;
};

const parseRepository = (value: unknown): RepositoryIdentity | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['machine', 'commonDirectory', 'key'])) {
    return null;
  }

  const machine = value.machine;

  if (!isNullableString(machine)) {
    return null;
  }

  const commonDirectory = pathOf(value.commonDirectory);

  if (commonDirectory === null) {
    return null;
  }

  const key = stringOf(value.key);

  if (key === null) {
    return null;
  }

  const repository = repositoryOf(machine, commonDirectory);

  if (key !== repository.key) {
    return null;
  }

  return repository;
};

const parseWorktree = (key: string, value: unknown): WorktreeGit | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['repository', 'root', 'branch', 'linked'])) {
    return null;
  }

  const repository = parseRepository(value.repository);

  if (repository === null) {
    return null;
  }

  const root = pathOf(value.root);

  if (root === null) {
    return null;
  }

  const branch = value.branch;

  if (!isNullableString(branch)) {
    return null;
  }

  const linked = value.linked;

  if (typeof linked !== 'boolean') {
    return null;
  }

  if (key !== worktreeOf(repository.machine, root).key) {
    return null;
  }

  return { repository, root, branch, linked };
};

const parsePlace = (value: unknown, worktrees: Record<string, WorktreeGit>): PlaceGit | null => {
  if (!isRecord(value)) {
    return null;
  }

  const kind = value.kind;

  if (kind === 'none' || kind === 'failed') {
    if (!hasOnlyKeys(value, ['kind'])) {
      return null;
    }

    return { kind };
  }

  if (kind !== 'repository') {
    return null;
  }

  if (!hasOnlyKeys(value, ['kind', 'worktree'])) {
    return null;
  }

  const worktree = stringOf(value.worktree);

  if (worktree === null) {
    return null;
  }

  if (!Object.hasOwn(worktrees, worktree)) {
    return null;
  }

  return { kind, worktree };
};

const parseGitFacts = (value: unknown): GitFacts | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['places', 'worktrees'])) {
    return null;
  }

  const places = value.places;

  if (!isRecord(places)) {
    return null;
  }

  const worktrees = value.worktrees;

  if (!isRecord(worktrees)) {
    return null;
  }

  const worktreeEntries: [string, WorktreeGit][] = [];

  for (const [key, worktree] of Object.entries(worktrees)) {
    const parsed = parseWorktree(key, worktree);

    if (parsed === null) {
      return null;
    }

    worktreeEntries.push([key, parsed]);
  }

  const parsedWorktrees = Object.fromEntries(worktreeEntries);
  const placeEntries: [string, PlaceGit][] = [];

  for (const [key, place] of Object.entries(places)) {
    const parsed = parsePlace(place, parsedWorktrees);

    if (parsed === null) {
      return null;
    }

    placeEntries.push([key, parsed]);
  }

  return { places: Object.fromEntries(placeEntries), worktrees: parsedWorktrees };
};

const parseRepositoryPulls = (
  value: unknown,
  parsePull: StoredPullParser,
): RepositoryPulls | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['pulls', 'failed'])) {
    return null;
  }

  const failed = value.failed;

  if (typeof failed !== 'boolean') {
    return null;
  }

  const stored = value.pulls;

  if (!Array.isArray(stored)) {
    return null;
  }

  const pulls: Pull[] = [];

  for (const entry of stored) {
    const parsed = parsePull(entry);

    if (parsed === null) {
      return null;
    }

    pulls.push(parsed);
  }

  return { pulls, failed };
};

const parseTicketFacts = (value: unknown): TicketFacts | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['id', 'title', 'state', 'url', 'parent', 'failed'])) {
    return null;
  }

  const id = stringOf(value.id);

  if (id === null) {
    return null;
  }

  const title = stringOf(value.title);

  if (title === null) {
    return null;
  }

  const state = stringOf(value.state);

  if (state === null) {
    return null;
  }

  const url = stringOf(value.url);

  if (url === null) {
    return null;
  }

  const parent = value.parent;

  if (!isNullableString(parent)) {
    return null;
  }

  const failed = value.failed;

  if (typeof failed !== 'boolean') {
    return null;
  }

  return { id, title, state, url, parent, failed };
};

const parseRepositoryTracker = (value: unknown): RepositoryTracker | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['workspace', 'tickets', 'failed'])) {
    return null;
  }

  const workspace = value.workspace;

  if (!isNullableString(workspace)) {
    return null;
  }

  const failed = value.failed;

  if (typeof failed !== 'boolean') {
    return null;
  }

  const stored = value.tickets;

  if (!isRecord(stored)) {
    return null;
  }

  const entries: [string, TicketFacts][] = [];

  for (const [key, ticket] of Object.entries(stored)) {
    const parsed = parseTicketFacts(ticket);

    if (parsed === null) {
      return null;
    }

    entries.push([key, parsed]);
  }

  return { workspace, tickets: Object.fromEntries(entries), failed };
};

const repositoryKeys = (worktrees: Record<string, WorktreeGit>): Set<string> => {
  const keys = Object.values(worktrees).map((worktree) => worktree.repository.key);

  return new Set(keys);
};

const parsePulls = (
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
  parsePull: StoredPullParser,
): Record<string, RepositoryPulls> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const known = repositoryKeys(worktrees);
  const entries: [string, RepositoryPulls][] = [];

  for (const [key, entry] of Object.entries(value)) {
    if (!known.has(key)) {
      return null;
    }

    const parsed = parseRepositoryPulls(entry, parsePull);

    if (parsed === null) {
      return null;
    }

    entries.push([key, parsed]);
  }

  return Object.fromEntries(entries);
};

const parseTrackers = (
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
): Record<string, RepositoryTracker> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const known = repositoryKeys(worktrees);
  const entries: [string, RepositoryTracker][] = [];

  for (const [key, entry] of Object.entries(value)) {
    if (!known.has(key)) {
      return null;
    }

    const parsed = parseRepositoryTracker(entry);

    if (parsed === null) {
      return null;
    }

    entries.push([key, parsed]);
  }

  return Object.fromEntries(entries);
};

const parseFacts = (value: unknown, parsePull: StoredPullParser): Facts | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['git', 'pulls', 'trackers'])) {
    return null;
  }

  const git = parseGitFacts(value.git);

  if (git === null) {
    return null;
  }

  const pulls = parsePulls(value.pulls, git.worktrees, parsePull);

  if (pulls === null) {
    return null;
  }

  const trackers = parseTrackers(value.trackers, git.worktrees);

  if (trackers === null) {
    return null;
  }

  return { git, pulls, trackers };
};

const parseFactsWithoutTrackers = (value: unknown, parsePull: StoredPullParser): Facts | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['git', 'pulls'])) {
    return null;
  }

  const git = parseGitFacts(value.git);

  if (git === null) {
    return null;
  }

  const pulls = parsePulls(value.pulls, git.worktrees, parsePull);

  if (pulls === null) {
    return null;
  }

  return { git, pulls, trackers: {} };
};

const parseGitOnlyFacts = (value: unknown): Facts | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['git'])) {
    return null;
  }

  const git = parseGitFacts(value.git);

  if (git === null) {
    return null;
  }

  return { git, pulls: {}, trackers: {} };
};

const parseVersion3Pull: StoredPullParser = (stored) => {
  if (!isRecord(stored)) {
    return null;
  }

  if (!hasOnlyKeys(stored, ['number', 'state', 'isDraft', 'title', 'headRefName'])) {
    return null;
  }

  return parseStoredPull({ ...stored, ...unreadPullNeeds() });
};

const snapshotOf = (fields: Record<string, unknown>, facts: Facts | null): Snapshot | null => {
  if (!hasOnlyKeys(fields, ['version', 'revision', 'facts'])) {
    return null;
  }

  if (!isPositiveWholeNumber(fields.revision)) {
    return null;
  }

  return facts === null ? null : { version: snapshotVersion, revision: fields.revision, facts };
};

const parseVersion2Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(fields, parseGitOnlyFacts(fields.facts));

const parseVersion3Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(fields, parseFactsWithoutTrackers(fields.facts, parseVersion3Pull));

const parseVersion4Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(fields, parseFactsWithoutTrackers(fields.facts, parseStoredPull));

const parseCurrentSnapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(fields, parseFacts(fields.facts, parseStoredPull));

export const parseSnapshot = (value: unknown): Snapshot | null => {
  const fields = recordOf(value);

  if (fields.version === versionWithGitFactsOnly) {
    return parseVersion2Snapshot(fields);
  }

  if (fields.version === versionWithoutPullNeeds) {
    return parseVersion3Snapshot(fields);
  }

  if (fields.version === versionWithoutTrackers) {
    return parseVersion4Snapshot(fields);
  }

  if (fields.version !== snapshotVersion) {
    return null;
  }

  return parseCurrentSnapshot(fields);
};

export const joinFacts = (
  git: GitFacts,
  pulls: Record<string, RepositoryPulls>,
  trackers: Record<string, RepositoryTracker>,
): Facts => {
  const known = repositoryKeys(git.worktrees);
  const keptPulls = Object.entries(pulls).filter(([key]) => known.has(key));
  const keptTrackers = Object.entries(trackers).filter(([key]) => known.has(key));

  return {
    git,
    pulls: Object.fromEntries(keptPulls),
    trackers: Object.fromEntries(keptTrackers),
  };
};
