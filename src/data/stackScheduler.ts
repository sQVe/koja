import type { Context } from 'gpui-kit';

import type { WatchFolder } from './folderWatch.ts';
import type { RepositoryIdentity, RunCommand } from './gitIdentity.ts';
import type { WatchRegistry } from './gitWatches.ts';
import { checkoutWorktrees, createWatchRegistry, usedRepositories } from './gitWatches.ts';
import type { Lease } from './lease.ts';
import { sameHolder } from './lease.ts';
import type { GitFacts, RepositoryStacks } from './snapshot.ts';
import type { Stack } from './stacks.ts';
import { parseStacks } from './stacks.ts';

export interface StackSchedulerDependencies {
  run: RunCommand;
  readTextFile: (path: string, options: { on: string | null }) => Promise<string | null>;
  watchFolder: WatchFolder;
  now: () => number;
  heldLease: () => Lease | null;
  publish: () => void;
}

export interface StackScheduler {
  tick: (git: GitFacts, cx: Context) => void;
  stacks: () => Record<string, RepositoryStacks>;
  stop: () => void;
}

interface StackSource {
  repository: RepositoryIdentity;
  cwd: string;
}

type StackRead = { kind: 'stacks'; stacks: Stack[] } | { kind: 'empty' } | { kind: 'failed' };

const recordName = 'gh-stack';

const readLimit = 2;

const debounceMilliseconds = 250;

// `git for-each-ref` answers for the whole repository, so the smallest root of a repository runs it.
const sourcesOf = (git: GitFacts, checkouts: ReadonlySet<string>): Map<string, StackSource> => {
  const roots = new Map<string, { repository: RepositoryIdentity; roots: string[] }>();

  for (const [key, worktree] of Object.entries(git.worktrees)) {
    if (!checkouts.has(key)) {
      continue;
    }

    const repositoryKey = worktree.repository.key;

    const entry = roots.get(repositoryKey) ?? { repository: worktree.repository, roots: [] };

    entry.roots.push(worktree.root);
    roots.set(repositoryKey, entry);
  }

  const sources = new Map<string, StackSource>();

  for (const [key, entry] of roots) {
    const cwd = entry.roots.toSorted().at(0);

    if (cwd !== undefined) {
      sources.set(key, { repository: entry.repository, cwd });
    }
  }

  return sources;
};

const keepEarliest = (stored: Map<string, number>, key: string, at: number): void => {
  const first = stored.get(key);

  if (first !== undefined && first <= at) {
    return;
  }

  stored.set(key, at);
};

const headsIn = (stdout: string): Map<string, string> => {
  const heads = new Map<string, string>();

  for (const line of stdout.split('\n')) {
    const separator = line.indexOf(' ');

    if (separator <= 0) {
      continue;
    }

    heads.set(line.slice(0, separator), line.slice(separator + 1));
  }

  return heads;
};

class Scheduler implements StackScheduler {
  private readonly stacksByRepository: Record<string, RepositoryStacks>;
  private readonly due = new Map<string, number>();
  private readonly readRepositories = new Set<string>();
  private readonly running = new Set<string>();
  private readonly watches: WatchRegistry;
  private stopped = false;

  constructor(
    private readonly dependencies: StackSchedulerDependencies,
    private readonly lease: Lease,
    seed: Record<string, RepositoryStacks>,
  ) {
    this.stacksByRepository = { ...seed };
    this.watches = createWatchRegistry(dependencies.watchFolder, dependencies.now);
  }

  stacks(): Record<string, RepositoryStacks> {
    return this.stacksByRepository;
  }

  tick(git: GitFacts, cx: Context): void {
    if (this.stopped) {
      return;
    }

    const checkouts = checkoutWorktrees(git.worktrees);
    const sources = sourcesOf(git, checkouts);
    const watched = usedRepositories(git.worktrees, checkouts);

    this.watches.cancelUnused(watched);

    for (const key of watched) {
      const source = sources.get(key);

      if (source !== undefined) {
        this.watches.start(source.repository, cx);
      }
    }

    this.applyEvents(sources);
    this.markNew(sources);
    this.startReads(sources, cx);
  }

