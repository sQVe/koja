import type { ExecResult, FolderWatch, PaneInfo, Program, SpaceInfo, Status, TabInfo } from 'herdr';

import type { GitWorld } from '../src/data/gitDue.ts';
import type { RunCommand } from '../src/data/gitIdentity.ts';
import { placeOf } from '../src/data/gitIdentity.ts';
import type { Lease } from '../src/data/lease.ts';
import { heartbeatKey, leaseKey } from '../src/data/lease.ts';
import { createSnapshotPublisher } from '../src/data/publisher.ts';
import type { GitFacts } from '../src/data/snapshot.ts';
import { joinFacts, parseSnapshot, snapshotKey } from '../src/data/snapshot.ts';

interface Dependencies {
  run: RunCommand;
  watchFolder: (folder: string) => FolderWatch;
  now: () => number;
  heldLease: () => Lease | null;
  publish: () => void;
}

export interface SchedulerLike {
  tick: (world: GitWorld, cx: unknown) => void;
  gitFacts: () => GitFacts;
  stop: () => void;
}

interface FolderGit {
  layout: string;
  top?: string;
  branch?: string;
}

interface StartedRead {
  machine: string | null;
  folder: string;
  key: string;
  resolve: () => void;
}

interface WatchFake {
  folder: string;
  cancelled: boolean;
  resolve: (paths: string[]) => void;
  reject: (reason: Error) => void;
}

const readLimit = 4;

const modulePath = '../src/data/gitScheduler.ts';

const loaded = (await import(modulePath)) as {
  createGitScheduler: (dependencies: Dependencies, lease: Lease, seed: GitFacts) => SchedulerLike;
};

export const placeKeyOf = (machine: string | null, folder: string): string =>
  placeOf(machine, folder).key;

const ok: ExecResult = { code: 0, stdout: '', stderr: '' };

const shell: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

const tabOf = (id: string): TabInfo => ({
  id,
  index: 1,
  name: '1',
  named: false,
  active: true,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

export const spaceOf = (id: string, folder: string, machine: string | null = null): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder,
  machine,
  branch: null,
  active: false,
  status: null,
  tabs: [tabOf(`tab-${id}`)],
});

export const terminal = (pane: string, tab: string, status: Status | null): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab,
  title: 'zsh',
  cwd: null,
  branch: null,
  status,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

export const worldOf = (spaces: SpaceInfo[], panes: PaneInfo[] = []): GitWorld => ({
  spaces,
  panes,
  machines: [],
});

export const mainCheckout = (root: string): FolderGit => ({
  layout: `false\nfalse\n${root}/.git\n${root}/.git\n`,
  top: root,
  branch: 'main\n',
});

export class GitSchedulerHarness {
  folders: Record<string, FolderGit> = {};
  failure: string | null = null;
  started: StartedRead[] = [];
  pending: StartedRead[] = [];
  open = new Map<string, string | null>();
  violations: string[] = [];
  watches: WatchFake[] = [];
  watched: string[] = [];
  spawned: Promise<unknown>[] = [];
  sharedValues = new Map<string, unknown>();
  published: GitFacts[] = [];
  now = 0;
  lease: Lease = { version: 1, owner: 'owner-a', generation: 1 };
  held: Lease | null = this.lease;
  heldLeaseOverride: (() => Lease | null) | null = null;

  private current: SchedulerLike | null = null;

  context = {
    spawn: (body: (cx: unknown) => unknown): void => {
      this.spawned.push(Promise.resolve(body(this.context)));
    },
    notify: (): void => undefined,
  };

  constructor() {
    this.reset();
  }

  get scheduler(): SchedulerLike {
    if (this.current === null) {
      throw new Error('scheduler not started');
    }

    return this.current;
  }

  reset(): void {
    this.folders = {};
    this.failure = null;
    this.started = [];
    this.pending = [];
    this.open = new Map();
    this.violations = [];
    this.watches = [];
    this.watched = [];
    this.spawned = [];
    this.sharedValues = new Map();
    this.published = [];
    this.now = 0;
    this.lease = { version: 1, owner: 'owner-a', generation: 1 };
    this.held = this.lease;
    this.heldLeaseOverride = null;
    this.current = null;
    this.sharedValues.set(leaseKey, this.lease);
    this.renew();
  }

