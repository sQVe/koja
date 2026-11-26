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
  readTextFile: (path: string) => Promise<string | null>;
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

// `git for-each-ref` answers for the whole repository, so the smallest root of a repository runs it.
const sourcesOf = (git: GitFacts, used: ReadonlySet<string>): Map<string, StackSource> => {
  const roots = new Map<string, { repository: RepositoryIdentity; roots: string[] }>();

  for (const worktree of Object.values(git.worktrees)) {
    const key = worktree.repository.key;

    if (!used.has(key)) {
      continue;
    }

    const entry = roots.get(key) ?? { repository: worktree.repository, roots: [] };

    entry.roots.push(worktree.root);
    roots.set(key, entry);
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
  private readonly due = new Set<string>();
  private readonly running = new Map<string, number>();
  private readonly watches: WatchRegistry;
  private sequence = 0;
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

    const used = usedRepositories(git.worktrees, checkoutWorktrees(git.worktrees));
    const sources = sourcesOf(git, used);

    this.watches.cancelUnused(used);

    for (const source of sources.values()) {
      this.watches.start(source.repository, cx);
    }

    this.applyEvents(used);
    this.markNew(used);
    this.startReads(sources, cx);
  }

  stop(): void {
    this.stopped = true;
    this.watches.stop();
  }

  private applyEvents(used: ReadonlySet<string>): void {
    for (const key of this.watches.takeEvents().keys()) {
      if (used.has(key)) {
        this.due.add(key);
      }
    }

    for (const key of this.due) {
      if (!used.has(key)) {
        this.due.delete(key);
      }
    }
  }

  private markNew(used: ReadonlySet<string>): void {
    for (const key of used) {
      if (!Object.hasOwn(this.stacksByRepository, key)) {
        this.due.add(key);
      }
    }
  }

  private startReads(sources: Map<string, StackSource>, cx: Context): void {
    for (const key of this.due) {
      const source = sources.get(key);

      if (source === undefined || this.running.has(key)) {
        continue;
      }

      this.startRead(source, cx);
    }
  }

  private startRead(source: StackSource, cx: Context): void {
    this.sequence += 1;

    const sequence = this.sequence;
    const key = source.repository.key;

    this.due.delete(key);
    this.running.set(key, sequence);

    cx.spawn(async () => {
      const read = await this.read(source);

      this.apply(key, sequence, read);
    });
  }

  private async read(source: StackSource): Promise<StackRead> {
    let text: string | null;

    try {
      text = await this.dependencies.readTextFile(
        `${source.repository.commonDirectory}/${recordName}`,
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
        on: null,
      });

      return result.code === 0 ? headsIn(result.stdout) : null;
    } catch {
      return null;
    }
  }

  private apply(key: string, sequence: number, read: StackRead): void {
    if (this.running.get(key) !== sequence) {
      return;
    }

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
