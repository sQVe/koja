import { beforeEach, describe, expect, test } from 'bun:test';

import type { FolderWatch } from 'herdr';

import { ghStackRecord, severalStacksHeads } from '../../tests/stackFixtures.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { Lease } from './lease.ts';
import type { GitFacts, RepositoryStacks } from './snapshot.ts';

interface SchedulerLike {
  tick: (git: GitFacts, cx: unknown) => void;
  stacks: () => Record<string, RepositoryStacks>;
  stop: () => void;
}

interface Harness {
  scheduler: SchedulerLike;
  files: Map<string, string | null>;
  heads: Map<string, string>;
  published: () => number;
  setHeld: (lease: Lease | null) => void;
  deferredRead: () => (text: string | null) => void;
  fire: (paths: string[]) => Promise<void>;
  tick: () => void;
}

// The path stays in a variable so tsc does not pull the module, and its gpui-kit types, into the
// tests project.
const modulePath = './stackScheduler.ts';

const loaded = (await import(modulePath)) as {
  createStackScheduler: (
    dependencies: {
      run: (
        command: string,
        args: string[],
        options: { cwd?: string; on?: string | null },
      ) => Promise<{
        code: number;
        stdout: string;
        stderr: string;
      }>;
      readTextFile: (path: string) => Promise<string | null>;
      watchFolder: (folder: string) => FolderWatch;
      now: () => number;
      heldLease: () => Lease | null;
      publish: () => void;
    },
    lease: Lease,
    seed?: Record<string, RepositoryStacks>,
  ) => SchedulerLike;
};

const start = 1_800_000_000_000;
const folder = '/code/me-1037-read-each-spaces-stack-from-gh-stack';
const repository = repositoryOf(null, `${folder}/.git`);
const recordPath = `${repository.commonDirectory}/gh-stack`;

const gitFactsOf = (branch: string | null = 'main'): GitFacts => {
  const place = placeOf(null, folder);
  const worktree = worktreeOf(null, folder);

  return {
    places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
    worktrees: {
      [worktree.key]: { repository, root: folder, branch, linked: false },
    },
  };
};

const settle = async (): Promise<void> => {
  for (let index = 0; index < 30; index += 1) {
    await Promise.resolve();
  }
};

let lease: Lease = { version: 1, owner: 'owner-a', generation: 1 };
let held: Lease | null = lease;

const harnessOf = (seed: Record<string, RepositoryStacks> = {}): Harness => {
  const files = new Map<string, string | null>();
  const heads = new Map<string, string>();
  const fires: ((paths: string[]) => void)[] = [];
  let published = 0;
  let deferred: Promise<string | null> | null = null;

  const context = {
    spawn: (body: (cx: unknown) => unknown): void => {
      void body(context);
    },
  };

  const watchFolder = (): FolderWatch => {
    const settled = Promise.withResolvers<string[]>();

    fires.push(settled.resolve);

    return Object.assign(settled.promise, {
      cancel: () => {
        settled.resolve([]);
      },
    });
  };

  const readTextFile = (path: string): Promise<string | null> => {
    if (deferred !== null) {
      return deferred;
    }

    return Promise.resolve(files.get(path) ?? null);
  };

  const run = async (
    command: string,
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    if (command !== 'git' || args[0] !== 'for-each-ref') {
      return { code: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` };
    }

    const lines = [...heads].map(([branch, head]) => `${branch} ${head}`);

    return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
  };

  const scheduler = loaded.createStackScheduler(
    {
      run,
      readTextFile,
      watchFolder,
      now: () => start,
      heldLease: () => held,
      publish: () => {
        published += 1;
      },
    },
    lease,
    seed,
  );

  return {
    scheduler,
    files,
    heads,
    published: () => published,
    setHeld: (next) => {
      held = next;
    },
    deferredRead: () => {
      const settled = Promise.withResolvers<string | null>();

      deferred = settled.promise;

      return (text) => {
        deferred = null;
        settled.resolve(text);
      };
    },
    fire: async (paths) => {
      fires.at(-1)?.(paths);
      await settle();
    },
    tick: () => {
      scheduler.tick(gitFactsOf(), context);
    },
  };
};

beforeEach(() => {
  lease = { version: 1, owner: 'owner-a', generation: 1 };
  held = lease;
});

describe('createStackScheduler', () => {
  test('a parse failure keeps the last good stacks', async () => {
    const harness = harnessOf();

    harness.files.set(recordPath, ghStackRecord('several-stacks'));

    for (const [branch, head] of severalStacksHeads) {
      harness.heads.set(branch, head);
    }

    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]).toEqual({
      stacks: [
        {
          trunk: 'main',
          branches: [
            { branch: 'add-search', pullNumber: null, restack: 'none' },
            { branch: 'add-search-ui', pullNumber: null, restack: 'none' },
            { branch: 'add-search-tests', pullNumber: null, restack: 'none' },
          ],
        },
        {
          trunk: 'main',
          branches: [
            { branch: 'fix-crash', pullNumber: null, restack: 'none' },
            { branch: 'fix-crash-tests', pullNumber: null, restack: 'none' },
          ],
        },
      ],
      failed: false,
    });

    harness.files.set(recordPath, ghStackRecord('truncated'));
    await harness.fire([recordPath]);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.failed).toBe(true);
    expect(harness.scheduler.stacks()[repository.key]?.stacks).toHaveLength(2);
  });

  test('a seeded repository still reads the record once', async () => {
    const seeded: RepositoryStacks = {
      stacks: [{ trunk: 'main', branches: [] }],
      failed: false,
    };

    const harness = harnessOf({ [repository.key]: seeded });

    harness.files.set(recordPath, ghStackRecord('several-stacks'));

    for (const [branch, head] of severalStacksHeads) {
      harness.heads.set(branch, head);
    }

    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.stacks).toHaveLength(2);
  });

  test('a missing record gives no stacks', async () => {
    const harness = harnessOf();

    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]).toEqual({ stacks: [], failed: false });

    harness.files.set(recordPath, ghStackRecord('several-stacks'));
    await harness.fire([recordPath]);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.stacks).toHaveLength(2);

    harness.files.delete(recordPath);
    await harness.fire([recordPath]);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]).toEqual({ stacks: [], failed: false });
  });

  test('a watch event reads the record again', async () => {
    const harness = harnessOf();

    harness.files.set(recordPath, ghStackRecord('several-stacks'));
    harness.heads.set('main', 'fcacf79ff51ea778293a32460b14066356f3318d');
    harness.heads.set('add-search', 'fece9ea9def9521a9b6628daa0cd7ccb4675d598');

    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.stacks[0]?.branches[1]?.restack).toBe(
      'none',
    );

    harness.files.set(recordPath, ghStackRecord('no-base'));
    await harness.fire([`${repository.commonDirectory}/gh-stack`]);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.stacks[0]?.branches[1]?.restack).toBe(
      'unknown',
    );
  });

  test('a read after the lease moved publishes nothing', async () => {
    const harness = harnessOf();

    harness.files.set(recordPath, ghStackRecord('several-stacks'));

    const finish = harness.deferredRead();

    harness.tick();
    await settle();

    expect(harness.published()).toBe(0);

    harness.setHeld({ version: 1, owner: 'owner-b', generation: 2 });
    finish(ghStackRecord('several-stacks'));
    await settle();

    expect(harness.published()).toBe(0);
    expect(harness.scheduler.stacks()).toEqual({});
  });
});
