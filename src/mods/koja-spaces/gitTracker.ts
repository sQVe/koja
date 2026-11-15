import type { Context } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';
import { exec, machines, watchFolder } from 'herdr';

import { watchFolderChanges } from '../../data/folderWatch.ts';
import type { FolderWatchHandle } from '../../data/folderWatch.ts';
import type { Branch, GitIdentity, Place, RepositoryIdentity } from '../../data/gitIdentity.ts';
import { placeOf, readGitIdentity } from '../../data/gitIdentity.ts';
import { currentWindow } from '../../kit/index.ts';
import { negativeEntryExpired, pruneRecord, retireUnusedWatches } from './cache.ts';
import type { GitInfo } from './tree.ts';

// Changes made outside Herdr, such as an editor's save or a commit in another app, are looked
// for this often in repositories the list shows, while the window is in front.
const fallbackMilliseconds = 60_000;

const branchName = (branch: Branch): string | null =>
  branch.kind === 'detached' ? null : branch.name;

const gitInfoOf = (identity: Exclude<GitIdentity, { kind: 'failed' }>): GitInfo | null => {
  if (identity.kind === 'none') {
    return null;
  }

  const branch = branchName(identity.branch);
  const { repository: repo, place } = identity;

  if (identity.kind === 'bare') {
    return { branch, repo, root: place.folder, cwd: place.folder, linked: false };
  }

  const linked = identity.kind === 'linked';

  return { branch, repo, root: identity.worktree.top, cwd: place.folder, linked };
};

export class GitTracker {
  private git: Record<string, GitInfo | null> = {};

  private checked: Record<string, number> = {};

  private readonly unsure = new Set<string>();

  private readonly pending = new Map<string, Place>();

  private refreshing = false;

  private busy: Record<string, boolean> = {};

  private readonly ready: Record<string, boolean> = {};

  private at: Record<string, Place> = {};

  private readonly watches = new Map<string, FolderWatchHandle>();

  // null until the first prune: every place counts as live before the list is known.
  private live: ReadonlySet<string> | null = null;

  entries(): Record<string, GitInfo | null> {
    return this.git;
  }

  lookup(key: string): GitInfo | null | undefined {
    return this.git[key];
  }

  repositories(): { repo: RepositoryIdentity; cwd: string }[] {
    const seen = new Set<string>();
    const repos: { repo: RepositoryIdentity; cwd: string }[] = [];

    for (const info of Object.values(this.git)) {
      if (info !== null && !seen.has(info.repo.key)) {
        seen.add(info.repo.key);
        repos.push({ repo: info.repo, cwd: info.cwd });
      }
    }

    return repos;
  }

  sweep(
    now: number,
    at: Record<string, Place>,
    spaceList: SpaceInfo[],
    paneList: PaneInfo[],
  ): Set<string> {
    const placeByKey = new Map<string, Place>(
      Object.values(at)
        .filter((place) => place.folder !== '')
        .map((place) => [place.key, place]),
    );

    const keys = new Set(placeByKey.keys());
    const due = new Set([...keys].filter((key) => !(key in this.git)));

    for (const [id, place] of Object.entries(at)) {
      const before = this.at[id];

      if (before !== undefined && before.key !== place.key && keys.has(place.key)) {
        due.add(place.key);
      }
    }

    this.at = at;
    this.addFinishedWork(at, keys, spaceList, paneList, due);
    this.addReturnedMachines(placeByKey, due);

    if (currentWindow()?.active === true) {
      this.addFallbacks(now, keys, due);
    }

    return due;
  }

  prune(live: ReadonlySet<string>): void {
    this.live = live;
    this.git = pruneRecord(this.git, live);
    this.checked = pruneRecord(this.checked, live);

    for (const key of this.unsure) {
      if (!live.has(key)) {
        this.unsure.delete(key);
      }
    }

    for (const key of this.pending.keys()) {
      if (!live.has(key)) {
        this.pending.delete(key);
      }
    }

    this.forgetUnusedWatches();
  }

  stop(): void {
    this.prune(new Set());
  }

  refresh(places: Iterable<Place>, cx: Context): void {
    for (const place of places) {
      this.pending.set(place.key, place);
    }

    if (this.refreshing) {
      return;
    }

    this.refreshing = true;

    cx.spawn(async (taskCx) => {
      while (this.pending.size > 0) {
        const batch = [...this.pending.values()];

        this.pending.clear();

        for (const place of batch) {
          // eslint-disable-next-line no-await-in-loop -- one git process at a time
          await this.check(place, taskCx);
        }
      }

      this.forgetUnusedWatches();
      this.refreshing = false;
      taskCx.notify();
    });
  }

