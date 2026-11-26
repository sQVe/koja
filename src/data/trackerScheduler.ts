import { folderNameOf } from './fields.ts';
import type { RepositoryIdentity, RunCommand } from './gitIdentity.ts';
import type { TicketRead, TicketSource } from './linearTickets.ts';
import { linearWorkspaceOf, ticketIdOf } from './linearTickets.ts';
import { readPeriodMilliseconds } from './pullDue.ts';
import { attachedStacks } from './pullSources.ts';
import type {
  GitFacts,
  RepositoryStacks,
  RepositoryTracker,
  TicketFacts,
  WorktreeGit,
} from './snapshot.ts';

export type TicketRunner = (source: TicketSource) => Promise<TicketRead>;

export interface TrackerSchedulerDependencies {
  run: RunCommand;
  now: () => number;
  publish: () => void;
}

export interface TrackerScheduler {
  tick: (
    git: GitFacts,
    stacks: Readonly<Record<string, RepositoryStacks>>,
    readTickets: TicketRunner,
  ) => void;
  stop: () => void;
  trackers: () => Record<string, RepositoryTracker>;
}

interface ReadMemory {
  at: number;
  branches: (string | null)[];
  stackBranches: string[];
}

interface RepositorySource {
  key: string;
  cwd: string;
  configCwd: string | null;
  checkoutCwd: string | null;
  machine: string | null;
  branches: (string | null)[];
  stackBranches: string[];
  ids: string[];
}

type WorkspaceRead = { kind: 'read'; workspace: string } | { kind: 'failed' };

type ReadOutcome =
  | { kind: 'tracker'; tracker: RepositoryTracker }
  | { kind: 'dropped' }
  | { kind: 'failed' };

const readLimit = 2;

const worktreesByRepository = (git: GitFacts): Map<string, WorktreeGit[]> => {
  const grouped = new Map<string, WorktreeGit[]>();

  for (const worktree of Object.values(git.worktrees)) {
    const list = grouped.get(worktree.repository.key) ?? [];

    list.push(worktree);
    grouped.set(worktree.repository.key, list);
  }

  return grouped;
};

const branchesOf = (worktrees: WorktreeGit[]): (string | null)[] => {
  const branches = new Set<string | null>();

  for (const worktree of worktrees) {
    branches.add(worktree.branch);
  }

  return [...branches].toSorted((left, right) => (left ?? '').localeCompare(right ?? ''));
};

const stackBranchesOf = (
  git: GitFacts,
  repository: RepositoryIdentity,
  stacks: Readonly<Record<string, RepositoryStacks>>,
): string[] => {
  const branches = new Set<string>();

  for (const stack of attachedStacks(git, repository, stacks)) {
    for (const entry of stack.branches) {
      branches.add(entry.branch);
    }
  }

  return [...branches].toSorted();
};

const idsOf = (
  git: GitFacts,
  repository: RepositoryIdentity,
  stacks: Readonly<Record<string, RepositoryStacks>>,
): string[] => {
  const ids = new Set<string>();

  for (const place of Object.values(git.places)) {
    if (place.kind !== 'repository') {
      continue;
    }

    const worktree = git.worktrees[place.worktree];

    if (worktree?.repository.key !== repository.key) {
      continue;
    }

    const id = ticketIdOf(worktree.branch, folderNameOf(worktree.root));

    if (id !== null) {
      ids.add(id);
    }
  }

  for (const stack of attachedStacks(git, repository, stacks)) {
    for (const entry of stack.branches) {
      const id = ticketIdOf(entry.branch, '');

      if (id !== null) {
        ids.add(id);
      }
    }
  }

  return [...ids].toSorted();
};

const cwdOf = (git: GitFacts, repositoryKey: string, worktrees: WorktreeGit[]): string => {
  let smallestPlace: string | null = null;
  let cwd = '';

  for (const [key, place] of Object.entries(git.places)) {
    if (place.kind !== 'repository') {
      continue;
    }

    const worktree = git.worktrees[place.worktree];

    if (worktree?.repository.key !== repositoryKey) {
      continue;
    }

    if (smallestPlace !== null && smallestPlace <= key) {
      continue;
    }

    smallestPlace = key;
    cwd = worktree.root;
  }

  if (cwd !== '') {
    return cwd;
  }

  return worktrees.map((worktree) => worktree.root).toSorted()[0] ?? '';
};

const withoutTrailingSlashes = (path: string): string => path.replace(/\/+$/, '');

