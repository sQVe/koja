import type { GitInfo } from './tree.ts';

export const pruneRecord = <T>(
  cache: Readonly<Record<string, T>>,
  live: ReadonlySet<string>,
): Record<string, T> => {
  const liveEntries = Object.entries(cache).filter(([key]) => live.has(key));

  return Object.fromEntries(liveEntries);
};

export const negativeEntryExpired = (
  cachedAt: number | undefined,
  now: number,
  retryMilliseconds: number,
): boolean => now - (cachedAt ?? 0) > retryMilliseconds;

export const retireUnusedWatches = (
  watching: ReadonlySet<string>,
  git: Readonly<Record<string, GitInfo | null>>,
): Set<string> => {
  const usedRepositoryKeys = Object.values(git)
    .filter((info): info is GitInfo => info !== null)
    .filter((info) => info.repo.machine === null)
    .map((info) => info.repo.key);

  const used = new Set(usedRepositoryKeys);

  return new Set([...watching].filter((key) => used.has(key)));
};
