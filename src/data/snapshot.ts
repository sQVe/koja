import { hasOnlyKeys, isRecord, recordOf, stringOf } from '../kit/fields.ts';
import { isPositiveWholeNumber, withoutTrailingSlashes } from './fields.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import { repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { Pull } from './pulls.ts';
import { decodePullBase, parseStoredPull, parseStoredPullWithoutUrl } from './pulls.ts';
import type { Stack, StackBranch } from './stacks.ts';

type PullParser<T> = (stored: unknown) => T | null;

type PullMapReader = (
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
) => Record<string, RepositoryPulls> | null;

type Version3Pull = NonNullable<ReturnType<typeof decodePullBase>>;

export type PlaceGit =
  | { kind: 'repository'; worktree: string }
  | { kind: 'none' }
  | { kind: 'failed' };

export interface WorktreeGit {
  repository: RepositoryIdentity;
  root: string;
  branch: string | null;
  linked: boolean;
  bare: boolean;
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
}

export interface RepositoryTracker {
  workspace: string | null;
  tickets: Record<string, TicketFacts>;
  failed: boolean;
}

export interface RepositoryStacks {
  stacks: Stack[];
  failed: boolean;
}

export interface Facts {
  git: GitFacts;
  pulls: Record<string, RepositoryPulls>;
  trackers: Record<string, RepositoryTracker>;
  stacks: Record<string, RepositoryStacks>;
}

type FactsShape = 'beforeStacks' | 'beforeBare' | 'current';

export const snapshotVersion = 9;

const versionWithGitFactsOnly = 2;

const versionWithoutPullNeeds = 3;

const versionWithoutTrackers = 4;

const versionWithTicketFailures = 5;

const versionWithoutStacks = 6;

const versionWithoutBare = 7;

const versionWithoutPullUrls = 8;

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
  stacks: {},
});

// The pull of a branch: the open one when the repository knows several, else the first it knows.
export const pullOfBranch = (
  repository: RepositoryPulls | null,
  branch: string | null,
): Pull | null => {
  if (branch === null || repository === null) {
    return null;
  }

  const mine = repository.pulls.filter((pull) => pull.headRefName === branch);

  return mine.find((pull) => pull.state === 'OPEN') ?? mine[0] ?? null;
};

export const worktreeKeyAtPlace = (git: GitFacts, placeKey: string): string | null => {
  const entry = git.places[placeKey];

  return entry?.kind === 'repository' ? entry.worktree : null;
};

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

// A bare place keeps its root as its common directory, either the folder itself or its `.bare`.
const inferredBare = (root: string, repository: RepositoryIdentity): boolean => {
  const place = withoutTrailingSlashes(root);
  const common = withoutTrailingSlashes(repository.commonDirectory);

  return place === common || common === `${place}/.bare`;
};

const bareOf = (
  value: unknown,
  root: string,
  repository: RepositoryIdentity,
  withBare: boolean,
): boolean | null => {
  if (!withBare) {
    return inferredBare(root, repository);
  }

  return typeof value === 'boolean' ? value : null;
};

