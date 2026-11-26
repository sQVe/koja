import { beforeEach, describe, expect, test } from 'bun:test';

import { rowTitleOf } from '../mods/koja-spaces/rows.ts';
import type { RepositoryIdentity, RunCommand } from './gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { TicketRead, TicketSource } from './linearTickets.ts';
import { readTickets as readLinearTickets } from './linearTickets.ts';
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
  repository?: RepositoryIdentity;
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
});

const ticketNode = (id: string): Record<string, unknown> => ({
  identifier: id,
  title: `Title of ${id}`,
  state: { name: 'In Progress' },
  url: `https://linear.app/sqve/issue/${id}`,
  parent: null,
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
      repository: checkout.repository ?? repository,
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

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': good },
        failed: false,
      },
    });

    now += 60_000;
    harness.scheduler.tick(git, {}, readTickets(harness));
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

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    now += 59_999;
    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(1);

    now += 1;
    harness.scheduler.tick(git, {}, readTickets(harness));
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

    harness.scheduler.tick(first, {}, readTickets(harness));
    await settle();

    now += 1_000;
    harness.scheduler.tick(second, {}, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(2);
    expect(harness.sources[1]?.ids).toEqual(['ME-1035']);
  });

  test('does not ask for the folder id when the branch names a ticket', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1035-read-what-each-pr-needs']);

    reads = [{ kind: 'read', tickets: [ticket('ME-1035')] }];

    harness.scheduler.tick(git, {}, readTickets(harness));
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

    harness.scheduler.tick(git, {}, runner);
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

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.published).toBe(0);
    expect(harness.scheduler.trackers()).toEqual({});

    now += 60_000;
    harness.scheduler.tick(git, {}, readTickets(harness));
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

    harness.scheduler.tick(git, {}, readTickets(harness));
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

  test('reads the config from a checkout and not from a bare repository', async () => {
    const bareRoot = '/code/a.git';
    const checkoutRoot = '/code/z-checkout';
    const bareRepository = repositoryOf(null, bareRoot);
    const barePlace = placeOf(null, bareRoot);
    const checkoutPlace = placeOf(null, checkoutRoot);
    const bareWorktree = worktreeOf(null, bareRoot);
    const checkoutWorktree = worktreeOf(null, checkoutRoot);

    const git: GitFacts = {
      places: {
        [barePlace.key]: { kind: 'repository', worktree: bareWorktree.key },
        [checkoutPlace.key]: { kind: 'repository', worktree: checkoutWorktree.key },
      },
      worktrees: {
        [bareWorktree.key]: {
          repository: bareRepository,
          root: bareRoot,
          branch: 'main',
          linked: false,
        },
        [checkoutWorktree.key]: {
          repository: bareRepository,
          root: checkoutRoot,
          branch: 'me-1036-title-spaces-with-their-linear-tickets',
          linked: true,
        },
      },
    };

    const configPaths: string[] = [];

    const run: RunCommand = async (command, args) => {
      if (command !== 'cat') {
        return { code: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` };
      }

      configPaths.push(args[0] ?? '');

      return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
    };

    const harness = harnessOf(run);

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(configPaths).toEqual([`${checkoutRoot}/.linear.toml`]);
    expect(harness.scheduler.trackers()[bareRepository.key]?.failed).toBe(false);
  });

  test('reads the checkout config when git worktree list starts with a bare block', async () => {
    const bareRoot = '/code/a.git';
    const checkoutRoot = '/code/z-checkout';
    const bareRepository = repositoryOf(null, `${bareRoot}/`);

    const porcelain = [
      `worktree ${bareRoot}`,
      'bare',
      '',
      `worktree ${checkoutRoot}`,
      'HEAD 2222222',
      'branch refs/heads/me-1036-title-spaces-with-their-linear-tickets',
      '',
    ].join('\n');

    const gitCwds: string[] = [];
    const configPaths: string[] = [];

    const run: RunCommand = async (command, args, options) => {
      if (command === 'git' && args.join(' ') === 'worktree list --porcelain') {
        gitCwds.push(options.cwd);

        return { code: 0, stdout: porcelain, stderr: '' };
      }

      if (command === 'cat') {
        configPaths.push(args[0] ?? '');

        return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
      }

      return { code: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` };
    };

    const harness = harnessOf(run);

    const git = gitFactsOfCheckouts([
      { root: bareRoot, branch: 'main', linked: false, repository: bareRepository },
      {
        root: checkoutRoot,
        branch: 'me-1036-title-spaces-with-their-linear-tickets',
        linked: true,
        repository: bareRepository,
      },
    ]);

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(gitCwds).toEqual([bareRoot]);
    expect(configPaths).toEqual([`${checkoutRoot}/.linear.toml`]);
    expect(harness.scheduler.trackers()[bareRepository.key]?.failed).toBe(false);
  });

  test('fails without reading a config when the only worktree is bare', async () => {
    const bareRoot = '/code/a.git';
    const bareRepository = repositoryOf(null, `${bareRoot}/`);
    const previous = ticket('ME-1036');

    const seeded: RepositoryTracker = {
      workspace: 'sqve',
      tickets: { 'ME-1036': previous },
      failed: false,
    };

    const porcelain = [`worktree ${bareRoot}`, 'bare', ''].join('\n');
    const configPaths: string[] = [];

    const run: RunCommand = async (command, args) => {
      if (command === 'git' && args.join(' ') === 'worktree list --porcelain') {
        return { code: 0, stdout: porcelain, stderr: '' };
      }

      if (command === 'cat') {
        configPaths.push(args[0] ?? '');

        return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
      }

      return { code: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` };
    };

    const harness = harnessOf(run, { [bareRepository.key]: seeded });

    const git = gitFactsOfCheckouts([
      {
        root: bareRoot,
        branch: 'me-1036-title-spaces-with-their-linear-tickets',
        linked: false,
        repository: bareRepository,
      },
    ]);

    reads = [{ kind: 'read', tickets: [ticket('ME-9999')] }];

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(configPaths).toEqual([]);
    expect(harness.sources).toEqual([]);

    expect(harness.scheduler.trackers()).toEqual({
      [bareRepository.key]: {
        workspace: null,
        tickets: { 'ME-1036': previous },
        failed: true,
      },
    });
  });

  test('keeps the last good titles when Linear answers a service error', async () => {
    const seeded: RepositoryTracker = {
      workspace: 'sqve',
      tickets: { 'ME-1035': ticket('ME-1035'), 'ME-1036': ticket('ME-1036') },
      failed: false,
    };

    let linearCalls = 0;

    const run: RunCommand = async (command, args) => {
      if (command === 'cat') {
        return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
      }

      if (command !== 'linear') {
        return { code: 1, stdout: '', stderr: `unexpected ${command}` };
      }

      linearCalls += 1;

      if (linearCalls !== 2) {
        const body = JSON.stringify({ errors: [{ message: 'Service unavailable' }], data: null });

        return { code: 3, stdout: body, stderr: '' };
      }

      const id = args
        .filter((argument) => /^id\d+=/.test(argument))
        .map((argument) => argument.slice(argument.indexOf('=') + 1))[0];

      const data = { ticket0: ticketNode(id ?? 'ME-1036') };

      return { code: 0, stdout: JSON.stringify({ data }), stderr: '' };
    };

    const harness = harnessOf(run, { [repository.key]: seeded });

    const git = gitFactsOf([
      'me-1035-read-what-each-pr-needs',
      'me-1036-title-spaces-with-their-linear-tickets',
    ]);

    harness.scheduler.tick(git, {}, (source) => readLinearTickets(run, source, () => true));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1035': ticket('ME-1035'), 'ME-1036': ticket('ME-1036') },
        failed: true,
      },
    });

    expect(linearCalls).toBe(1);
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

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': ticket('ME-1036') },
        failed: false,
      },
    });
  });

  test('discovers the main checkout when Git facts hold only a linked worktree', async () => {
    const mainRoot = '/code/koja';
    const linkedRoot = '/code/feature';

    const porcelain = [
      `worktree ${mainRoot}`,
      'HEAD 1111111',
      'branch refs/heads/main',
      '',
      `worktree ${linkedRoot}`,
      'HEAD 2222222',
      'branch refs/heads/me-1036-title-spaces-with-their-linear-tickets',
      '',
    ].join('\n');

    const gitCwds: string[] = [];

    const run: RunCommand = async (command, args, options) => {
      if (command === 'git' && args.join(' ') === 'worktree list --porcelain') {
        gitCwds.push(options.cwd);

        return { code: 0, stdout: porcelain, stderr: '' };
      }

      if (command === 'cat' && args[0] === `${mainRoot}/.linear.toml`) {
        return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
      }

      return { code: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` };
    };

    const harness = harnessOf(run);

    const git = gitFactsOfCheckouts([
      { root: linkedRoot, branch: 'me-1036-title-spaces-with-their-linear-tickets', linked: true },
    ]);

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.scheduler.trackers()).toEqual({
      [repository.key]: {
        workspace: 'sqve',
        tickets: { 'ME-1036': ticket('ME-1036') },
        failed: false,
      },
    });

    expect(gitCwds).toEqual([linkedRoot]);
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

    harness.scheduler.tick(first, {}, readTickets(harness));
    await settle();

    now += 1_000;
    harness.scheduler.tick(second, {}, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(2);
    expect(harness.sources[1]?.ids).toEqual(['ME-1035', 'ME-1036']);
  });

  test('reads the ticket id from a space folder', async () => {
    const harness = harnessOf();
    const git = gitFactsOfCheckouts([{ root: folder, branch: 'main', linked: false }]);

    reads = [{ kind: 'read', tickets: [ticket('ME-1036')] }];

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.sources[0]?.ids).toEqual(['ME-1036']);
  });

  test('does not ask for a place folder id the row does not look up', async () => {
    const harness = harnessOf();

    const git = gitFactsOfCheckouts([
      { root: '/code/koja', branch: 'main', linked: false, placeFolder: folder },
    ]);

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(0);
  });

  test('does not ask for a worktree no space shows', async () => {
    const harness = harnessOf();

    const git = gitFactsOfCheckouts([
      { root: '/code/koja', branch: 'main', linked: false },
      { root: '/code/me-9999-gone', branch: 'me-9999-gone', linked: true, shown: false },
    ]);

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(0);
  });

  test('does not read a repository without ticket ids', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['main'], '/code/koja', '/code/koja');

    harness.scheduler.tick(git, {}, readTickets(harness));
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

    harness.scheduler.tick(git, {}, runner);
    await settle();
    harness.scheduler.tick(git, {}, runner);
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

  test('starts at most two tracker reads at once', async () => {
    const harness = harnessOf();

    const git = gitFactsOfCheckouts([
      {
        root: '/code/a',
        branch: 'me-1-a',
        linked: false,
        repository: repositoryOf(null, '/code/a/.git'),
      },
      {
        root: '/code/b',
        branch: 'me-2-b',
        linked: false,
        repository: repositoryOf(null, '/code/b/.git'),
      },
      {
        root: '/code/c',
        branch: 'me-3-c',
        linked: false,
        repository: repositoryOf(null, '/code/c/.git'),
      },
    ]);

    const pending = [pendingRead(), pendingRead(), pendingRead()];
    let readIndex = 0;

    const runner = async (source: TicketSource): Promise<TicketRead> => {
      harness.sources.push(source);

      const read = pending[readIndex];

      readIndex += 1;

      if (read === undefined) {
        throw new Error('unexpected read');
      }

      return read.promise;
    };

    harness.scheduler.tick(git, {}, runner);
    await settle();

    expect(harness.sources).toHaveLength(2);

    harness.scheduler.tick(git, {}, runner);
    await settle();

    expect(harness.sources).toHaveLength(2);

    pending[0]?.resolve({ kind: 'read', tickets: [ticket('ME-1')] });
    await settle();

    harness.scheduler.tick(git, {}, runner);
    await settle();

    expect(harness.sources).toHaveLength(3);

    pending[1]?.resolve({ kind: 'read', tickets: [ticket('ME-2')] });
    pending[2]?.resolve({ kind: 'read', tickets: [ticket('ME-3')] });
    await settle();
  });

  test('reads the repositories read longest ago before the others', async () => {
    const harness = harnessOf();

    const git = gitFactsOfCheckouts([
      {
        root: '/code/a',
        branch: 'me-1-a',
        linked: false,
        repository: repositoryOf(null, '/code/a/.git'),
      },
      {
        root: '/code/b',
        branch: 'me-2-b',
        linked: false,
        repository: repositoryOf(null, '/code/b/.git'),
      },
      {
        root: '/code/c',
        branch: 'me-3-c',
        linked: false,
        repository: repositoryOf(null, '/code/c/.git'),
      },
    ]);

    reads = [
      { kind: 'read', tickets: [ticket('ME-1')] },
      { kind: 'read', tickets: [ticket('ME-2')] },
      { kind: 'read', tickets: [ticket('ME-3')] },
      { kind: 'read', tickets: [ticket('ME-1')] },
    ];

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    now += 60_000;
    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.sources.map((source) => source.cwd)).toEqual([
      '/code/a',
      '/code/b',
      '/code/c',
      '/code/a',
    ]);
  });

  test('keeps a successful read when publish throws', async () => {
    let published = 0;

    const scheduler = createTrackerScheduler({
      run: workspaceRun(),
      now: () => now,
      publish: () => {
        published += 1;

        if (published === 1) {
          throw new Error('publish failed');
        }
      },
    });

    const git = gitFactsOf(['me-1036-title-spaces-with-their-linear-tickets']);

    const runner = async (): Promise<TicketRead> => ({
      kind: 'read',
      tickets: [ticket('ME-1036')],
    });

    scheduler.tick(git, {}, runner);
    await settle();

    expect(published).toBe(1);

    expect(scheduler.trackers()).toEqual({
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

    harness.scheduler.tick(git, {}, readTickets(harness));
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

    harness.scheduler.tick(git, {}, readTickets(harness));
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

    harness.scheduler.tick(git, {}, readTickets(harness));
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