const isBareWorktree = (worktree: WorktreeGit): boolean =>
  withoutTrailingSlashes(worktree.root) ===
  withoutTrailingSlashes(worktree.repository.commonDirectory);

const worktreesByRoot = (worktrees: WorktreeGit[]): WorktreeGit[] =>
  worktrees.toSorted((left, right) => left.root.localeCompare(right.root));

const configCwdOf = (worktrees: WorktreeGit[]): string | null =>
  worktreesByRoot(worktrees).find((worktree) => !worktree.linked && !isBareWorktree(worktree))
    ?.root ?? null;

const checkoutCwdOf = (worktrees: WorktreeGit[]): string | null =>
  worktreesByRoot(worktrees).find((worktree) => !isBareWorktree(worktree))?.root ?? null;

const mainWorktreeOf = (porcelain: string): string | null => {
  const [first] = porcelain.split(/\n\s*\n/);
  const lines = first?.split('\n') ?? [];
  const folderLine = lines.find((line) => line.startsWith('worktree '));

  if (folderLine === undefined || lines.includes('bare')) {
    return null;
  }

  return folderLine.slice('worktree '.length);
};

const sourcesOf = (
  git: GitFacts,
  stacks: Readonly<Record<string, RepositoryStacks>>,
): Map<string, RepositorySource> => {
  const sources = new Map<string, RepositorySource>();

  for (const [key, worktrees] of worktreesByRepository(git)) {
    const [first] = worktrees;
    const cwd = cwdOf(git, key, worktrees);

    if (first === undefined || cwd === '') {
      continue;
    }

    sources.set(key, {
      key,
      cwd,
      configCwd: configCwdOf(worktrees),
      checkoutCwd: checkoutCwdOf(worktrees),
      machine: first.repository.machine,
      branches: branchesOf(worktrees),
      stackBranches: stackBranchesOf(git, first.repository, stacks),
      ids: idsOf(git, first.repository, stacks),
    });
  }

  return sources;
};

const sameBranches = (left: (string | null)[], right: (string | null)[]): boolean =>
  left.length === right.length && left.every((branch, index) => branch === right[index]);

const ticketMapOf = (tickets: TicketFacts[]): Record<string, TicketFacts> =>
  Object.fromEntries(tickets.map((ticket) => [ticket.id, ticket]));

export const mergeTrackers = (
  previous: RepositoryTracker | undefined,
  next: RepositoryTracker,
): RepositoryTracker => {
  if (!next.failed || previous === undefined) {
    return next;
  }

  return { workspace: next.workspace, tickets: previous.tickets, failed: true };
};

const trackerAfter = (
  workspace: string,
  read: Exclude<TicketRead, { kind: 'dropped' }>,
  previous: RepositoryTracker | undefined,
): RepositoryTracker => {
  if (read.kind === 'read') {
    return { workspace, tickets: ticketMapOf(read.tickets), failed: false };
  }

  return { workspace, tickets: previous?.tickets ?? {}, failed: true };
};

class Scheduler implements TrackerScheduler {
  private readonly trackersByRepository: Record<string, RepositoryTracker>;
  private readonly reads = new Map<string, ReadMemory>();
  private readonly running = new Set<string>();
  private stopped = false;

  constructor(
    private readonly dependencies: TrackerSchedulerDependencies,
    seed: Record<string, RepositoryTracker>,
  ) {
    this.trackersByRepository = { ...seed };
  }

  trackers(): Record<string, RepositoryTracker> {
    return this.trackersByRepository;
  }

  tick(
    git: GitFacts,
    stacks: Readonly<Record<string, RepositoryStacks>>,
    readTickets: TicketRunner,
  ): void {
    if (this.stopped) {
      return;
    }

    const now = this.dependencies.now();
    const free = Math.max(0, readLimit - this.running.size);

    const due = [...sourcesOf(git, stacks).values()]
      .filter((source) => this.shouldRead(source, now))
      .toSorted((left, right) => this.byOldestRead(left, right));

    for (const source of due.slice(0, free)) {
      this.startRead(source, readTickets, now);
    }
  }

  private byOldestRead(left: RepositorySource, right: RepositorySource): number {
    const leftStart = this.reads.get(left.key)?.at ?? 0;
    const rightStart = this.reads.get(right.key)?.at ?? 0;
    const difference = leftStart - rightStart;

    return difference === 0 ? left.key.localeCompare(right.key) : difference;
  }

