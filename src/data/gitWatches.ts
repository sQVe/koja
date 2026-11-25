import type { Context } from 'gpui-kit';

import type { FolderWatchHandle, WatchFolder } from './folderWatch.ts';
import { watchFolderChanges } from './folderWatch.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import type { WorktreeGit } from './snapshot.ts';

export interface WatchRegistry {
  start: (repository: RepositoryIdentity, cx: Context) => void;
  cancelUnused: (used: ReadonlySet<string>) => void;
  takeEvents: () => Map<string, number>;
  takeRemoteRefEvents: () => Map<string, number>;
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

const keepEarliest = (stored: Map<string, number>, key: string, at: number): void => {
  const first = stored.get(key);

  if (first !== undefined && first <= at) {
    return;
  }

  stored.set(key, at);
};

const isRemoteRefPath = (commonDirectory: string, path: string): boolean =>
  path === commonDirectory ||
  path === `${commonDirectory}/packed-refs` ||
  path.startsWith(`${commonDirectory}/refs/remotes/`);

export const createWatchRegistry = (watchFolder: WatchFolder, now: () => number): WatchRegistry => {
  const watches = new Map<string, FolderWatchHandle>();
  const events = new Map<string, number>();
  const remoteEvents = new Map<string, number>();

  const record = (repositoryKey: string): void => {
    keepEarliest(events, repositoryKey, now());
  };

  const start = (repository: RepositoryIdentity, cx: Context): void => {
    if (watches.has(repository.key)) {
      return;
    }

    const handle = watchFolderChanges(watchFolder, repository.commonDirectory, cx, {
      onChange: (_cx, paths) => {
        record(repository.key);

        if (paths.some((path) => isRemoteRefPath(repository.commonDirectory, path))) {
          keepEarliest(remoteEvents, repository.key, now());
        }
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

  const takeRemoteRefEvents = (): Map<string, number> => {
    const taken = new Map(remoteEvents);

    remoteEvents.clear();

    return taken;
  };

  const stop = (): void => {
    for (const watched of watches.values()) {
      watched.cancel();
    }

    watches.clear();
    events.clear();
    remoteEvents.clear();
  };

  return { start, cancelUnused, takeEvents, takeRemoteRefEvents, stop };
};
