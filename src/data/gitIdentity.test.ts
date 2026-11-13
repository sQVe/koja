import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExecResult } from 'herdr';

import type { GitIdentity, RunCommand } from './gitIdentity.ts';
import { readGitIdentity } from './gitIdentity.ts';

// Git hooks export variables such as GIT_DIR that would point every command at the outer repository.
const outsideGit = Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'));

const gitEnvironment = {
  ...Object.fromEntries(outsideGit),
  GIT_AUTHOR_EMAIL: 'koja@example.com',
  GIT_AUTHOR_NAME: 'Koja',
  GIT_COMMITTER_EMAIL: 'koja@example.com',
  GIT_COMMITTER_NAME: 'Koja',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

const runGit: RunCommand = async (command, args, options) => {
  const child = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: gitEnvironment,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { code, stdout, stderr };
};

const git = async (cwd: string, ...args: string[]): Promise<void> => {
  const result = await runGit('git', args, { cwd, on: null });

  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
};

const withTemp = async (body: (root: string) => Promise<void>): Promise<void> => {
  const made = await mkdtemp(join(tmpdir(), 'koja-git-identity-'));

  try {
    await body(await realpath(made));
  } finally {
    await rm(made, { force: true, recursive: true });
  }
};

const makeRepository = async (root: string): Promise<string> => {
  const main = join(root, 'main');

  await mkdir(main);
  await git(main, 'init', '--quiet', '--initial-branch=main');
  await git(main, 'commit', '--quiet', '--allow-empty', '-m', 'first');

  return main;
};

const read = (folder: string, machine: string | null = null): Promise<GitIdentity> =>
  readGitIdentity(runGit, machine, folder);

const keyOf = (machine: string | null, path: string): string => JSON.stringify([machine, path]);

const exitWith = (code: number, stdout = '', stderr = ''): ExecResult => ({ code, stdout, stderr });

const fakeRunner =
  (answer: (args: string[]) => ExecResult | Error): RunCommand =>
  async (_command, args) => {
    const result = answer(args);

    if (result instanceof Error) {
      throw result;
    }

    return result;
  };

// eslint-disable-next-line typescript/prefer-promise-reject-errors -- the case under test
const rejectWithText: RunCommand = () => Promise.reject('connection dropped');

const isLayoutRead = (args: string[]): boolean =>
  args[0] === 'rev-parse' && args.includes('--git-common-dir');

const checkoutLayout = ['false', 'false', '/work/.git', '/work/.git'].join('\n');

describe('readGitIdentity', () => {
  test('maps a subfolder of a linked worktree to that worktree and its repository', async () => {
    await withTemp(async (root) => {
      const main = await makeRepository(root);
      const linked = join(root, 'linked');
      const subfolder = join(linked, 'deep', 'folder');

      await git(main, 'worktree', 'add', '--quiet', '-b', 'feature', linked);
      await mkdir(subfolder, { recursive: true });

      const identity = await read(subfolder, 'box');

      expect(identity).toEqual({
        kind: 'linked',
        place: { machine: 'box', folder: subfolder, key: keyOf('box', subfolder) },
        repository: {
          machine: 'box',
          commonDirectory: join(main, '.git'),
          key: keyOf('box', join(main, '.git')),
        },
        worktree: { machine: 'box', top: linked, key: keyOf('box', linked) },
        branch: { kind: 'named', name: 'feature' },
      });
    });
  });

  test('reads a main checkout as main', async () => {
    await withTemp(async (root) => {
      const main = await makeRepository(root);
      const identity = await read(main);

      expect(identity).toMatchObject({
        kind: 'main',
        repository: { commonDirectory: join(main, '.git') },
        worktree: { top: main },
        branch: { kind: 'named', name: 'main' },
      });
    });
  });

  test('reads a checkout made with a separate git folder as main', async () => {
    await withTemp(async (root) => {
      const source = await makeRepository(root);
      const checkout = join(root, 'checkout');
      const gitFolder = join(root, 'elsewhere.git');

      await git(root, 'clone', '--quiet', '--separate-git-dir', gitFolder, source, checkout);

      const identity = await read(checkout);

      expect(identity).toMatchObject({
        kind: 'main',
        repository: { commonDirectory: gitFolder },
        worktree: { top: checkout },
      });
    });
  });

  test('reads a bare repository as bare, with no worktree', async () => {
    await withTemp(async (root) => {
      const source = await makeRepository(root);
      const bare = join(root, 'bare.git');

      await git(root, 'clone', '--quiet', '--bare', source, bare);

      const identity = await read(bare);

      expect(identity).toEqual({
        kind: 'bare',
        place: { machine: null, folder: bare, key: keyOf(null, bare) },
        repository: { machine: null, commonDirectory: bare, key: keyOf(null, bare) },
        branch: { kind: 'named', name: 'main' },
      });
    });
  });

  test('reads a detached HEAD as detached', async () => {
    await withTemp(async (root) => {
      const main = await makeRepository(root);

      await git(main, 'checkout', '--quiet', '--detach');

      const identity = await read(main);

      expect(identity).toMatchObject({ kind: 'main', branch: { kind: 'detached' } });
    });
  });

  test('reads a branch with no commit as unborn', async () => {
    await withTemp(async (root) => {
      const fresh = join(root, 'fresh');

      await mkdir(fresh);
      await git(fresh, 'init', '--quiet', '--initial-branch=start');

      const identity = await read(fresh);

      expect(identity).toMatchObject({ kind: 'main', branch: { kind: 'unborn', name: 'start' } });
    });
  });

  test('reads a folder outside any repository as no repository', async () => {
    await withTemp(async (root) => {
      const identity = await read(root);

      expect(identity).toEqual({
        kind: 'none',
        place: { machine: null, folder: root, key: keyOf(null, root) },
      });
    });
  });

  test('reads a folder inside a checkout git folder as no repository', async () => {
    await withTemp(async (root) => {
      const main = await makeRepository(root);
      const identity = await read(join(main, '.git'));

      expect(identity.kind).toBe('none');
    });
  });

  test('gives two worktrees of one repository one repository and two worktrees', async () => {
    await withTemp(async (root) => {
      const main = await makeRepository(root);
      const linked = join(root, 'linked');
      const repositoryKey = keyOf(null, join(main, '.git'));

      await git(main, 'worktree', 'add', '--quiet', '-b', 'feature', linked);

      const first = await read(main);
      const second = await read(linked);

      expect(first).toMatchObject({
        repository: { key: repositoryKey },
        worktree: { key: keyOf(null, main) },
      });

      expect(second).toMatchObject({
        repository: { key: repositoryKey },
        worktree: { key: keyOf(null, linked) },
      });
    });
  });

  test('passes the folder and machine to every command', async () => {
    const seen: { cwd: string; on: string | null }[] = [];

    const recording: RunCommand = async (command, args, options) => {
      seen.push(options);

      return runGit(command, args, options);
    };

    await withTemp(async (root) => {
      const main = await makeRepository(root);

      await readGitIdentity(recording, 'box', main);

      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((options) => options.cwd === main && options.on === 'box')).toBe(true);
    });
  });

  test('gives a failed read when git rev-parse fails for another reason', async () => {
    const run = fakeRunner(() => exitWith(128, '', 'fatal: detected dubious ownership\n'));
    const identity = await readGitIdentity(run, null, '/work');

    expect(identity).toEqual({
      kind: 'failed',
      place: { machine: null, folder: '/work', key: keyOf(null, '/work') },
      error: 'fatal: detected dubious ownership',
    });
  });

  test('gives a failed read when the runner rejects', async () => {
    const run = fakeRunner(() => new Error('machine box is offline'));
    const identity = await readGitIdentity(run, 'box', '/work');

    expect(identity).toMatchObject({ kind: 'failed', error: 'machine box is offline' });
  });

  test('gives a failed read when the runner rejects with a value that is not an Error', async () => {
    const identity = await readGitIdentity(rejectWithText, 'box', '/work');

    expect(identity).toMatchObject({ kind: 'failed', error: 'connection dropped' });
  });

  test('gives a failed read naming the command when it fails without stderr', async () => {
    const run = fakeRunner(() => exitWith(129));
    const identity = await readGitIdentity(run, null, '/work');

    const error = identity.kind === 'failed' ? identity.error : '';

    expect(identity.kind).toBe('failed');
    expect(error).toContain('129');
  });

  test('gives a failed read when the layout output misses the common folder', async () => {
    const run = fakeRunner(() => exitWith(0, 'false\nfalse\n/work/.git\n'));
    const identity = await readGitIdentity(run, null, '/work');

    expect(identity.kind).toBe('failed');
  });

  test('gives a failed read when the layout output has an empty git folder', async () => {
    const run = fakeRunner(() => exitWith(0, 'false\nfalse\n\n/work/.git\n'));
    const identity = await readGitIdentity(run, null, '/work');

    expect(identity.kind).toBe('failed');
  });

  test('gives a failed read when git rev-parse prints nothing', async () => {
    const run = fakeRunner(() => exitWith(0));
    const identity = await readGitIdentity(run, null, '/work');

    expect(identity.kind).toBe('failed');
  });

  test('reads a successful layout as a checkout even when stderr mentions no repository', async () => {
    const run = fakeRunner((args) => {
      if (isLayoutRead(args)) {
        return exitWith(0, checkoutLayout, 'warning: not a git repository: /work/vendor\n');
      }

      if (args.includes('--show-toplevel')) {
        return exitWith(0, '/work\n');
      }

      return exitWith(0, 'main\n');
    });

    const identity = await readGitIdentity(run, null, '/work');

    expect(identity.kind).toBe('main');
  });

  test('gives a failed read when the checkout top is empty', async () => {
    const run = fakeRunner((args) =>
      isLayoutRead(args) ? exitWith(0, checkoutLayout) : exitWith(0, '\n'),
    );

    const identity = await readGitIdentity(run, null, '/work');

    expect(identity.kind).toBe('failed');
  });

  test('gives a failed read when reading the branch fails', async () => {
    const run = fakeRunner((args) => {
      if (isLayoutRead(args)) {
        return exitWith(0, checkoutLayout);
      }

      if (args.includes('--show-toplevel')) {
        return exitWith(0, '/work\n');
      }

      return exitWith(128, '', 'fatal: bad HEAD');
    });

    const identity = await readGitIdentity(run, null, '/work');

    expect(identity).toMatchObject({ kind: 'failed', error: 'fatal: bad HEAD' });
  });

  test('gives a failed read when checking the branch commit fails', async () => {
    const run = fakeRunner((args) => {
      if (isLayoutRead(args)) {
        return exitWith(0, checkoutLayout);
      }

      if (args.includes('--show-toplevel')) {
        return exitWith(0, '/work\n');
      }

      if (args[0] === 'symbolic-ref') {
        return exitWith(0, 'main\n');
      }

      return exitWith(128, '', 'fatal: broken ref');
    });

    const identity = await readGitIdentity(run, null, '/work');

    expect(identity).toMatchObject({ kind: 'failed', error: 'fatal: broken ref' });
  });
});
