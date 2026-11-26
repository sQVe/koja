import { describe, expect, test } from 'bun:test';

import type { FolderWatch } from 'herdr';

import type { RepositoryIdentity } from './gitIdentity.ts';
import { repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { WorktreeGit } from './snapshot.ts';

interface Registry {
  start: (repository: RepositoryIdentity, cx: unknown) => void;
  takeEvents: () => Map<string, number>;
  takeRemoteRefEvents: () => Map<string, number>;
}

// The path stays in a variable so tsc does not pull the module, and its gpui-kit types, into the
// tests project.
const modulePath = './gitWatches.ts';

const loaded = (await import(modulePath)) as {
  createWatchRegistry: (watchFolder: () => FolderWatch, now: () => number) => Registry;
  checkoutWorktrees: (worktrees: Record<string, WorktreeGit>) => Set<string>;
};

const repository = repositoryOf(null, '/repo/.git');

const watcher = () => {
  const fires: ((paths: string[]) => void)[] = [];

  const watchFolder = (): FolderWatch => {
    const settled = Promise.withResolvers<string[]>();

    fires.push(settled.resolve);

    return Object.assign(settled.promise, {
      cancel: () => {
        settled.resolve([]);
      },
    });
  };

  return { watchFolder, fires };
};

const contextOf = () => {
  const context = {
    spawn: (body: (taskCx: unknown) => unknown): void => {
      void body(context);
    },
  };

  return context;
};

const settle = async (): Promise<void> => {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

// Each read of the clock advances it by `advancePerRead`, so a second read inside one folder change
// returns a later time.
const registryAt = (start: number, advancePerRead = 0) => {
  const { watchFolder, fires } = watcher();
  const context = contextOf();
  let current = start;

  const clock = (): number => {
    const at = current;

    current += advancePerRead;

    return at;
  };

  const registry = loaded.createWatchRegistry(watchFolder, clock);

  registry.start(repository, context);

  const fire = async (paths: string[]): Promise<void> => {
    const resolve = fires.at(-1);

    if (resolve === undefined) {
      throw new Error('no folder watch to fire');
    }

    resolve(paths);
    await settle();
  };

  const setNow = (value: number): void => {
    current = value;
  };

  return { registry, fire, setNow };
};

const oneEvent = (at: number): Map<string, number> => new Map([[repository.key, at]]);

describe('createWatchRegistry', () => {
  test('records a remote-ref event for a push path', async () => {
    const { registry, fire } = registryAt(500);

    await fire(['/repo/.git/refs/remotes/origin/b', '/repo/.git/index']);

    expect(registry.takeRemoteRefEvents()).toEqual(oneEvent(500));
    expect(registry.takeEvents()).toEqual(oneEvent(500));
  });

  test('records a remote-ref event for the common directory', async () => {
    const { registry, fire } = registryAt(700);

    await fire(['/repo/.git']);

    expect(registry.takeRemoteRefEvents()).toEqual(oneEvent(700));
  });

  test('records a remote-ref event for packed refs', async () => {
    const { registry, fire } = registryAt(700);

    await fire(['/repo/.git/packed-refs']);

    expect(registry.takeRemoteRefEvents()).toEqual(oneEvent(700));
  });

  test('records no remote-ref event for an index change alone', async () => {
    const { registry, fire } = registryAt(900);

    await fire(['/repo/.git/index']);

    expect(registry.takeRemoteRefEvents()).toEqual(new Map());
    expect(registry.takeEvents()).toEqual(oneEvent(900));
  });

  test('records no remote-ref event for a worktree folder outside the common directory', async () => {
    const { registry, fire } = registryAt(1100);

    await fire(['/repo/refs/remotes/origin/b']);

    expect(registry.takeRemoteRefEvents()).toEqual(new Map());
  });

  test('keeps the earliest time across folder changes', async () => {
    const { registry, fire, setNow } = registryAt(500);

    await fire(['/repo/.git/index']);

    setNow(700);
    await fire(['/repo/.git/index']);

    expect(registry.takeEvents()).toEqual(oneEvent(500));
  });

  test('keeps the earliest remote-ref time across folder changes', async () => {
    const { registry, fire, setNow } = registryAt(500);

    await fire(['/repo/.git/refs/remotes/origin/b']);

    setNow(700);
    await fire(['/repo/.git/refs/remotes/origin/b']);

    expect(registry.takeRemoteRefEvents()).toEqual(oneEvent(500));
  });

  test('records one time for both event lists of a folder change', async () => {
    const { registry, fire } = registryAt(500, 100);

    await fire(['/repo/.git/refs/remotes/origin/b']);

    expect(registry.takeEvents()).toEqual(oneEvent(500));
    expect(registry.takeRemoteRefEvents()).toEqual(oneEvent(500));
  });
});

const worktreeAt = (
  root: string,
  commonDirectory: string,
  fields: Partial<WorktreeGit> = {},
): WorktreeGit => ({
  repository: repositoryOf(null, commonDirectory),
  root,
  branch: 'main',
  linked: false,
  bare: false,
  ...fields,
});

describe('checkoutWorktrees', () => {
  test('leaves out a bare place in the .bare layout and keeps its linked worktree', () => {
    const bare = worktreeAt('/code/project', '/code/project/.bare', { bare: true });
    const linked = worktreeAt('/code/project/me-1', '/code/project/.bare', { linked: true });

    const worktrees = {
      [worktreeOf(null, '/code/project').key]: bare,
      [worktreeOf(null, '/code/project/me-1').key]: linked,
    };

    expect(loaded.checkoutWorktrees(worktrees)).toEqual(
      new Set([worktreeOf(null, '/code/project/me-1').key]),
    );
  });

  test('keeps a main worktree whose git folder sits outside the checkout', () => {
    const checkout = worktreeAt('/code/checkout', '/code/elsewhere.git');
    const worktrees = { [worktreeOf(null, '/code/checkout').key]: checkout };

    expect(loaded.checkoutWorktrees(worktrees)).toEqual(
      new Set([worktreeOf(null, '/code/checkout').key]),
    );
  });
});
