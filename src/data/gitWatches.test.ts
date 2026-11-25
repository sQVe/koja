import { describe, expect, test } from 'bun:test';

import type { FolderWatch } from 'herdr';

import type { RepositoryIdentity } from './gitIdentity.ts';
import { repositoryOf } from './gitIdentity.ts';

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
  const spawned: Promise<unknown>[] = [];

  const context = {
    spawn: (body: (taskCx: unknown) => unknown): void => {
      spawned.push(Promise.resolve(body(context)));
    },
  };

  return { context, spawned };
};

const settle = async (): Promise<void> => {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

const registryAt = (now: number) => {
  const { watchFolder, fires } = watcher();
  const { context } = contextOf();
  const registry = loaded.createWatchRegistry(watchFolder, () => now);

  registry.start(repository, context);

  const fire = async (paths: string[]): Promise<void> => {
    const resolve = fires.at(-1);

    if (resolve === undefined) {
      throw new Error('no folder watch to fire');
    }

    resolve(paths);
    await settle();
  };

  return { registry, fire };
};

const oneEvent = (at: number): Map<string, number> => new Map([[repository.key, at]]);

describe('createWatchRegistry', () => {
  test('records a remote-ref event for a push path', async () => {
    const { registry, fire } = registryAt(500);

    await fire(['/repo/.git/refs/remotes/origin/b', '/repo/.git/index']);

    expect(registry.takeRemoteRefEvents()).toEqual(oneEvent(500));
    expect(registry.takeEvents()).toEqual(oneEvent(500));
  });

  test('records a remote-ref event for the common directory and its packed refs', async () => {
    const { registry, fire } = registryAt(700);

    await fire(['/repo/.git']);
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
});
