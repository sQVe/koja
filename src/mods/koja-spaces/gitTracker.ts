// Git tracking for the spaces sidebar: one cache of what git said about each place, looked at one
// place at a time, with a watcher for each local repository. Places whose answer could have
// changed are swept together; a failure keeps the last answer and is asked again later.

import type { Context } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';
import { exec, machines, watchFolder } from 'herdr';

import { currentWindow } from '../../kit/index.ts';
import { pruneRecord, retireUnusedWatches } from './cache.ts';
import type { GitInfo, Place, RepoRef } from './tree.ts';
import { placeOf, repoOf } from './tree.ts';

// Changes made outside Herdr, such as an editor's save or a commit in another app, are looked
// for this often in repositories the list shows, while the window is in front.
const fallbackMilliseconds = 60_000;

export class GitTracker {
  // Place key to its git facts; null when it is not a repository.
  private git: Record<string, GitInfo | null> = {};

  // Place key to when git last looked at it.
  private checked: Record<string, number> = {};

  // Places git couldn't answer for, such as on a machine that is away.
  private readonly unsure = new Set<string>();

  // Queued places, one entry per place key, so a place asked for twice is looked at once.
  private readonly pending = new Map<string, Place>();

  private refreshing = false;

  // Pane to whether an agent works or a program runs in front of its shell there.
  private busy: Record<string, boolean> = {};

  // Machine to whether its layout was readable at the last look.
  private readonly ready: Record<string, boolean> = {};

  // Space to its place at the last look.
  private at: Record<string, Place> = {};

  // Local repositories' git folders being watched, by repository key.
  private watching = new Set<string>();

  entries(): Record<string, GitInfo | null> {
    return this.git;
  }

  lookup(key: string): GitInfo | null | undefined {
    return this.git[key];
  }

  // One entry per repository that has a local place, for the pull fetcher.
  repositories(): { repo: RepoRef; cwd: string }[] {
    const seen = new Set<string>();
    const repos: { repo: RepoRef; cwd: string }[] = [];

    for (const info of Object.values(this.git)) {
      if (info !== null && !seen.has(info.repo.key)) {
        seen.add(info.repo.key);
        repos.push({ repo: info.repo, cwd: info.cwd });
      }
    }

    return repos;
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a command or an
  // agent's turn just ended (a checkout, a commit, edits), those on a machine that is back, and
  // repositories in view whose fallback look is due.
  sweep(
    now: number,
    at: Record<string, Place>,
    spaceList: SpaceInfo[],
    paneList: PaneInfo[],
    foldedMachine: (machine: string) => boolean,
  ): Set<string> {
    const placeByKey = new Map<string, Place>(
      Object.values(at)
        .filter((place) => place.folder !== '')
        .map((place) => [place.key, place]),
    );

    const keys = new Set(placeByKey.keys());
    const due = new Set([...keys].filter((key) => !(key in this.git)));

    // Moved there: what it knew of that place may be old.
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
      this.addFallbacks(now, placeByKey, keys, due, foldedMachine);
    }

    return due;
  }

  // Drops cache entries for places no longer among the live spaces, so a closed space stops its
  // watcher and pull fetches.
  prune(live: ReadonlySet<string>): void {
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

  // One look at a time, each place once however often it was asked for meanwhile.
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

  private addFallbacks(
    now: number,
    placeByKey: Map<string, Place>,
    keys: Set<string>,
    due: Set<string>,
    foldedMachine: (machine: string) => boolean,
  ): void {
    for (const key of keys) {
      const asks = this.git[key] !== null && this.git[key] !== undefined;
      const known = asks || this.unsure.has(key);
      const machine = placeByKey.get(key)?.machine ?? '';
      const stale = now - (this.checked[key] ?? 0) > fallbackMilliseconds;

      if (known && !foldedMachine(machine) && stale) {
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
    this.watching = retireUnusedWatches(this.watching, this.git);
  }

  // One place's git: its branch, repository, and whether it is a linked worktree.
  private async check(place: Place, cx: Context): Promise<void> {
    const options = { cwd: place.folder, on: place.machine };

    this.checked[place.key] = Date.now();
    this.unsure.delete(place.key);

    try {
      const top = await exec('git', ['rev-parse', '--show-toplevel'], options);

      if (top.code !== 0) {
        await this.checkFailed(place, top.stderr);

        return;
      }

      // The repository's own .git folder names it; a worktree's top differs from it.
      const common = await exec(
        'git',
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        options,
      );

      const head = await exec('git', ['symbolic-ref', '--short', 'HEAD'], options);
      const repo = repoOf(place.machine, common.stdout.trim());
      const linked = repo.path !== `${top.stdout.trim()}/.git`;

      this.git[place.key] = {
        branch: head.code === 0 ? head.stdout.trim() : null,
        repo,
        cwd: place.folder,
        linked,
      };

      if (place.machine === null) {
        this.watch(repo, cx);
      }
    } catch {
      // Couldn't ask, such as when the machine is away: keep what it showed, look again later.
      this.git[place.key] ??= null;
      this.unsure.add(place.key);
    }
  }

  private async checkFailed(place: Place, stderr: string): Promise<void> {
    if (/must be run in a work tree/i.test(stderr)) {
      this.git[place.key] = await this.bareRepo(place);

      return;
    }

    // Only git's own "no" is remembered as no repository; anything else is asked again.
    if (!/not a git repository/i.test(stderr)) {
      this.unsure.add(place.key);
    }

    this.git[place.key] = null;
  }

  // A folder holding a bare repository, with its worktrees beside it, has no checkout of its
  // own; it stands in for the main checkout so the worktrees nest under it.
  private async bareRepo(place: Place): Promise<GitInfo | null> {
    const options = { cwd: place.folder, on: place.machine };
    const bare = await exec('git', ['rev-parse', '--is-bare-repository'], options);

    if (bare.stdout.trim() !== 'true') {
      return null;
    }

    const common = await exec(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      options,
    );

    const head = await exec('git', ['symbolic-ref', '--short', 'HEAD'], options);
    const repo = repoOf(place.machine, common.stdout.trim());
    const branch = head.code === 0 ? head.stdout.trim() : null;

    return { branch, repo, cwd: place.folder, linked: false };
  }

  private watch(repo: RepoRef, cx: Context): void {
    if (this.watching.has(repo.key)) {
      return;
    }

    this.watching.add(repo.key);

    cx.spawn(async (taskCx) => {
      try {
        while (this.watching.has(repo.key)) {
          // eslint-disable-next-line no-await-in-loop -- waits for each batch of changes in turn
          await watchFolder(repo.path);

          if (this.watching.has(repo.key)) {
            this.refresh(
              Object.values(this.git)
                .filter((info): info is GitInfo => info !== null && info.repo.key === repo.key)
                .map((info) => placeOf(info.repo.machine, info.cwd)),
              taskCx,
            );
          }
        }
      } catch {
        this.watching.delete(repo.key);
      }
    });
  }
}
