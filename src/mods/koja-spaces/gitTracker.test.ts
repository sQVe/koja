import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

interface GitLike {
  branch: string | null;
  repo: { machine: string | null; commonDirectory: string; key: string };
  root: string;
  cwd: string;
  linked: boolean;
}

interface PlaceLike {
  machine: string | null;
  folder: string;
  key: string;
}

interface GitTrackerLike {
  lookup: (key: string) => GitLike | null | undefined;
  refresh: (places: PlaceLike[], cx: unknown) => void;
}

interface FolderGit {
  layout: string;
  top?: string;
  branch?: string;
}

const ok = { code: 0, stdout: '', stderr: '' };

let folders: Record<string, FolderGit> = {};
let failure: string | null = null;

const answer = (args: string[], cwd: string): ExecResult => {
  const folder = folders[cwd];

  if (failure !== null) {
    return { code: 128, stdout: '', stderr: failure };
  }

  if (folder === undefined) {
    return { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
  }

  if (args.includes('--is-bare-repository')) {
    return { ...ok, stdout: folder.layout };
  }

  if (args.includes('--show-toplevel')) {
    return { ...ok, stdout: `${folder.top ?? cwd}\n` };
  }

  if (args[0] === 'symbolic-ref') {
    return folder.branch === undefined ? { ...ok, code: 1 } : { ...ok, stdout: folder.branch };
  }

  return ok;
};

await mock.module('herdr', () =>
  herdrFake({
    exec: async (_command: string, args: string[], options: { cwd: string }) =>
      answer(args, options.cwd),
    watchFolder: () => new Promise<string[]>(() => {}),
  }),
);

await mock.module('../../kit/index.ts', () => kitIndexFake());

const modulePath = './gitTracker.ts';
const loaded = (await import(modulePath)) as { GitTracker: new () => GitTrackerLike };

const spawned: Promise<void>[] = [];

const context = {
  spawn: (body: (cx: unknown) => Promise<void>) => {
    spawned.push(body(context));
  },
  notify: () => undefined,
};

const placeAt = (folder: string): PlaceLike => ({
  machine: null,
  folder,
  key: JSON.stringify([null, folder]),
});

const read = async (tracker: GitTrackerLike, folder: string): Promise<GitLike | null> => {
  const place = placeAt(folder);

  const first = spawned.length;

  tracker.refresh([place], context);

  // Only the refresh is awaited; a repository watch it starts never ends here.
  await spawned[first];

  return tracker.lookup(place.key) ?? null;
};

const mainCheckout: FolderGit = {
  layout: 'false\nfalse\n/code/koja/.git\n/code/koja/.git\n',
  top: '/code/koja',
  branch: 'main\n',
};

afterEach(() => {
  folders = {};
  failure = null;
});

afterAll(() => {
  mock.restore();
});

describe('GitTracker', () => {
  test('reads a folder in a main checkout as its repository, top, and branch', async () => {
    folders = { '/code/koja/src': mainCheckout };

    const info = await read(new loaded.GitTracker(), '/code/koja/src');

    expect(info).toEqual({
      branch: 'main',
      repo: {
        machine: null,
        commonDirectory: '/code/koja/.git',
        key: JSON.stringify([null, '/code/koja/.git']),
      },
      root: '/code/koja',
      cwd: '/code/koja/src',
      linked: false,
    });
  });

  test('marks a linked worktree as linked under the shared repository', async () => {
    folders = {
      '/code/koja-feature': {
        layout: 'false\nfalse\n/code/koja/.git/worktrees/feature\n/code/koja/.git\n',
        branch: 'feature\n',
      },
    };

    const info = await read(new loaded.GitTracker(), '/code/koja-feature');

    expect(info?.linked).toBe(true);
    expect(info?.repo.commonDirectory).toBe('/code/koja/.git');
    expect(info?.root).toBe('/code/koja-feature');
  });

  test('lets a bare repository stand in for the main checkout at its folder', async () => {
    folders = {
      '/code/tau.git': { layout: 'true\nfalse\n/code/tau.git\n/code/tau.git\n', branch: 'main\n' },
    };

    const info = await read(new loaded.GitTracker(), '/code/tau.git');

    expect(info).toMatchObject({ branch: 'main', root: '/code/tau.git', linked: false });
  });

  test('gives a detached HEAD no branch', async () => {
    folders = { '/code/koja': { layout: mainCheckout.layout, top: '/code/koja' } };

    const info = await read(new loaded.GitTracker(), '/code/koja');

    expect(info?.branch).toBeNull();
  });

  test('keeps the last known repository when a later read fails', async () => {
    const tracker = new loaded.GitTracker();

    folders = { '/code/koja': mainCheckout };
    await read(tracker, '/code/koja');
    failure = 'fatal: the machine is unreachable';

    const info = await read(tracker, '/code/koja');

    expect(info?.repo.commonDirectory).toBe('/code/koja/.git');
  });

  test('forgets the repository when a later read finds none', async () => {
    const tracker = new loaded.GitTracker();

    folders = { '/code/koja': mainCheckout };
    await read(tracker, '/code/koja');
    folders = {};

    expect(await read(tracker, '/code/koja')).toBeNull();
  });
});
