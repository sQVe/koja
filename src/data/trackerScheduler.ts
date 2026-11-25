import type { RunCommand } from './gitIdentity.ts';
import type { TicketRead, TicketSource } from './linearTickets.ts';
import { linearWorkspaceOf, ticketIdOf } from './linearTickets.ts';
import { readPeriodMilliseconds } from './pullDue.ts';
import type { GitFacts, RepositoryTracker, TicketFacts, WorktreeGit } from './snapshot.ts';

export type TicketRunner = (source: TicketSource) => Promise<TicketRead>;

export interface TrackerSchedulerDependencies {
  run: RunCommand;
  now: () => number;
  publish: () => void;
}

export interface TrackerScheduler {
  tick: (git: GitFacts, readTickets: TicketRunner) => void;
  stop: () => void;
  trackers: () => Record<string, RepositoryTracker>;
}

interface ReadMemory {
  at: number;
  branches: (string | null)[];
}

interface RepositorySource {
  key: string;
  cwd: string;
  configCwd: string;
  machine: string | null;
  branches: (string | null)[];
  ids: string[];
}

type WorkspaceRead = { kind: 'read'; workspace: string } | { kind: 'failed' };

const folderNameOf = (path: string): string =>
  path.split('/').findLast((part) => part !== '') ?? path;

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

const idsOf = (git: GitFacts, repositoryKey: string): string[] => {
  const ids = new Set<string>();

  for (const place of Object.values(git.places)) {
    if (place.kind !== 'repository') {
      continue;
    }

    const worktree = git.worktrees[place.worktree];

    if (worktree?.repository.key !== repositoryKey) {
      continue;
    }

    const id = ticketIdOf(worktree.branch, folderNameOf(worktree.root));

    if (id !== null) {
      ids.add(id);
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

const configCwdOf = (worktrees: WorktreeGit[], fallback: string): string =>
  worktrees.find((worktree) => !worktree.linked)?.root ?? fallback;

const sourcesOf = (git: GitFacts): Map<string, RepositorySource> => {
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
      configCwd: configCwdOf(worktrees, cwd),
      machine: first.repository.machine,
      branches: branchesOf(worktrees),
      ids: idsOf(git, key),
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

  tick(git: GitFacts, readTickets: TicketRunner): void {
    if (this.stopped) {
      return;
    }

    const now = this.dependencies.now();

    for (const source of sourcesOf(git).values()) {
      if (this.shouldRead(source, now)) {
        this.startRead(source, readTickets, now);
      }
    }
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

    return now - memory.at >= readPeriodMilliseconds;
  }

  private startRead(source: RepositorySource, readTickets: TicketRunner, now: number): void {
    this.running.add(source.key);
    this.reads.set(source.key, { at: now, branches: source.branches });

    this.read(source, readTickets).catch(() => {
      this.finish(source.key, {
        workspace: null,
        tickets: this.previousTickets(source.key),
        failed: true,
      });
    });
  }

  private async read(source: RepositorySource, readTickets: TicketRunner): Promise<void> {
    const workspace = await this.workspaceOf(source);

    if (this.stopped) {
      return;
    }

    if (workspace.kind === 'failed') {
      this.finish(source.key, {
        workspace: null,
        tickets: this.previousTickets(source.key),
        failed: true,
      });

      return;
    }

    const read = await readTickets({
      workspace: workspace.workspace,
      cwd: source.cwd,
      machine: source.machine,
      ids: source.ids,
    });

    if (read.kind === 'dropped') {
      this.running.delete(source.key);

      return;
    }

    const previous = this.trackersByRepository[source.key];
    const next = trackerAfter(workspace.workspace, read, previous);

    this.finish(source.key, next);
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

  private async workspaceOf(source: RepositorySource): Promise<WorkspaceRead> {
    const path = `${source.configCwd}/.linear.toml`;

    const result = await this.dependencies.run('cat', [path], {
      cwd: source.configCwd,
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
