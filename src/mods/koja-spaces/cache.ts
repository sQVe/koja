// Removes cache entries whose key no longer names a shown place, so a closed space stops its
// watcher and pull fetches.

import type { GitInfo } from './tree.ts';

export const pruneRecord = <T>(
  cache: Readonly<Record<string, T>>,
  live: ReadonlySet<string>,
): Record<string, T> => Object.fromEntries(Object.entries(cache).filter(([key]) => live.has(key)));

// Watchers whose repository no longer has a local place in the cache.
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
