import type { Context } from 'gpui-kit';

import type { FolderWatchHandle, WatchFolder } from './folderWatch.ts';
import { watchFolderChanges } from './folderWatch.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import type { WorktreeGit } from './snapshot.ts';

export interface WatchRegistry {
  start: (repository: RepositoryIdentity, cx: Context) => void;
  cancelUnused: (used: ReadonlySet<string>) => void;
  takeEvents: () => Map<string, number>;
  stop: () => void;
}

export const usedRepositories = (
  worktrees: Readonly<Record<string, WorktreeGit>>,
  checkouts: ReadonlySet<string>,
): Set<string> => {
  const used = new Set<string>();

  for (const [key, worktree] of Object.entries(worktrees)) {
    if (!checkouts.has(key) || worktree.repository.machine !== null) {
      continue;
    }

    used.add(worktree.repository.key);
  }

  return used;
};

export const createWatchRegistry = (watchFolder: WatchFolder, now: () => number): WatchRegistry => {
  const watches = new Map<string, FolderWatchHandle>();
  const events = new Map<string, number>();

  const record = (repositoryKey: string): void => {
    const at = now();
    const first = events.get(repositoryKey);

    if (first !== undefined && first <= at) {
      return;
    }

    events.set(repositoryKey, at);
  };

  const start = (repository: RepositoryIdentity, cx: Context): void => {
    if (watches.has(repository.key)) {
      return;
    }

    const handle = watchFolderChanges(watchFolder, repository.commonDirectory, cx, {
      onChange: () => {
        record(repository.key);
      },
      onError: () => {
        watches.delete(repository.key);
      },
    });

    watches.set(repository.key, handle);
  };

  const cancelUnused = (used: ReadonlySet<string>): void => {
    for (const [key, watched] of watches) {
      if (used.has(key)) {
        continue;
      }

      watched.cancel();
      watches.delete(key);
    }
  };

  const takeEvents = (): Map<string, number> => {
    const taken = new Map(events);

    events.clear();

    return taken;
  };

  const stop = (): void => {
    for (const watched of watches.values()) {
      watched.cancel();
    }

    watches.clear();
    events.clear();
  };

  return { start, cancelUnused, takeEvents, stop };
};
