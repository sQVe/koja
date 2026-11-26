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
  failRead: boolean;
  failHeads: boolean;
  published: () => number;
  reads: () => number;
  setHeld: (lease: Lease | null) => void;
  advance: (milliseconds: number) => void;
  holdReads: () => void;
  release: () => Promise<void>;
  deferredRead: () => (text: string | null) => void;
  fire: (paths: string[]) => Promise<void>;
  tick: (folders?: string[]) => void;
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
      readTextFile: (path: string, options: { on: string | null }) => Promise<string | null>;
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

// Mirrors the scheduler's debounce.
const debounce = 250;

const recordPathOf = (folderName: string): string =>
  `${repositoryOf(null, `${folderName}/.git`).commonDirectory}/gh-stack`;

const gitFactsOf = (folders: string[] = [folder]): GitFacts => {
  const places: GitFacts['places'] = {};
  const worktrees: GitFacts['worktrees'] = {};

  for (const folderName of folders) {
    const place = placeOf(null, folderName);
    const worktree = worktreeOf(null, folderName);

    places[place.key] = { kind: 'repository', worktree: worktree.key };

    worktrees[worktree.key] = {
      repository: repositoryOf(null, `${folderName}/.git`),
      root: folderName,
      branch: 'main',
      linked: false,
    };
  }

  return { places, worktrees };
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
  const pendingReads: { path: string; settle: (text: string | null) => void }[] = [];
  let published = 0;
  let reads = 0;
  let holding = false;
  let deferred: Promise<string | null> | null = null;
  let now = start;

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

  const harness: Harness = {
    scheduler: undefined as unknown as SchedulerLike,
    files,
    heads,
    failRead: false,
    failHeads: false,
    published: () => published,
    reads: () => reads,
    setHeld: (next) => {
      held = next;
    },
    advance: (milliseconds) => {
      now += milliseconds;
    },
    holdReads: () => {
      holding = true;
    },
    release: async () => {
      const first = pendingReads.shift();

      first?.settle(files.get(first.path) ?? null);
      await settle();
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
    tick: (folders) => {
      harness.scheduler.tick(gitFactsOf(folders), context);
    },
  };

  const readTextFile = (path: string): Promise<string | null> => {
    reads += 1;

    if (deferred !== null) {
      return deferred;
    }

    if (harness.failRead) {
      return Promise.reject(new Error('the read failed'));
    }

    if (holding) {
      const settled = Promise.withResolvers<string | null>();

      pendingReads.push({ path, settle: settled.resolve });

      return settled.promise;
    }

    return Promise.resolve(files.get(path) ?? null);
  };

  const run = async (
    command: string,
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    if (command !== 'git' || args[0] !== 'for-each-ref' || harness.failHeads) {
      return { code: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` };
    }

    const lines = [...heads].map(([branch, head]) => `${branch} ${head}`);

    return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
  };

  harness.scheduler = loaded.createStackScheduler(
    {
      run,
      readTextFile,
      watchFolder,
      now: () => now,
      heldLease: () => held,
      publish: () => {
        published += 1;
      },
    },
    lease,
    seed,
  );

  return harness;
};

const recordHarness = (seed: Record<string, RepositoryStacks> = {}): Harness => {
  const harness = harnessOf(seed);

  harness.files.set(recordPath, ghStackRecord('several-stacks'));

  for (const [branch, head] of severalStacksHeads) {
    harness.heads.set(branch, head);
  }

  return harness;
};

beforeEach(() => {
  lease = { version: 1, owner: 'owner-a', generation: 1 };
  held = lease;
});

describe('createStackScheduler', () => {
  test('a parse failure keeps the last good stacks', async () => {
    const harness = recordHarness();

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
    harness.advance(debounce);
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

    const harness = recordHarness({ [repository.key]: seeded });

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
    harness.advance(debounce);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.stacks).toHaveLength(2);

    harness.files.delete(recordPath);
    await harness.fire([recordPath]);
    harness.advance(debounce);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]).toEqual({ stacks: [], failed: false });
  });

  test('a watch event reads the record again', async () => {
    const harness = recordHarness();

    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.stacks[0]?.branches[1]?.restack).toBe(
      'none',
    );

    harness.files.set(recordPath, ghStackRecord('no-base'));
    await harness.fire([recordPath]);
    harness.advance(debounce);
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
  });

  test('a read that rejects keeps the last good stacks', async () => {
    const harness = recordHarness();

    harness.tick();
    await settle();

    harness.failRead = true;
    await harness.fire([recordPath]);
    harness.advance(debounce);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.failed).toBe(true);
    expect(harness.scheduler.stacks()[repository.key]?.stacks).toHaveLength(2);
  });

  test('a branch heads failure keeps the last good stacks', async () => {
    const harness = recordHarness();

    harness.tick();
    await settle();

    harness.failHeads = true;
    await harness.fire([recordPath]);
    harness.advance(debounce);
    harness.tick();
    await settle();

    expect(harness.scheduler.stacks()[repository.key]?.failed).toBe(true);
    expect(harness.scheduler.stacks()[repository.key]?.stacks).toHaveLength(2);
  });

  test('a successful read publishes once and repeated ticks do not read again', async () => {
    const harness = recordHarness();

    harness.tick();
    await settle();

    expect(harness.published()).toBe(1);
    expect(harness.reads()).toBe(1);

    harness.tick();
    await settle();

    expect(harness.reads()).toBe(1);
  });

  test('a burst of watch events gives one read', async () => {
    const harness = recordHarness();

    harness.tick();
    await settle();

    await harness.fire([recordPath]);
    await harness.fire([recordPath]);
    await harness.fire([recordPath]);

    harness.tick();
    await settle();

    expect(harness.reads()).toBe(1);

    harness.advance(debounce);
    harness.tick();
    await settle();

    expect(harness.reads()).toBe(2);
  });

  test('at most two stack reads run at once', async () => {
    const folders = ['/code/first', '/code/second', '/code/third'];
    const harness = harnessOf();

    for (const folderName of folders) {
      harness.files.set(recordPathOf(folderName), ghStackRecord('several-stacks'));
    }

    for (const [branch, head] of severalStacksHeads) {
      harness.heads.set(branch, head);
    }

    harness.holdReads();
    harness.tick(folders);
    await settle();

    expect(harness.reads()).toBe(2);

    await harness.release();
    harness.tick(folders);
    await settle();

    expect(harness.reads()).toBe(3);
  });
});
