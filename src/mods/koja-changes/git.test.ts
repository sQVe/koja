import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import type { RunCommand } from '../../data/gitIdentity.ts';
import { changeSnapshot, commitAll, readRepository, statusCommand } from './git.ts';

interface GitOutputs {
  head: number;
  numstat?: number;
  statusText?: string;
}

const ok = { code: 0, stdout: '', stderr: '' };

const fakeRunner = (answer: (args: string[]) => ExecResult) => {
  const calls: string[][] = [];

  const run: RunCommand = async (command, args) => {
    calls.push([command, ...args]);

    return answer(args);
  };

  return { run, calls };
};

const mainLayout = 'false\nfalse\n/repo/.git\n/repo/.git\n';
const bareLayout = 'true\nfalse\n/repo.git\n/repo.git\n';

const identityAnswer =
  (layout: string) =>
  (args: string[]): ExecResult | null => {
    if (args.includes('--is-bare-repository')) {
      return { ...ok, stdout: layout };
    }

    if (args.includes('--show-toplevel')) {
      return { ...ok, stdout: '/repo\n' };
    }

    if (args[0] === 'symbolic-ref') {
      return { ...ok, stdout: 'main\n' };
    }

    if (args.includes('--quiet')) {
      return ok;
    }

    return null;
  };

describe('readRepository', () => {
  test('reports the repository a folder sits in', async () => {
    const { run } = fakeRunner((args) => identityAnswer(mainLayout)(args) ?? ok);

    expect(await readRepository(run, '/repo/src', null)).toEqual({ kind: 'root', root: '/repo' });
  });

  test('reports a folder outside a repository', async () => {
    const { run } = fakeRunner(() => ({
      code: 128,
      stdout: '',
      stderr: 'fatal: not a git repository',
    }));

    expect(await readRepository(run, '/tmp', null)).toEqual({ kind: 'missing' });
  });

  test('reports a bare repository as missing', async () => {
    const { run } = fakeRunner((args) => identityAnswer(bareLayout)(args) ?? ok);

    expect(await readRepository(run, '/repo.git', null)).toEqual({ kind: 'missing' });
  });

  test('fails with the git error when git cannot read the folder', async () => {
    const { run } = fakeRunner(() => ({
      code: 128,
      stdout: '',
      stderr: 'fatal: detected dubious ownership in repository at /repo\n',
    }));

    expect(await readRepository(run, '/repo', null)).toEqual({
      kind: 'failed',
      error: 'fatal: detected dubious ownership in repository at /repo',
    });
  });
});

describe('statusCommand', () => {
  test('reads the status of every file in the repository', async () => {
    const { run, calls } = fakeRunner(() => ok);

    await statusCommand(run, '/repo', null);

    expect(calls).toEqual([
      [
        'git',
        '--no-optional-locks',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'diff.autoRefreshIndex=false',
        'status',
        '--porcelain=v1',
        '-z',
        '--no-renames',
        '--untracked-files=all',
      ],
    ]);
  });
});

const failedWith = (code: number, message: string): ExecResult => ({
  code,
  stdout: '',
  stderr: code === 0 ? '' : message,
});

const gitAnswer =
  (outputs: GitOutputs) =>
  (args: string[]): ExecResult => {
    if (args.includes('--verify')) {
      return { ...ok, code: outputs.head };
    }

    if (outputs.numstat !== undefined) {
      return failedWith(outputs.numstat, 'numstat failed');
    }

    if (args.includes('--cached')) {
      return { ...ok, stdout: '2\t0\ta.ts\0' };
    }

    return { ...ok, stdout: '3\t1\ta.ts\0' };
  };

const changedFiles = (count: number): string =>
  Array.from({ length: count }, (_, index) => ` M file-${index}.ts\0`).join('');

describe('changeSnapshot', () => {
  test('lists the changed files with their counts against HEAD', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 0 }));

    const snapshot = await changeSnapshot(run, '/repo', null, ' M a.ts\0?? new.ts\0');

    expect(snapshot.root).toBe('/repo');
    expect(snapshot.hasHead).toBe(true);

    const rows = snapshot.files.map((file) => [file.path, file.status, file.add, file.del]);

    expect(rows).toEqual([
      ['a.ts', 'M', 3, 1],
      ['new.ts', 'A', 0, 0],
    ]);

    expect(calls.filter((call) => call.includes('--numstat'))).toHaveLength(1);
  });

  test('adds the staged and unstaged counts when the repository has no commit yet', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 128 }));

    const snapshot = await changeSnapshot(run, '/repo', null, ' M a.ts\0');

    expect(snapshot.hasHead).toBe(false);
    expect(snapshot.files[0]).toMatchObject({ path: 'a.ts', add: 5, del: 1 });
    expect(calls.filter((call) => call.includes('--numstat'))).toHaveLength(2);
  });

  test('reads no head and no counts when every shown file is untracked', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 0 }));

    const snapshot = await changeSnapshot(run, '/repo', null, '?? a.ts\0?? b.ts\0');

    expect(snapshot.hasHead).toBe(false);
    expect(snapshot.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
    expect(calls).toEqual([]);
  });

  test('still counts a tracked file beside an untracked one', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 0 }));

    await changeSnapshot(run, '/repo', null, '?? a.ts\0 M b.ts\0');

    expect(calls.filter((call) => call.includes('--verify'))).toHaveLength(1);
  });

  test('fails with the count error and reads no more counts when a count read fails', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 128, numstat: 1 }));

    const failure = await changeSnapshot(run, '/repo', null, ' M a.ts\0').catch(
      (error: unknown) => error,
    );

    expect(failure).toEqual(new Error('numstat failed'));
    expect(calls.filter((call) => call.includes('--numstat'))).toHaveLength(1);
  });

  test('keeps the first 1,000 files and marks the list as limited past that', async () => {
    const { run } = fakeRunner(gitAnswer({ head: 0 }));

    const snapshot = await changeSnapshot(run, '/repo', null, changedFiles(1001));

    expect(snapshot.files).toHaveLength(1000);
    expect(snapshot.limited).toBe(true);
  });

  test('does not mark a list of exactly 1,000 files as limited', async () => {
    const { run } = fakeRunner(gitAnswer({ head: 0 }));

    const snapshot = await changeSnapshot(run, '/repo', null, changedFiles(1000));

    expect(snapshot.files).toHaveLength(1000);
    expect(snapshot.limited).toBe(false);
  });
});

describe('commitAll', () => {
  test('stages every change, then commits with the message', async () => {
    const { run, calls } = fakeRunner(() => ok);

    await commitAll(run, '/repo', null, 'Fix the login redirect');

    expect(calls).toEqual([
      ['git', 'add', '-A'],
      ['git', 'commit', '-m', 'Fix the login redirect'],
    ]);
  });

  test('stops with the add error and does not commit when staging fails', async () => {
    const { run, calls } = fakeRunner(() => ({
      code: 1,
      stdout: '',
      stderr: 'fatal: Unable to create index.lock\n',
    }));

    const failure = await commitAll(run, '/repo', null, 'Fix it').catch((error: unknown) => error);

    expect(failure).toEqual(new Error('fatal: Unable to create index.lock'));

    expect(calls).toEqual([['git', 'add', '-A']]);
  });
});
