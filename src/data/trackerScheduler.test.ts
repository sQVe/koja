import { beforeEach, describe, expect, test } from 'bun:test';

import type { RunCommand } from './gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { TicketRead, TicketSource } from './linearTickets.ts';
import type { GitFacts, RepositoryTracker, TicketFacts } from './snapshot.ts';
import { createTrackerScheduler, mergeTrackers } from './trackerScheduler.ts';

interface Harness {
  scheduler: ReturnType<typeof createTrackerScheduler>;
  sources: TicketSource[];
  published: number;
  read: () => TicketRead;
}

const start = 1_800_000_000_000;

const folder = '/code/me-1036-title-spaces-with-their-linear-tickets';
const repository = repositoryOf(null, `${folder}/.git`);

const ticket = (id: string): TicketFacts => ({
  id,
  title: `Title of ${id}`,
  state: 'In Progress',
  url: `https://linear.app/sqve/issue/${id}`,
  parent: null,
  failed: false,
});

const gitFactsOf = (
  branches: (string | null)[],
  firstRoot: string = folder,
  firstPlace: string = firstRoot,
): GitFacts => {
  const places: GitFacts['places'] = {};
  const worktrees: GitFacts['worktrees'] = {};

  for (const [index, branch] of branches.entries()) {
    const root = index === 0 ? firstRoot : `${folder}-${index}`;
    const placeFolder = index === 0 ? firstPlace : root;
    const place = placeOf(null, placeFolder);
    const worktree = worktreeOf(null, root);

    places[place.key] = { kind: 'repository', worktree: worktree.key };

    worktrees[worktree.key] = {
      repository,
      root,
      branch,
      linked: index > 0,
    };
  }

  return { places, worktrees };
};

const workspaceRun = (): RunCommand => async (command, args) => {
  if (command !== 'cat') {
    return { code: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` };
  }

  return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
};

const missingWorkspaceRun: RunCommand = async () => ({
  code: 1,
  stdout: '',
  stderr: 'cat: .linear.toml: No such file or directory',
});

const settle = async (): Promise<void> => {
  for (let index = 0; index < 30; index += 1) {
    await Promise.resolve();
  }
};

const pendingRead = () => {
  let settleRead: ((read: TicketRead) => void) | undefined;

  const promise = new Promise<TicketRead>((resolve) => {
    settleRead = resolve;
  });

  return {
    promise,
    resolve: (read: TicketRead): void => {
      settleRead?.(read);
    },
  };
};

let reads: TicketRead[] = [];
let now = start;

const harnessOf = (
  run: RunCommand = workspaceRun(),
  seed: Record<string, RepositoryTracker> = {},
): Harness => {
  const sources: TicketSource[] = [];
  let published = 0;

  const scheduler = createTrackerScheduler(
    {
      run,
      now: () => now,
      publish: () => {
        published += 1;
      },
    },
    seed,
  );

  return {
    scheduler,
    sources,
    get published() {
      return published;
    },
    read: (): TicketRead => {
      const next = reads.shift();

      if (next === undefined) {
        throw new Error('no ticket read left');
      }

      return next;
    },
  };
};

const readTickets =
  (harness: Harness) =>
  async (source: TicketSource): Promise<TicketRead> => {
    harness.sources.push(source);

    return harness.read();
  };

beforeEach(() => {
  reads = [];
  now = start;
});

describe('mergeTrackers', () => {
  test('keeps the previous tickets when the next read failed', () => {
    const previous: RepositoryTracker = {
      workspace: 'sqve',
      tickets: { 'ME-1036': ticket('ME-1036') },
      failed: false,
    };

    const next: RepositoryTracker = { workspace: null, tickets: {}, failed: true };

    expect(mergeTrackers(previous, next)).toEqual({
      workspace: null,
      tickets: previous.tickets,
      failed: true,
    });
  });
});

describe('createTrackerScheduler', () => {
  test('keeps the last good tickets when the read fails', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);
    const good = ticket('ME-1036');

    reads = [{ kind: 'read', tickets: [good] }, { kind: 'failed' }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': good },
        failed: false,
      },
    });

    now += 60_000;
    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': good },
        failed: true,
      },
    });
  });

  test('reads once per repository per period', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);

    reads = [
      { kind: 'read', tickets: [ticket('ME-1036')] },
      { kind: 'read', tickets: [ticket('ME-1036')] },
    ];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    now += 59_999;
    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(1);

    now += 1;
    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(2);
  });

  test('reads again when a branch changes', async () => {
    const harness = harnessOf();
    const first = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);

    const second = gitFactsOf([
      'me-1036-title-spaces-with-their-linear-tickets',
      'me-1035-read-what-each-pr-needs',
    ]);

    reads = [
      { kind: 'read', tickets: [ticket('ME-1036')] },
      { kind: 'read', tickets: [ticket('ME-1036'), ticket('ME-1035')] },
    ];

    harness.scheduler.tick(first, readTickets(harness));
    await settle();

    now += 1_000;
    harness.scheduler.tick(second, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(2);
    expect(harness.sources[1]?.ids).toEqual(['ME-1035', 'ME-1036']);
  });

  test('reads the ticket id from a space folder', async () => {
    const harness = harnessOf();

    const git = gitFactsOf(
      ['main'],
      '/code/koja',
      '/code/me-1036-title-spaces-with-their-linear-tickets',
    );

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources[0]?.ids).toEqual(['ME-1036']);
  });

  test('does not read a repository without ticket ids', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['main'], '/code/koja', '/code/koja');

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(0);
    expect(harness.published).toBe(0);
    expect(harness.scheduler.trackers()).toEqual({});
  });

  test('does not start a second read while one is in flight', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);
    const read = pendingRead();

    const runner = async (source: TicketSource): Promise<TicketRead> => {
      harness.sources.push(source);

      return read.promise;
    };

    harness.scheduler.tick(git, runner);
    await settle();
    harness.scheduler.tick(git, runner);
    await settle();

    expect(harness.sources).toHaveLength(1);

    read.resolve({ kind: 'read', tickets: [ticket('ME-1036')] });
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': ticket('ME-1036') },
        failed: false,
      },
    });
  });

  test('records a failed first read with the workspace and no tickets', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);

    reads = [{ kind: 'failed' }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: { workspace: 'sqve', tickets: {}, failed: true },
    });
  });

  test('keeps the seed tickets on a failed read', async () => {
    const seeded: RepositoryTracker = {
      workspace: 'sqve',
      tickets: { 'ME-1036': ticket('ME-1036') },
      failed: false,
    };

    const harness = harnessOf(missingWorkspaceRun, { [repository.key]: seeded });
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);

    expect(harness.scheduler.trackers()).toEqual({ [repository.key]: seeded });

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: null,
        tickets: { 'ME-1036': ticket('ME-1036') },
        failed: true,
      },
    });
  });

  test('records a repository without a workspace as failed', async () => {
    const harness = harnessOf(missingWorkspaceRun);
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: { workspace: null, tickets: {}, failed: true },
    });

    expect(harness.sources).toHaveLength(0);
  });
});