  stop(): void {
    this.stopped = true;
    this.watches.stop();
  }

  private applyEvents(sources: Map<string, StackSource>): void {
    for (const [key, at] of this.watches.takeEvents()) {
      if (sources.has(key)) {
        keepEarliest(this.due, key, at + debounceMilliseconds);
      }
    }

    for (const key of this.due.keys()) {
      if (!sources.has(key)) {
        this.due.delete(key);
      }
    }
  }

  private markNew(sources: Map<string, StackSource>): void {
    for (const key of this.readRepositories) {
      if (!sources.has(key)) {
        this.readRepositories.delete(key);
      }
    }

    for (const key of sources.keys()) {
      if (!this.readRepositories.has(key)) {
        keepEarliest(this.due, key, this.dependencies.now());
      }
    }
  }

  private startReads(sources: Map<string, StackSource>, cx: Context): void {
    const now = this.dependencies.now();
    const free = Math.max(0, readLimit - this.running.size);

    const due = [...this.due.entries()]
      .filter(([key, at]) => at <= now && !this.running.has(key) && sources.has(key))
      .toSorted(([leftKey, leftAt], [rightKey, rightAt]) =>
        leftAt === rightAt ? leftKey.localeCompare(rightKey) : leftAt - rightAt,
      )
      .slice(0, free);

    for (const [key] of due) {
      const source = sources.get(key);

      if (source !== undefined) {
        this.startRead(source, cx);
      }
    }
  }

  private startRead(source: StackSource, cx: Context): void {
    const key = source.repository.key;

    this.due.delete(key);
    this.readRepositories.add(key);
    this.running.add(key);

    cx.spawn(async () => {
      try {
        const read = await this.read(source);

        this.apply(key, read);
      } catch {
        this.running.delete(key);
      }
    });
  }

  private async read(source: StackSource): Promise<StackRead> {
    let text: string | null;

    try {
      text = await this.dependencies.readTextFile(
        `${source.repository.commonDirectory}/${recordName}`,
        { on: source.repository.machine },
      );
    } catch {
      return { kind: 'failed' };
    }

    if (text === null) {
      return { kind: 'empty' };
    }

    const heads = await this.headsOf(source);

    if (heads === null) {
      return { kind: 'failed' };
    }

    const parsed = parseStacks(text, heads);

    return parsed.kind === 'failed'
      ? { kind: 'failed' }
      : { kind: 'stacks', stacks: parsed.stacks };
  }

  private async headsOf(source: StackSource): Promise<Map<string, string> | null> {
    const format = '--format=%(refname:short) %(objectname)';

    try {
      const result = await this.dependencies.run('git', ['for-each-ref', format, 'refs/heads'], {
        cwd: source.cwd,
        on: source.repository.machine,
      });

      return result.code === 0 ? headsIn(result.stdout) : null;
    } catch {
      return null;
    }
  }

  private apply(key: string, read: StackRead): void {
    this.running.delete(key);

    if (this.stopped || !this.stillOwner()) {
      return;
    }

    this.stacksByRepository[key] = this.stacksAfter(read, this.stacksByRepository[key]);
    this.dependencies.publish();
  }

  private stacksAfter(read: StackRead, previous: RepositoryStacks | undefined): RepositoryStacks {
    if (read.kind === 'failed') {
      return { stacks: previous?.stacks ?? [], failed: true };
    }

    return { stacks: read.kind === 'stacks' ? read.stacks : [], failed: false };
  }

  private stillOwner(): boolean {
    const held = this.dependencies.heldLease();

    return held !== null && sameHolder(held, this.lease);
  }
}

export const createStackScheduler = (
  dependencies: StackSchedulerDependencies,
  lease: Lease,
  seed: Record<string, RepositoryStacks> = {},
): StackScheduler => new Scheduler(dependencies, lease, seed);
