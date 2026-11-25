import type { PullRead } from './pulls.ts';

interface PullDueRepository {
  lastStart: number;
  lastSuccess: number;
  failures: number;
  backoffUntil: number;
  pushDueAt: number | null;
}

export interface PullDueState {
  repositories: Record<string, PullDueRepository>;
  pausedUntil: number;
}

const readPeriodMilliseconds = 60_000;

const pushSpacingMilliseconds = 2_000;

const pushGapMilliseconds = 15_000;

const readLimit = 2;

const backoffStartMilliseconds = 60_000;

const backoffLimitMilliseconds = 900_000;

const rateLimitPauseMilliseconds = 300_000;

const rateLimitFloor = 100;

const emptyRepository = (): PullDueRepository => ({
  lastStart: 0,
  lastSuccess: 0,
  failures: 0,
  backoffUntil: 0,
  pushDueAt: null,
});

export const emptyPullDueState = (): PullDueState => ({ repositories: {}, pausedUntil: 0 });

const repositoryOf = (state: PullDueState, key: string): PullDueRepository => {
  const stored = state.repositories[key] ?? emptyRepository();

  state.repositories[key] = stored;

  return stored;
};

const pushIsDue = (repository: PullDueRepository, now: number): boolean =>
  repository.pushDueAt !== null && repository.pushDueAt <= now;

const readIsDue = (repository: PullDueRepository, now: number, windowActive: boolean): boolean => {
  if (!windowActive || now < repository.backoffUntil) {
    return false;
  }

  const last = Math.max(repository.lastSuccess, repository.lastStart);

  return now - last >= readPeriodMilliseconds;
};

const isDue = (state: PullDueState, key: string, now: number, windowActive: boolean): boolean => {
  const repository = repositoryOf(state, key);

  return pushIsDue(repository, now) || readIsDue(repository, now, windowActive);
};

const byOldestStart = (state: PullDueState, left: string, right: string): number => {
  const difference = repositoryOf(state, left).lastStart - repositoryOf(state, right).lastStart;

  return difference === 0 ? left.localeCompare(right) : difference;
};

export const duePullReads = (
  state: PullDueState,
  sources: string[],
  running: ReadonlySet<string>,
  now: number,
  windowActive: boolean,
): string[] => {
  if (now < state.pausedUntil) {
    return [];
  }

  const free = Math.max(0, readLimit - running.size);
  const due = sources.filter((key) => !running.has(key) && isDue(state, key, now, windowActive));

  return due.toSorted((left, right) => byOldestStart(state, left, right)).slice(0, free);
};

export const notePush = (state: PullDueState, key: string, at: number): void => {
  const repository = repositoryOf(state, key);

  if (repository.pushDueAt !== null) {
    return;
  }

  repository.pushDueAt = Math.max(
    at + pushSpacingMilliseconds,
    repository.lastStart + pushGapMilliseconds,
  );
};

export const noteStart = (state: PullDueState, key: string, now: number): void => {
  const repository = repositoryOf(state, key);

  repository.lastStart = now;
  repository.pushDueAt = null;
};

export const noteResult = (
  state: PullDueState,
  key: string,
  read: Exclude<PullRead, { kind: 'dropped' }>,
  now: number,
): void => {
  const repository = repositoryOf(state, key);

  if (read.kind === 'read') {
    repository.failures = 0;
    repository.backoffUntil = 0;
    repository.lastSuccess = now;

    if (read.rateLimit !== null && read.rateLimit.remaining < rateLimitFloor) {
      state.pausedUntil = Math.max(state.pausedUntil, read.rateLimit.resetAt);
    }

    return;
  }

  repository.failures += 1;

  const backoff = backoffStartMilliseconds * 2 ** (repository.failures - 1);

  repository.backoffUntil = now + Math.min(backoff, backoffLimitMilliseconds);

  if (read.rateLimited) {
    state.pausedUntil = Math.max(state.pausedUntil, now + rateLimitPauseMilliseconds);
  }
};
