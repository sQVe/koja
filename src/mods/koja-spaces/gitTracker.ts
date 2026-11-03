import type { Context } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';
import { exec, machines, watchFolder } from 'herdr';

import { currentWindow } from '../../kit/index.ts';
import { negativeEntryExpired, pruneRecord, retireUnusedWatches } from './cache.ts';
import type { GitInfo, Place, RepoRef } from './tree.ts';
import { placeOf, repoOf } from './tree.ts';

// Changes made outside Herdr, such as an editor's save or a commit in another app, are looked
// for this often in repositories the list shows, while the window is in front.
const fallbackMilliseconds = 60_000;

export class GitTracker {
  private git: Record<string, GitInfo | null> = {};

  private checked: Record<string, number> = {};

  private readonly unsure = new Set<string>();

  private readonly pending = new Map<string, Place>();

  private refreshing = false;

  private busy: Record<string, boolean> = {};

  private readonly ready: Record<string, boolean> = {};

  private at: Record<string, Place> = {};

  private watching = new Set<string>();

  entries(): Record<string, GitInfo | null> {
    return this.git;
  }

  lookup(key: string): GitInfo | null | undefined {
    return this.git[key];
  }

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
      const noRepository = this.git[key] === null;

      const expired =
        noRepository && negativeEntryExpired(this.checked[key], now, fallbackMilliseconds);

      const known = asks || this.unsure.has(key) || expired;
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

      const common = await exec(
        'git',
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        options,
      );

      const head = await exec('git', ['symbolic-ref', '--short', 'HEAD'], options);
      const repo = repoOf(place.machine, common.stdout.trim());
      const linked = repo.path !== `${top.stdout.trim()}/.git`;
      const committedAt = linked ? null : await this.lastCommit(place);

      this.git[place.key] = {
        branch: head.code === 0 ? head.stdout.trim() : null,
        repo,
        cwd: place.folder,
        linked,
        committedAt,
      };

      if (place.machine === null) {
        this.watch(repo, cx);
      }
    } catch {
      this.git[place.key] ??= null;
      this.unsure.add(place.key);
    }
  }

  // The age is optional: a failed read must not drop the repository the other reads found.
  private async lastCommit(place: Place): Promise<number | null> {
    try {
      const log = await exec('git', ['log', '-1', '--format=%ct', 'HEAD'], {
        cwd: place.folder,
        on: place.machine,
      });

      return log.code === 0 ? Number(log.stdout.trim()) : null;
    } catch {
      return null;
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
    const committedAt = await this.lastCommit(place);

    return { branch, repo, cwd: place.folder, linked: false, committedAt };
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
