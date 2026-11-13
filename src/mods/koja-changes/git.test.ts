import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import type { RunCommand } from '../../data/gitIdentity.ts';
import type { ChangesSnapshot, ReadOutcome } from './git.ts';
import { commitAll, readChanges } from './git.ts';

interface GitOutputs {
  head: number;
  status?: number;
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

const snapshotOf = (result: ReadOutcome | null): ChangesSnapshot => {
  if (result === null || 'failure' in result) {
    throw new Error('expected a snapshot');
  }

  return result.snapshot;
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

describe('readChanges', () => {
  test('returns null and runs no change read when the folder changed after the identity read', async () => {
    const { run, calls } = fakeRunner((args) => identityAnswer(mainLayout)(args) ?? ok);

    const result = await readChanges(run, '/repo', null, () => false);

    expect(result).toBeNull();

    expect(calls).toEqual([
      [
        'git',
        'rev-parse',
        '--is-bare-repository',
        '--is-inside-git-dir',
        '--path-format=absolute',
        '--git-dir',
        '--git-common-dir',
      ],
      ['git', 'rev-parse', '--show-toplevel'],
      ['git', 'symbolic-ref', '--quiet', '--short', 'HEAD'],
      ['git', 'rev-parse', '--verify', '--quiet', 'HEAD'],
    ]);
  });

  test('reports a folder outside a repository', async () => {
    const { run } = fakeRunner(() => ({
      code: 128,
      stdout: '',
      stderr: 'fatal: not a git repository',
    }));

    const result = await readChanges(run, '/tmp', null, () => true);

    expect(result).toEqual({ failure: 'Not a git repository' });
  });

  test('reports a bare repository as not a git repository and reads no changes', async () => {
    const { run, calls } = fakeRunner((args) => identityAnswer(bareLayout)(args) ?? ok);

    const result = await readChanges(run, '/repo.git', null, () => true);

    expect(result).toEqual({ failure: 'Not a git repository' });
    expect(calls.filter((call) => call.includes('status'))).toHaveLength(0);
  });

  test('fails with the git error and reads no changes when git cannot read the folder', async () => {
    const { run, calls } = fakeRunner(() => ({
      code: 128,
      stdout: '',
      stderr: 'fatal: detected dubious ownership in repository at /repo\n',
    }));

    const failure = await readChanges(run, '/repo', null, () => true).catch(
      (error: unknown) => error,
    );

    expect(failure).toEqual(new Error('fatal: detected dubious ownership in repository at /repo'));
    expect(calls.filter((call) => call.includes('status'))).toHaveLength(0);
  });
});

const failedWith = (code: number, message: string) => ({
  code,
  stdout: '',
  stderr: code === 0 ? '' : message,
});

const gitAnswer =
  (outputs: GitOutputs) =>
  (args: string[]): ExecResult => {
    const identity = identityAnswer(mainLayout)(args);

    if (identity !== null) {
      return identity;
    }

    if (args.includes('status')) {
      const statusText = outputs.statusText ?? ' M a.ts\0?? new.ts\0';

      return { ...failedWith(outputs.status ?? 0, 'status failed'), stdout: statusText };
    }

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

describe('readChanges with a repository', () => {
  test('lists the changed files with their counts against HEAD', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 0 }));

    const result = await readChanges(run, '/repo/src', null, () => true);

    expect(snapshotOf(result).root).toBe('/repo');
    expect(snapshotOf(result).hasHead).toBe(true);

    expect(
      snapshotOf(result).files.map((file) => [file.path, file.status, file.add, file.del]),
    ).toEqual([
      ['a.ts', 'M', 3, 1],
      ['new.ts', 'A', 0, 0],
    ]);

    expect(calls.filter((call) => call.includes('--numstat'))).toHaveLength(1);
  });

  test('adds the staged and unstaged counts when the repository has no commit yet', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 128 }));

    const result = await readChanges(run, '/repo', null, () => true);

    expect(snapshotOf(result).hasHead).toBe(false);
    expect(snapshotOf(result).files[0]).toMatchObject({ path: 'a.ts', add: 5, del: 1 });
    expect(calls.filter((call) => call.includes('--numstat'))).toHaveLength(2);
  });

  test('fails with the status error and reads no counts when status fails', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 0, status: 128 }));

    const failure = await readChanges(run, '/repo', null, () => true).catch(
      (error: unknown) => error,
    );

    expect(failure).toEqual(new Error('status failed'));
    expect(calls.filter((call) => call.includes('--numstat'))).toHaveLength(0);
  });

  test('fails with the count error and reads no more counts when a count read fails', async () => {
    const { run, calls } = fakeRunner(gitAnswer({ head: 128, numstat: 1 }));

    const failure = await readChanges(run, '/repo', null, () => true).catch(
      (error: unknown) => error,
    );

    expect(failure).toEqual(new Error('numstat failed'));
    expect(calls.filter((call) => call.includes('--numstat'))).toHaveLength(1);
  });

  test('keeps the first 1,000 files and marks the list as limited past that', async () => {
    const { run } = fakeRunner(gitAnswer({ head: 0, statusText: changedFiles(1001) }));

    const result = await readChanges(run, '/repo', null, () => true);

    expect(snapshotOf(result).files).toHaveLength(1000);
    expect(snapshotOf(result).limited).toBe(true);
  });

  test('does not mark a list of exactly 1,000 files as limited', async () => {
    const { run } = fakeRunner(gitAnswer({ head: 0, statusText: changedFiles(1000) }));

    const result = await readChanges(run, '/repo', null, () => true);

    expect(snapshotOf(result).files).toHaveLength(1000);
    expect(snapshotOf(result).limited).toBe(false);
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