  stop(): void {
    this.stopped = true;
  }

  private shouldRead(source: RepositorySource, now: number): boolean {
    if (source.ids.length === 0 || this.running.has(source.key)) {
      return false;
    }

    const memory = this.reads.get(source.key);

    if (memory === undefined) {
      return true;
    }

    if (!sameBranches(memory.branches, source.branches)) {
      return true;
    }

    if (!sameBranches(memory.stackBranches, source.stackBranches)) {
      return true;
    }

    return now - memory.at >= readPeriodMilliseconds;
  }

  private startRead(source: RepositorySource, readTickets: TicketRunner, now: number): void {
    this.running.add(source.key);

    this.reads.set(source.key, {
      at: now,
      branches: source.branches,
      stackBranches: source.stackBranches,
    });

    // A publish failure must not undo the read that finished before it.
    this.runRead(source, readTickets).catch(() => undefined);
  }

  private async runRead(source: RepositorySource, readTickets: TicketRunner): Promise<void> {
    let outcome: ReadOutcome;

    try {
      outcome = await this.read(source, readTickets);
    } catch {
      outcome = { kind: 'failed' };
    }

    this.applyRead(source.key, outcome);
  }

  private applyRead(key: string, outcome: ReadOutcome): void {
    if (outcome.kind === 'dropped') {
      this.running.delete(key);

      return;
    }

    if (outcome.kind === 'failed') {
      this.finish(key, {
        workspace: null,
        tickets: this.previousTickets(key),
        failed: true,
      });

      return;
    }

    this.finish(key, outcome.tracker);
  }

  private async read(source: RepositorySource, readTickets: TicketRunner): Promise<ReadOutcome> {
    const workspace = await this.workspaceOf(source);

    if (this.stopped) {
      return { kind: 'dropped' };
    }

    if (workspace.kind === 'failed') {
      return { kind: 'failed' };
    }

    const read = await readTickets({
      workspace: workspace.workspace,
      cwd: source.cwd,
      machine: source.machine,
      ids: this.readIdsOf(source),
    });

    if (read.kind === 'dropped') {
      return { kind: 'dropped' };
    }

    const previous = this.trackersByRepository[source.key];
    const next = trackerAfter(workspace.workspace, read, previous);

    return { kind: 'tracker', tracker: next };
  }

  // A direct ticket's parent is read in the next round, one level up and no further.
  private readIdsOf(source: RepositorySource): string[] {
    const ids = new Set(source.ids);
    const tickets = this.trackersByRepository[source.key]?.tickets ?? {};

    for (const id of source.ids) {
      const parent = tickets[id]?.parent;

      if (parent !== null && parent !== undefined) {
        ids.add(parent);
      }
    }

    return [...ids].toSorted();
  }

  private previousTickets(key: string): Record<string, TicketFacts> {
    return this.trackersByRepository[key]?.tickets ?? {};
  }

  private finish(key: string, next: RepositoryTracker): void {
    this.running.delete(key);

    if (this.stopped) {
      return;
    }

    this.trackersByRepository[key] = mergeTrackers(this.trackersByRepository[key], next);
    this.dependencies.publish();
  }

  private async configCwdFor(source: RepositorySource): Promise<string | null> {
    if (source.configCwd !== null) {
      return source.configCwd;
    }

    const result = await this.dependencies.run('git', ['worktree', 'list', '--porcelain'], {
      cwd: source.cwd,
      on: source.machine,
    });

    if (result.code === 0) {
      const main = mainWorktreeOf(result.stdout);

      if (main !== null) {
        return main;
      }
    }

    return source.checkoutCwd;
  }

  private async workspaceOf(source: RepositorySource): Promise<WorkspaceRead> {
    const configCwd = await this.configCwdFor(source);

    if (configCwd === null) {
      return { kind: 'failed' };
    }

    const path = `${configCwd}/.linear.toml`;

    const result = await this.dependencies.run('cat', [path], {
      cwd: configCwd,
      on: source.machine,
    });

    if (result.code !== 0) {
      return { kind: 'failed' };
    }

    const workspace = linearWorkspaceOf(result.stdout);

    return workspace === null ? { kind: 'failed' } : { kind: 'read', workspace };
  }
}

export const createTrackerScheduler = (
  dependencies: TrackerSchedulerDependencies,
  seed: Record<string, RepositoryTracker> = {},
): TrackerScheduler => new Scheduler(dependencies, seed);
