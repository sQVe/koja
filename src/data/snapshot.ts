import { hasOnlyKeys, isRecord, recordOf, stringOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import { repositoryOf, worktreeOf } from './gitIdentity.ts';

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

export interface Facts {
  git: GitFacts;
}

export interface Snapshot {
  version: 2;
  revision: number;
  facts: Facts;
}

export const snapshotKey = 'koja.data.v1.snapshot';

export const emptyFacts = (): Facts => ({ git: { places: {}, worktrees: {} } });

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

const parseFacts = (value: unknown): Facts | null => {
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

  return { git };
};

export const parseSnapshot = (value: unknown): Snapshot | null => {
  const fields = recordOf(value);

  if (fields.version !== 2) {
    return null;
  }

  if (!hasOnlyKeys(fields, ['version', 'revision', 'facts'])) {
    return null;
  }

  if (!isPositiveWholeNumber(fields.revision)) {
    return null;
  }

  const facts = parseFacts(fields.facts);

  if (facts === null) {
    return null;
  }

  return { version: 2, revision: fields.revision, facts };
};