  start(seed?: GitFacts): SchedulerLike {
    const initial = seed ?? { places: {}, worktrees: {} };

    const publisher = createSnapshotPublisher(
      (key) => this.sharedValues.get(key),
      (key, value) => {
        this.sharedValues.set(key, structuredClone(value));
      },
      () => this.now,
    );

    this.current = loaded.createGitScheduler(
      {
        run: this.run,
        watchFolder: this.watchFolder,
        now: () => this.now,
        heldLease: () => (this.heldLeaseOverride === null ? this.held : this.heldLeaseOverride()),
        publish: () => {
          const git = this.scheduler.gitFacts();

          this.published.push(git);
          publisher.publish(this.lease, joinFacts(git, {}, {}));
        },
      },
      this.lease,
      initial,
    );

    return this.current;
  }

  setFolder(machine: string | null, folder: string, git: FolderGit): void {
    this.folders[placeKeyOf(machine, folder)] = git;
  }

  clearFolder(machine: string | null, folder: string): void {
    Reflect.deleteProperty(this.folders, placeKeyOf(machine, folder));
  }

  setNow(at: number): void {
    this.now = at;
    this.renew();
  }

  renew(): void {
    this.sharedValues.set(heartbeatKey, { ...this.lease, at: this.now });
  }

  revision(): number {
    return parseSnapshot(this.sharedValues.get(snapshotKey))?.revision ?? 0;
  }

  gateOf(key: string): string | null {
    const place = this.scheduler.gitFacts().places[key];

    if (place?.kind !== 'repository') {
      return null;
    }

    return place.worktree;
  }

  startedAt(index: number): StartedRead {
    const read = this.started[index];

    if (read === undefined) {
      throw new Error(`no read at ${index}`);
    }

    return read;
  }

  async settle(): Promise<void> {
    for (let index = 0; index < 30; index += 1) {
      await Promise.resolve();
    }
  }

  async complete(read: StartedRead): Promise<void> {
    this.pending = this.pending.filter((entry) => entry !== read);
    this.open.delete(read.key);
    read.resolve();
    await this.settle();
  }

  async fire(): Promise<void> {
    const watch = this.watches.at(-1);

    if (watch === undefined) {
      throw new Error('no folder watch to fire');
    }

    watch.resolve([]);
    await this.settle();
  }

  private answer(args: string[], machine: string | null, folder: string): ExecResult {
    if (this.failure !== null) {
      return { code: 128, stdout: '', stderr: this.failure };
    }

    const git = this.folders[placeKeyOf(machine, folder)];

    if (git === undefined) {
      return { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
    }

    if (args.includes('--is-bare-repository')) {
      return { ...ok, stdout: git.layout };
    }

    if (args.includes('--show-toplevel')) {
      return { ...ok, stdout: `${git.top ?? folder}\n` };
    }

    if (args[0] === 'symbolic-ref') {
      return git.branch === undefined ? { ...ok, code: 1 } : { ...ok, stdout: git.branch };
    }

    return ok;
  }

  private async beginRead(machine: string | null, folder: string): Promise<void> {
    const key = placeKeyOf(machine, folder);
    const gate = this.gateOf(key);

    if (this.open.size >= readLimit) {
      this.violations.push(`more than four reads when starting ${key}`);
    }

    if (this.open.has(key)) {
      this.violations.push(`two reads for place ${key}`);
    }

    if (gate !== null && [...this.open.values()].includes(gate)) {
      this.violations.push(`two reads for worktree ${gate}`);
    }

    const settled = Promise.withResolvers<undefined>();
    const read: StartedRead = { machine, folder, key, resolve: settled.resolve };

    this.open.set(key, gate);
    this.started.push(read);
    this.pending.push(read);
    await settled.promise;
  }

  private readonly run: RunCommand = async (_command, args, options) => {
    if (args.includes('--is-bare-repository')) {
      await this.beginRead(options.on, options.cwd);
    }

    return this.answer(args, options.on, options.cwd);
  };

  private readonly watchFolder = (folder: string): FolderWatch => {
    const settled = Promise.withResolvers<string[]>();

    const watch: WatchFake = {
      folder,
      cancelled: false,
      resolve: settled.resolve,
      reject: settled.reject,
    };

    this.watches.push(watch);
    this.watched.push(folder);

    return Object.assign(settled.promise, {
      cancel: () => {
        watch.cancelled = true;
        settled.resolve([]);
      },
    });
  };
}
