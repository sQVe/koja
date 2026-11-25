import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { pullFacts } from '../../tests/pullFacts.ts';
import type { RunCommand } from './gitIdentity.ts';
import { repositoryOf } from './gitIdentity.ts';
import type { Pull } from './pulls.ts';
import { parseStoredPull, readPullList, readRepositoryPulls } from './pulls.ts';

interface Call {
  command: string;
  args: string[];
  options: { cwd: string; on: string | null };
}

const result = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: '' });

const failure = (): ExecResult => ({ code: 1, stdout: '', stderr: '' });

const failureWith = (stdout: string): ExecResult => ({ code: 1, stdout, stderr: '' });

const throwingRun: RunCommand = async () => {
  throw new Error('git is away');
};

const repository = repositoryOf('qa-remote', '/repo/.git');

const threadsWith = (unresolved: number): unknown => ({
  kind: 'read',
  value: { unresolved, complete: true },
});

const alwaysOwner = (): boolean => true;

const pull = (fields: Partial<Pull>): Pull =>
  pullFacts({ number: 1, headRefName: 'main', title: 'Title', ...fields });

describe('readRepositoryPulls', () => {
  test('passes the repository machine to both commands', async () => {
    const calls: Call[] = [];

    const run: RunCommand = async (command, args, options) => {
      calls.push({ command, args, options });

      return command === 'git' ? result('origin\n') : result('[]');
    };

    await readRepositoryPulls(run, repository, '/repo', alwaysOwner);

    expect(calls).toEqual([
      { command: 'git', args: ['remote'], options: { cwd: '/repo', on: 'qa-remote' } },
      {
        command: 'gh',
        args: [
          'pr',
          'list',
          '--state',
          'all',
          '--limit',
          '100',
          '--json',
          'number,state,isDraft,title,headRefName',
        ],
        options: { cwd: '/repo', on: 'qa-remote' },
      },
    ]);
  });

  test('reads no PRs for a repository without a remote', async () => {
    const calls: Call[] = [];

    const run: RunCommand = async (command, args, options) => {
      calls.push({ command, args, options });

      return result('');
    };

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'read',
      pulls: [],
    });

    expect(calls.map((call) => call.command)).toEqual(['git']);
  });

  test('reads no PRs when git remote prints only whitespace', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command) => {
      calls.push(command);

      return result(' \n');
    };

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'read',
      pulls: [],
    });

    expect(calls).toEqual(['git']);
  });

  test('fails when git remote fails without calling gh', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command) => {
      calls.push(command);

      return failure();
    };

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'failed',
    });

    expect(calls).toEqual(['git']);
  });

  test('returns dropped and starts no gh when ownership is lost after git remote', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command) => {
      calls.push(command);

      return result('origin\n');
    };

    expect(await readRepositoryPulls(run, repository, '/repo', () => false)).toEqual({
      kind: 'dropped',
    });

    expect(calls).toEqual(['git']);
  });

  test('fails when gh fails', async () => {
    const run: RunCommand = async (command) => (command === 'git' ? result('origin\n') : failure());

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'failed',
    });
  });

  test('fails when gh exits nonzero with valid JSON', async () => {
    const run: RunCommand = async (command) =>
      command === 'git' ? result('origin\n') : failureWith('[]');

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'failed',
    });
  });

  test('fails when the gh output is not JSON', async () => {
    const run: RunCommand = async (command) =>
      command === 'git' ? result('origin\n') : result('not json');

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'failed',
    });
  });

  test('fails when the gh JSON is not a list', async () => {
    const run: RunCommand = async (command) =>
      command === 'git' ? result('origin\n') : result('{}');

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'failed',
    });
  });

  test('reads an empty gh list as a good empty read', async () => {
    const run: RunCommand = async (command) =>
      command === 'git' ? result('origin\n') : result('[]');

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'read',
      pulls: [],
    });
  });

  test('fails when every item in a non-empty gh list is malformed', async () => {
    const run: RunCommand = async (command) =>
      command === 'git'
        ? result('origin\n')
        : result('[{"number":"1","state":"OPEN","headRefName":"main"}]');

    expect(await readRepositoryPulls(run, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'failed',
    });
  });

  test('fails when the run throws', async () => {
    expect(await readRepositoryPulls(throwingRun, repository, '/repo', alwaysOwner)).toEqual({
      kind: 'failed',
    });
  });
});

describe('readPullList', () => {
  test('drops entries missing a number, state, or branch', () => {
    const list = [
      { number: 1, state: 'OPEN', headRefName: 'main' },
      { number: 2, state: 'OPEN' },
      { state: 'OPEN', headRefName: 'main' },
    ];

    expect(readPullList(list)).toEqual([pull({ title: '' })]);
  });

  test('defaults a missing title and draft flag and tolerates extra fields', () => {
    const list = [
      { number: 1, state: 'OPEN', headRefName: 'main', isDraft: 'yes', extra: true },
      { number: 2, state: 'OPEN', headRefName: 'main', title: 42 },
    ];

    expect(readPullList(list)).toEqual([
      pull({ number: 1, title: '', isDraft: false }),
      pull({ number: 2, title: '', isDraft: false }),
    ]);
  });

  test('drops an entry whose number is not a number', () => {
    expect(readPullList([{ number: '1', state: 'OPEN', headRefName: 'main' }])).toEqual([]);
  });
});

describe('parseStoredPull', () => {
  test('accepts a stored pull with every field', () => {
    expect(parseStoredPull(pull({}))).toEqual(pull({}));
  });

  test('rejects a stored pull with an extra field', () => {
    expect(parseStoredPull({ ...pull({}), extra: true })).toBeNull();
  });

  test('rejects a stored pull with a wrong field type', () => {
    expect(parseStoredPull({ ...pull({}), isDraft: 'yes' })).toBeNull();
  });

  test('rejects a value outside a needs union', () => {
    expect(parseStoredPull({ ...pull({}), mergeable: 'maybe' })).toBeNull();
    expect(parseStoredPull({ ...pull({}), mergeState: 'waiting' })).toBeNull();
    expect(parseStoredPull({ ...pull({}), review: 'asked' })).toBeNull();
    expect(parseStoredPull({ ...pull({}), checks: { kind: 'read', value: 'green' } })).toBeNull();
  });

  test('rejects a negative or fractional unresolved count', () => {
    expect(parseStoredPull({ ...pull({}), threads: threadsWith(-1) })).toBeNull();
    expect(parseStoredPull({ ...pull({}), threads: threadsWith(1.5) })).toBeNull();
    expect(parseStoredPull({ ...pull({}), threads: threadsWith(0) })).not.toBeNull();
  });

  test('rejects an unknown key inside a part', () => {
    expect(parseStoredPull({ ...pull({}), checks: { kind: 'unread', extra: true } })).toBeNull();

    expect(
      parseStoredPull({
        ...pull({}),
        threads: { kind: 'read', value: { unresolved: 0, complete: true, extra: true } },
      }),
    ).toBeNull();
  });

  test('accepts a failed part with no last value', () => {
    const stored = { ...pull({}), threads: { kind: 'failed', last: null } as const };

    expect(parseStoredPull(stored)).toEqual(stored);
  });
});
