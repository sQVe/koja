import type { Context } from 'gpui-kit';

import type { FolderWatchHandle, WatchFolder } from './folderWatch.ts';
import { watchFolderChanges } from './folderWatch.ts';
import type { RepositoryIdentity } from './gitIdentity.ts';
import type { PlaceGit, WorktreeGit } from './snapshot.ts';

interface WatchRecord {
  token: symbol;
  handle: FolderWatchHandle;
}

export interface WatchRegistry {
  start: (repository: RepositoryIdentity, cx: Context) => void;
  cancelUnused: (used: ReadonlySet<string>) => void;
  takeEvents: () => Map<string, number>;
  stop: () => void;
}

export const usedRepositories = (
  places: Readonly<Record<string, PlaceGit>>,
  worktrees: Readonly<Record<string, WorktreeGit>>,
  checkouts: ReadonlySet<string>,
  live: ReadonlySet<string>,
): Set<string> => {
  const used = new Set<string>();

  for (const [key, place] of Object.entries(places)) {
    if (!live.has(key) || place.kind !== 'repository') {
      continue;
    }

    if (!checkouts.has(place.worktree)) {
      continue;
    }

    const worktree = worktrees[place.worktree];

    if (worktree === undefined || worktree.repository.machine !== null) {
      continue;
    }

    used.add(worktree.repository.key);
  }

  return used;
};

export const createWatchRegistry = (watchFolder: WatchFolder, now: () => number): WatchRegistry => {
  const watches = new Map<string, WatchRecord>();
  const events = new Map<string, number>();

  const drop = (repositoryKey: string, token: symbol): void => {
    const current = watches.get(repositoryKey);

    if (current === undefined || current.token !== token) {
      return;
    }

    watches.delete(repositoryKey);
  };

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

    const token = Symbol('watch');

    const handle = watchFolderChanges(watchFolder, repository.commonDirectory, cx, {
      onChange: () => {
        record(repository.key);
      },
      onError: () => {
        drop(repository.key, token);
      },
    });

    watches.set(repository.key, { token, handle });
  };

  const cancelUnused = (used: ReadonlySet<string>): void => {
    for (const [key, watched] of watches) {
      if (used.has(key)) {
        continue;
      }

      watched.handle.cancel();
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
      watched.handle.cancel();
    }

    watches.clear();
    events.clear();
  };

  return { start, cancelUnused, takeEvents, stop };
};
