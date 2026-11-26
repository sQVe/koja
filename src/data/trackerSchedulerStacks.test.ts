import { beforeEach, describe, expect, test } from 'bun:test';

import { stacksOf } from '../../tests/stackFixtures.ts';
import type { RunCommand } from './gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { TicketRead, TicketSource } from './linearTickets.ts';
import type { GitFacts, TicketFacts } from './snapshot.ts';
import { createTrackerScheduler } from './trackerScheduler.ts';

interface Harness {
  scheduler: ReturnType<typeof createTrackerScheduler>;
  sources: TicketSource[];
  read: () => TicketRead;
}

const start = 1_800_000_000_000;
const folder = '/code/me-1037-read-each-spaces-stack-from-gh-stack';
const repository = repositoryOf(null, `${folder}/.git`);

const ticket = (id: string, parent: string | null = null): TicketFacts => ({
  id,
  title: `Title of ${id}`,
  state: 'In Progress',
  url: `https://linear.app/sqve/issue/${id}`,
  parent,
});

const gitFactsOf = (branches: readonly string[]): GitFacts => {
  const places: GitFacts['places'] = {};
  const worktrees: GitFacts['worktrees'] = {};

  for (const [index, branch] of branches.entries()) {
    const root = index === 0 ? folder : `${folder}-${index}`;
    const worktree = worktreeOf(null, root);

    places[placeOf(null, root).key] = { kind: 'repository', worktree: worktree.key };

    worktrees[worktree.key] = {
      repository,
      root,
      branch,
      linked: index > 0,
    };
  }

  return { places, worktrees };
};

const settle = async (): Promise<void> => {
  for (let index = 0; index < 30; index += 1) {
    await Promise.resolve();
  }
};

const workspaceRun: RunCommand = async (command) => {
  if (command !== 'cat') {
    return { code: 1, stdout: '', stderr: `unexpected ${command}` };
  }

  return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
};

let reads: TicketRead[] = [];
let now = start;

const harnessOf = (): Harness => {
  const sources: TicketSource[] = [];

  const scheduler = createTrackerScheduler({
    run: workspaceRun,
    now: () => now,
    publish: () => undefined,
  });

  return {
    scheduler,
    sources,
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

describe('createTrackerScheduler stack reads', () => {
  test("ticket reads include stack branches and read tickets' parents", async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1-one']);
    const stacks = stacksOf(repository, ['me-1-one', 'me-2-two']);

    reads = [
      { kind: 'read', tickets: [ticket('ME-1', 'ME-9'), ticket('ME-2', 'ME-9')] },
      {
        kind: 'read',
        tickets: [ticket('ME-1', 'ME-9'), ticket('ME-2', 'ME-9'), ticket('ME-9')],
      },
    ];

    harness.scheduler.tick(git, stacks, readTickets(harness));
    await settle();

    expect(harness.sources[0]?.ids).toEqual(['ME-1', 'ME-2']);

    now += 60_000;
    harness.scheduler.tick(git, stacks, readTickets(harness));
    await settle();

    expect(harness.sources[1]?.ids).toEqual(['ME-1', 'ME-2', 'ME-9']);
  });

  test('a stack that joins the reads reads its branches before the period elapses', async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1-one']);

    reads = [
      { kind: 'read', tickets: [ticket('ME-1')] },
      { kind: 'read', tickets: [ticket('ME-1'), ticket('ME-2')] },
    ];

    harness.scheduler.tick(git, {}, readTickets(harness));
    await settle();

    expect(harness.sources).toHaveLength(1);

    harness.scheduler.tick(
      git,
      stacksOf(repository, ['me-1-one', 'me-2-two']),
      readTickets(harness),
    );

    await settle();

    expect(harness.sources).toHaveLength(2);
    expect(harness.sources[1]?.ids).toEqual(['ME-1', 'ME-2']);
  });

  test("a parent's parent is not read", async () => {
    const harness = harnessOf();
    const git = gitFactsOf(['me-1-one']);
    const stacks = stacksOf(repository, ['me-1-one', 'me-2-two']);

    reads = [
      { kind: 'read', tickets: [ticket('ME-1', 'ME-9'), ticket('ME-2', 'ME-9')] },
      {
        kind: 'read',
        tickets: [ticket('ME-1', 'ME-9'), ticket('ME-2', 'ME-9'), ticket('ME-9', 'ME-0')],
      },
      {
        kind: 'read',
        tickets: [ticket('ME-1', 'ME-9'), ticket('ME-2', 'ME-9'), ticket('ME-9', 'ME-0')],
      },
    ];

    harness.scheduler.tick(git, stacks, readTickets(harness));
    await settle();

    now += 60_000;
    harness.scheduler.tick(git, stacks, readTickets(harness));
    await settle();

    now += 60_000;
    harness.scheduler.tick(git, stacks, readTickets(harness));
    await settle();

    expect(harness.sources[2]?.ids).toEqual(['ME-1', 'ME-2', 'ME-9']);
  });
});
