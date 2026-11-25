import { beforeEach, describe, expect, test } from 'bun:test';

import { rowTitleOf } from '../mods/koja-spaces/rows.ts';
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

interface Checkout {
  root: string;
  branch: string | null;
  linked: boolean;
  placeFolder?: string;
  shown?: boolean;
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

const gitFactsOfCheckouts = (checkouts: Checkout[]): GitFacts => {
  const places: GitFacts['places'] = {};
  const worktrees: GitFacts['worktrees'] = {};

  for (const checkout of checkouts) {
    const place = placeOf(null, checkout.placeFolder ?? checkout.root);
    const worktree = worktreeOf(null, checkout.root);

    if (checkout.shown !== false) {
      places[place.key] = { kind: 'repository', worktree: worktree.key };
    }

    worktrees[worktree.key] = {
      repository,
      root: checkout.root,
      branch: checkout.branch,
      linked: checkout.linked,
    };
  }

  return { places, worktrees };
};

const gitFactsOf = (
  branches: (string | null)[],
  firstRoot: string = folder,
  firstPlace: string = firstRoot,
): GitFacts =>
  gitFactsOfCheckouts(
    branches.map((branch, index) => ({
      root: index === 0 ? firstRoot : `${folder}-${index}`,
      branch,
      linked: index > 0,
      ...(index === 0 ? { placeFolder: firstPlace } : {}),
    })),
  );

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

  test('reads again when a branch changes and the count stays the same', async () => {
    const harness = harnessOf();
    const first = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets'], '/code/koja');
    const second = gitFactsOf(['me-1035-read-what-each-pr-needs'], '/code/koja');

    reads = [
      { kind: 'read', tickets: [ticket('ME-1036')] },
      { kind: 'read', tickets: [ticket('ME-1035')] },
    ];

    harness.scheduler.tick(first, readTickets(harness));
    await settle();

    now += 1_000;
    harness.scheduler.tick(second, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(2);
    expect(harness.sources[1]?.ids).toEqual(['ME-1035']);
  });

  test('does not ask for the folder id when the branch names a ticket', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1035-read-what-each-pr-needs']);

    reads = [{ kind: 'read', tickets: [ticket('ME-1035')] }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources[0]?.ids).toEqual(['ME-1035']);
  });

  test('does not publish a read that completes after stop', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);
    const read = pendingRead();

    const runner = async (source: TicketSource): Promise<TicketRead> => {
      harness.sources.push(source);

      return read.promise;
    };

    harness.scheduler.tick(git, runner);
    await settle();

    harness.scheduler.stop();
    read.resolve({ kind: 'read', tickets: [ticket('ME-1036')] });
    await settle();

    expect(harness.published).toBe(0);
    expect(harness.scheduler.trackers()).toEqual({});
  });

  test('does not publish a dropped read and reads again when due', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);

    reads = [{ kind: 'dropped' }, { kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.published).toBe(0);
    expect(harness.scheduler.trackers()).toEqual({});

    now += 60_000;
    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(2);
    expect(harness.published).toBe(1);

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': ticket('ME-1036') },
        failed: false,
      },
    });
  });

  test('reads the config from the main checkout when a linked worktree sorts first', async () => {
    const mainRoot = '/code/koja';
    const linkedRoot = '/code/aaa-feature';

    const run: RunCommand = async (command, args) => {
      const configPath = `${mainRoot}/.linear.toml`;

      if (command !== 'cat' || args[0] !== configPath) {
        return { code: 1, stdout: '', stderr: `no config at ${args.join(' ')}` };
      }

      return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
    };

    const harness = harnessOf(run);

    const git = gitFactsOfCheckouts([
      { root: mainRoot, branch: 'main', linked: false },
      { root: linkedRoot, branch: 'me-1036-title-spaces-with-their-linear-tickets', linked: true },
    ]);

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': ticket('ME-1036') },
        failed: false,
      },
    });

    expect(harness.sources).toHaveLength(1);
  });

  test('reads the config from a linked worktree when the repository has no main checkout', async () => {
    const linkedRoot = '/code/feature';

    const run: RunCommand = async (command, args) => {
      const configPath = `${linkedRoot}/.linear.toml`;

      if (command !== 'cat' || args[0] !== configPath) {
        return { code: 1, stdout: '', stderr: `no config at ${args.join(' ')}` };
      }

      return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
    };

    const harness = harnessOf(run);

    const git = gitFactsOfCheckouts([
      { root: linkedRoot, branch: 'me-1036-title-spaces-with-their-linear-tickets', linked: true },
    ]);

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': ticket('ME-1036') },
        failed: false,
      },
    });
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
    const git = gitFactsOfCheckouts([{ root: folder, branch: 'main', linked: false }]);

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources[0]?.ids).toEqual(['ME-1036']);
  });

  test('does not ask for a place folder id the row does not look up', async () => {
    const harness = harnessOf();

    const git = gitFactsOfCheckouts([
      { root: '/code/koja', branch: 'main', linked: false, placeFolder: folder },
    ]);

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(0);
  });

  test('does not ask for a worktree no space shows', async () => {
    const harness = harnessOf();

    const git = gitFactsOfCheckouts([
      { root: '/code/koja', branch: 'main', linked: false },
      { root: '/code/me-9999-gone', branch: 'me-9999-gone', linked: true, shown: false },
    ]);

    harness.scheduler.tick(git, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(0);
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

    const title = harness.scheduler.trackers()[repository.key]?.tickets['ME-1036']?.title ?? null;
    const spaceName = 'me-1036-title-spaces-with-their-linear-tickets';

    expect(rowTitleOf(false, spaceName, null, title)).toBe(spaceName);
  });
});
