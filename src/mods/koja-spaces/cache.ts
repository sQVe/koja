import type { GitInfo } from './tree.ts';

export const pruneRecord = <T>(
  cache: Readonly<Record<string, T>>,
  live: ReadonlySet<string>,
): Record<string, T> => Object.fromEntries(Object.entries(cache).filter(([key]) => live.has(key)));

export const negativeEntryExpired = (
  cachedAt: number | undefined,
  now: number,
  retryMilliseconds: number,
): boolean => now - (cachedAt ?? 0) > retryMilliseconds;

export const retireUnusedWatches = (
  watching: ReadonlySet<string>,
  git: Readonly<Record<string, GitInfo | null>>,
): Set<string> => {
  const used = new Set(
    Object.values(git)
      .filter((info): info is GitInfo => info !== null)
      .filter((info) => info.repo.machine === null)
      .map((info) => info.repo.key),
  );

  return new Set([...watching].filter((key) => used.has(key)));
};