  private addFinishedWork(
    at: Record<string, Place>,
    keys: Set<string>,
    spaceList: SpaceInfo[],
    paneList: PaneInfo[],
    due: Set<string>,
  ): void {
    const spaceOfTab: Record<string, SpaceInfo> = {};

    for (const space of spaceList) {
      for (const tab of space.tabs) {
        spaceOfTab[tab.id] = space;
      }
    }

    const busy: Record<string, boolean> = {};

    for (const pane of paneList) {
      const space = spaceOfTab[pane.tab];

      if (pane.terminal === null || space === undefined) {
        continue;
      }

      const inFront = !(pane.program.shell || pane.program.agent);

      const isBusy = pane.status === 'working' || inFront;

      busy[pane.pane] = isBusy;

      if (this.busy[pane.pane] === true && !isBusy) {
        const key = at[space.id]?.key ?? '';

        this.sameRepo(key, keys).forEach((entry) => due.add(entry));
      }
    }

    this.busy = busy;
  }

  private addMachinePlaces(
    placeByKey: Map<string, Place>,
    machine: string,
    due: Set<string>,
  ): void {
    for (const [key, place] of placeByKey) {
      if ((place.machine ?? '') === machine) {
        due.add(key);
      }
    }
  }

  private addReturnedMachines(placeByKey: Map<string, Place>, due: Set<string>): void {
    for (const machine of machines()) {
      const ready = machine.layout === 'ready';
      const name = machine.name ?? '';

      if (ready && this.ready[name] === false) {
        this.addMachinePlaces(placeByKey, name, due);
      }

      this.ready[name] = ready;
    }
  }

  private addFallbacks(now: number, keys: Set<string>, due: Set<string>): void {
    for (const key of keys) {
      const asks = this.git[key] !== null && this.git[key] !== undefined;
      const noRepository = this.git[key] === null;

      const expired =
        noRepository && negativeEntryExpired(this.checked[key], now, fallbackMilliseconds);

      const known = asks || this.unsure.has(key) || expired;
      const stale = now - (this.checked[key] ?? 0) > fallbackMilliseconds;

      if (known && stale) {
        due.add(key);
      }
    }
  }

  // `key` and the other places in its repository: a commit there moves their refs.
  private sameRepo(key: string, keys: Set<string>): string[] {
    const repo = this.git[key]?.repo;

    if (repo === undefined) {
      return [key];
    }

    return [key, ...[...keys].filter((other) => this.git[other]?.repo.key === repo.key)];
  }

  private forgetUnusedWatches(): void {
    const kept = retireUnusedWatches(new Set(this.watches.keys()), this.git);

    for (const [key, handle] of this.watches) {
      if (!kept.has(key)) {
        handle.cancel();
        this.watches.delete(key);
      }
    }
  }

  private stillTracked(key: string): boolean {
    return this.live === null || this.live.has(key);
  }

  private async check(place: Place, cx: Context): Promise<void> {
    if (!this.stillTracked(place.key)) {
      return;
    }

    this.checked[place.key] = Date.now();
    this.unsure.delete(place.key);

    const identity = await readGitIdentity(exec, place.machine, place.folder);

    if (!this.stillTracked(place.key)) {
      return;
    }

    if (identity.kind === 'failed') {
      this.git[place.key] ??= null;
      this.unsure.add(place.key);

      return;
    }

    this.git[place.key] = gitInfoOf(identity);

    const checkout = identity.kind === 'main' || identity.kind === 'linked';

    if (checkout && place.machine === null) {
      this.watch(identity.repository, cx);
    }
  }

  private placesIn(repo: RepositoryIdentity): Place[] {
    return Object.values(this.git)
      .filter((info): info is GitInfo => info !== null && info.repo.key === repo.key)
      .map((info) => placeOf(info.repo.machine, info.cwd));
  }

  private watch(repo: RepositoryIdentity, cx: Context): void {
    if (this.watches.has(repo.key)) {
      return;
    }

    const handle = watchFolderChanges(watchFolder, repo.commonDirectory, cx, {
      onChange: (taskCx) => {
        this.refresh(this.placesIn(repo), taskCx);
      },
      onError: () => {
        this.watches.delete(repo.key);
      },
    });

    this.watches.set(repo.key, handle);
  }
}
