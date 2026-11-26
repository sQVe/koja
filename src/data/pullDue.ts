import type { PullRead } from './pulls.ts';

interface PullDueRepository {
  host: string | null;
  lastStart: number;
  lastSuccess: number;
  failures: number;
  backoffUntil: number;
  pushDueAt: number | null;
  branchesDueAt: number | null;
}

export interface PullDueState {
  repositories: Record<string, PullDueRepository>;
  pausedUntil: number;
  pausedUntilByHost: Record<string, number>;
}

export const readPeriodMilliseconds = 60_000;

const pushSpacingMilliseconds = 2_000;

const pushGapMilliseconds = 15_000;

const readLimit = 2;

const backoffStartMilliseconds = 60_000;

const backoffLimitMilliseconds = 900_000;

const rateLimitPauseMilliseconds = 300_000;

const rateLimitFloor = 100;

export const emptyPullDueRepository = (): PullDueRepository => ({
  host: null,
  lastStart: 0,
  lastSuccess: 0,
  failures: 0,
  backoffUntil: 0,
  pushDueAt: null,
  branchesDueAt: null,
});

export const emptyPullDueState = (): PullDueState => ({
  repositories: {},
  pausedUntil: 0,
  pausedUntilByHost: {},
});

const repositoryEntry = (state: PullDueState, key: string): PullDueRepository =>
  state.repositories[key] ?? emptyPullDueRepository();

const repositoryToWrite = (state: PullDueState, key: string): PullDueRepository => {
  const stored = repositoryEntry(state, key);

  state.repositories[key] = stored;

  return stored;
};

// A repository with no host yet could be on any paused host, so every host pause withholds it.
const pausedUntilFor = (state: PullDueState, repository: PullDueRepository): number => {
  if (repository.host !== null) {
    return Math.max(state.pausedUntil, state.pausedUntilByHost[repository.host] ?? 0);
  }

  const hostPauses = Object.values(state.pausedUntilByHost);

  return Math.max(state.pausedUntil, ...hostPauses);
};

const pauseUntil = (state: PullDueState, host: string | null, until: number): void => {
  if (host === null) {
    state.pausedUntil = Math.max(state.pausedUntil, until);

    return;
  }

  state.pausedUntilByHost[host] = Math.max(state.pausedUntilByHost[host] ?? 0, until);
};

const pushIsDue = (repository: PullDueRepository, now: number): boolean =>
  repository.backoffUntil <= now && repository.pushDueAt !== null && repository.pushDueAt <= now;

const readIsDue = (repository: PullDueRepository, now: number, windowActive: boolean): boolean => {
  if (!windowActive || now < repository.backoffUntil) {
    return false;
  }

  if (repository.branchesDueAt !== null && repository.branchesDueAt <= now) {
    return true;
  }

  const last = Math.max(repository.lastSuccess, repository.lastStart);

  return now - last >= readPeriodMilliseconds;
};

const isDue = (state: PullDueState, key: string, now: number, windowActive: boolean): boolean => {
  const repository = repositoryEntry(state, key);

  if (now < pausedUntilFor(state, repository)) {
    return false;
  }

  return pushIsDue(repository, now) || readIsDue(repository, now, windowActive);
};

const byOldestStart = (state: PullDueState, left: string, right: string): number => {
  const difference =
    repositoryEntry(state, left).lastStart - repositoryEntry(state, right).lastStart;

  return difference === 0 ? left.localeCompare(right) : difference;
};

export const duePullReads = (
  state: PullDueState,
  sources: string[],
  running: ReadonlySet<string>,
  now: number,
  windowActive: boolean,
): string[] => {
  const free = Math.max(0, readLimit - running.size);

  const due = sources.filter((key) => !running.has(key) && isDue(state, key, now, windowActive));

  return due.toSorted((left, right) => byOldestStart(state, left, right)).slice(0, free);
};

export const notePush = (state: PullDueState, key: string, at: number): void => {
  const repository = repositoryToWrite(state, key);

  if (repository.pushDueAt !== null) {
    return;
  }

  repository.pushDueAt = Math.max(
    at + pushSpacingMilliseconds,
    repository.lastStart + pushGapMilliseconds,
  );
};

export const noteStart = (state: PullDueState, key: string, now: number): void => {
  const repository = repositoryToWrite(state, key);

  repository.lastStart = now;
  repository.pushDueAt = null;
  repository.branchesDueAt = null;
};

// A stack that joins the reads makes the repository due at once, but only while the window is
// active, as a timed read does.
export const noteBranches = (state: PullDueState, key: string, at: number): void => {
  const repository = repositoryToWrite(state, key);

  repository.branchesDueAt ??= at;
};

export const noteResult = (
  state: PullDueState,
  key: string,
  read: Exclude<PullRead, { kind: 'dropped' }>,
  now: number,
): void => {
  const repository = repositoryToWrite(state, key);

  if (read.host !== null) {
    repository.host = read.host;
  }

  if (read.kind === 'read') {
    repository.failures = 0;
    repository.backoffUntil = 0;
    repository.lastSuccess = now;

    if (read.rateLimit !== null && read.rateLimit.remaining < rateLimitFloor) {
      pauseUntil(state, read.host, read.rateLimit.resetAt);
    }

    return;
  }

  repository.failures += 1;

  const backoff = backoffStartMilliseconds * 2 ** (repository.failures - 1);

  repository.backoffUntil = now + Math.min(backoff, backoffLimitMilliseconds);

  if (read.rateLimited) {
    pauseUntil(state, read.host, now + rateLimitPauseMilliseconds);
  }
};