const parseWorktree = (key: string, value: unknown, withBare: boolean): WorktreeGit | null => {
  if (!isRecord(value)) {
    return null;
  }

  const keys = withBare
    ? ['repository', 'root', 'branch', 'linked', 'bare']
    : ['repository', 'root', 'branch', 'linked'];

  if (!hasOnlyKeys(value, keys)) {
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

  const bare = bareOf(value.bare, root, repository, withBare);

  if (bare === null) {
    return null;
  }

  if (key !== worktreeOf(repository.machine, root).key) {
    return null;
  }

  return { repository, root, branch, linked, bare };
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

const parseGitFacts = (value: unknown, shape: FactsShape): GitFacts | null => {
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
    const parsed = parseWorktree(key, worktree, shape === 'current');

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

const parseRepositoryPulls = <T>(
  value: unknown,
  parsePull: PullParser<T>,
): { pulls: T[]; failed: boolean } | null => {
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

  const pulls: T[] = [];

  for (const entry of stored) {
    const parsed = parsePull(entry);

    if (parsed === null) {
      return null;
    }

    pulls.push(parsed);
  }

  return { pulls, failed };
};

const retiredTicketFailureKey = 'failed';

const ticketKeys = ['id', 'title', 'state', 'url', 'parent'];

const version5TicketKeys = [...ticketKeys, retiredTicketFailureKey];

const parseTicketFacts = (value: unknown, keys: readonly string[]): TicketFacts | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, keys)) {
    return null;
  }

  const acceptsRetiredFailure = keys.includes(retiredTicketFailureKey);

  if (acceptsRetiredFailure && typeof value.failed !== 'boolean') {
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

  return { id, title, state, url, parent };
};

const parseCurrentTicketFacts = (value: unknown): TicketFacts | null =>
  parseTicketFacts(value, ticketKeys);

const parseVersion5TicketFacts = (value: unknown): TicketFacts | null => {
  const holdsRetiredFailure = isRecord(value) && Object.hasOwn(value, retiredTicketFailureKey);
  const keys = holdsRetiredFailure ? version5TicketKeys : ticketKeys;

  return parseTicketFacts(value, keys);
};

const parseRepositoryTracker = (
  value: unknown,
  parseTicket: (value: unknown) => TicketFacts | null,
): RepositoryTracker | null => {
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
    const parsed = parseTicket(ticket);

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

const parseByRepository = <T>(
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
  parseEntry: (value: unknown) => T | null,
): Record<string, T> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const known = repositoryKeys(worktrees);
  const entries: [string, T][] = [];

  for (const [key, entry] of Object.entries(value)) {
    if (!known.has(key)) {
      return null;
    }

    const parsed = parseEntry(entry);

    if (parsed === null) {
      return null;
    }

    entries.push([key, parsed]);
  }

  return Object.fromEntries(entries);
};

const parsePulls = <T>(
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
  parsePull: PullParser<T>,
): Record<string, { pulls: T[]; failed: boolean }> | null =>
  parseByRepository(value, worktrees, (entry) => parseRepositoryPulls(entry, parsePull));

const parseTrackers = (
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
  parseTicket: (value: unknown) => TicketFacts | null,
): Record<string, RepositoryTracker> | null =>
  parseByRepository(value, worktrees, (entry) => parseRepositoryTracker(entry, parseTicket));

const isRestack = (value: unknown): value is StackBranch['restack'] =>
  value === 'needed' || value === 'none' || value === 'unknown';

const parseStackBranch = (value: unknown): StackBranch | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['branch', 'pullNumber', 'restack'])) {
    return null;
  }

  const branch = stringOf(value.branch);
  const pullNumber = value.pullNumber;
  const restack = value.restack;

  if (branch === null) {
    return null;
  }

  if (pullNumber !== null && !isPositiveWholeNumber(pullNumber)) {
    return null;
  }

  if (!isRestack(restack)) {
    return null;
  }

  return { branch, pullNumber, restack };
};

const parseStack = (value: unknown): Stack | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['trunk', 'branches'])) {
    return null;
  }

  const trunk = stringOf(value.trunk);

  if (trunk === null) {
    return null;
  }

  const stored = value.branches;

  if (!Array.isArray(stored)) {
    return null;
  }

  const branches: StackBranch[] = [];

  for (const entry of stored) {
    const parsed = parseStackBranch(entry);

    if (parsed === null) {
      return null;
    }

    branches.push(parsed);
  }

  return { trunk, branches };
};

const parseRepositoryStacks = (value: unknown): RepositoryStacks | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['stacks', 'failed'])) {
    return null;
  }

  const failed = value.failed;

  if (typeof failed !== 'boolean') {
    return null;
  }

  const stored = value.stacks;

  if (!Array.isArray(stored)) {
    return null;
  }

  const stacks: Stack[] = [];

  for (const entry of stored) {
    const parsed = parseStack(entry);

    if (parsed === null) {
      return null;
    }

    stacks.push(parsed);
  }

  return { stacks, failed };
};

const parseStacksMap = (
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
): Record<string, RepositoryStacks> | null =>
  parseByRepository(value, worktrees, parseRepositoryStacks);

const parseGitAndPulls = (
  value: Record<string, unknown>,
  readPulls: PullMapReader,
  keys: readonly string[],
  shape: FactsShape,
): Pick<Facts, 'git' | 'pulls'> | null => {
  if (!hasOnlyKeys(value, keys)) {
    return null;
  }

  const git = parseGitFacts(value.git, shape);

  if (git === null) {
    return null;
  }

  const pulls = readPulls(value.pulls, git.worktrees);

  if (pulls === null) {
    return null;
  }

  return { git, pulls };
};

const parseFacts = (
  value: unknown,
  readPulls: PullMapReader,
  parseTicket: (value: unknown) => TicketFacts | null,
  shape: FactsShape,
): Facts | null => {
  if (!isRecord(value)) {
    return null;
  }

  const keys =
    shape === 'beforeStacks'
      ? ['git', 'pulls', 'trackers']
      : ['git', 'pulls', 'trackers', 'stacks'];

  const gitAndPulls = parseGitAndPulls(value, readPulls, keys, shape);

  if (gitAndPulls === null) {
    return null;
  }

  const trackers = parseTrackers(value.trackers, gitAndPulls.git.worktrees, parseTicket);

  if (trackers === null) {
    return null;
  }

  if (shape === 'beforeStacks') {
    return { ...gitAndPulls, trackers, stacks: {} };
  }

  const stacks = parseStacksMap(value.stacks, gitAndPulls.git.worktrees);

  return stacks === null ? null : { ...gitAndPulls, trackers, stacks };
};

const parseFactsWithoutTrackers = (value: unknown, readPulls: PullMapReader): Facts | null => {
  if (!isRecord(value)) {
    return null;
  }

  const gitAndPulls = parseGitAndPulls(value, readPulls, ['git', 'pulls'], 'beforeStacks');

  if (gitAndPulls === null) {
    return null;
  }

  return { ...gitAndPulls, trackers: {}, stacks: {} };
};

const parseGitOnlyFacts = (value: unknown): Facts | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, ['git'])) {
    return null;
  }

  const git = parseGitFacts(value.git, 'beforeStacks');

  if (git === null) {
    return null;
  }

  return { git, pulls: {}, trackers: {}, stacks: {} };
};

const parseVersion3Pull = (stored: unknown): Version3Pull | null => {
  if (!isRecord(stored)) {
    return null;
  }

  if (!hasOnlyKeys(stored, ['number', 'state', 'isDraft', 'title', 'headRefName'])) {
    return null;
  }

  return decodePullBase(stored);
};

const readCurrentPulls: PullMapReader = (value, worktrees) =>
  parsePulls(value, worktrees, parseStoredPull);

const dropRetiredPulls = <T>(
  value: unknown,
  worktrees: Record<string, WorktreeGit>,
  parsePull: PullParser<T>,
): Record<string, RepositoryPulls> | null => {
  const pulls = parsePulls(value, worktrees, parsePull);

  return pulls === null ? null : {};
};

const readVersion3Pulls: PullMapReader = (value, worktrees) =>
  dropRetiredPulls(value, worktrees, parseVersion3Pull);

const readVersion8Pulls: PullMapReader = (value, worktrees) =>
  dropRetiredPulls(value, worktrees, parseStoredPullWithoutUrl);

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
  snapshotOf(fields, parseFactsWithoutTrackers(fields.facts, readVersion3Pulls));

const parseVersion4Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(fields, parseFactsWithoutTrackers(fields.facts, readVersion8Pulls));

const parseVersion5Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(
    fields,
    parseFacts(fields.facts, readVersion8Pulls, parseVersion5TicketFacts, 'beforeStacks'),
  );

const parseVersion6Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(
    fields,
    parseFacts(fields.facts, readVersion8Pulls, parseCurrentTicketFacts, 'beforeStacks'),
  );

const parseVersion7Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(
    fields,
    parseFacts(fields.facts, readVersion8Pulls, parseCurrentTicketFacts, 'beforeBare'),
  );

const parseVersion8Snapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(
    fields,
    parseFacts(fields.facts, readVersion8Pulls, parseCurrentTicketFacts, 'current'),
  );

const parseCurrentSnapshot = (fields: Record<string, unknown>): Snapshot | null =>
  snapshotOf(
    fields,
    parseFacts(fields.facts, readCurrentPulls, parseCurrentTicketFacts, 'current'),
  );

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

  if (fields.version === versionWithTicketFailures) {
    return parseVersion5Snapshot(fields);
  }

  if (fields.version === versionWithoutStacks) {
    return parseVersion6Snapshot(fields);
  }

  if (fields.version === versionWithoutBare) {
    return parseVersion7Snapshot(fields);
  }

  if (fields.version === versionWithoutPullUrls) {
    return parseVersion8Snapshot(fields);
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
  stacks: Record<string, RepositoryStacks>,
): Facts => {
  const known = repositoryKeys(git.worktrees);
  const keptPulls = Object.entries(pulls).filter(([key]) => known.has(key));
  const keptTrackers = Object.entries(trackers).filter(([key]) => known.has(key));
  const keptStacks = Object.entries(stacks).filter(([key]) => known.has(key));

  return {
    git,
    pulls: Object.fromEntries(keptPulls),
    trackers: Object.fromEntries(keptTrackers),
    stacks: Object.fromEntries(keptStacks),
  };
};
