import { describe, expect, test } from 'bun:test';

import { bodyOf, formFieldOf, githubFixture, runWith } from '../../tests/pullAnswers.ts';
import { pullFacts } from '../../tests/pullFacts.ts';
import type { RunCommand } from './gitIdentity.ts';
import { repositoryOf } from './gitIdentity.ts';
import { pullQueryArgs } from './pullQuery.ts';
import type { Pull } from './pulls.ts';
import { parseStoredPull, readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';

interface Call {
  command: string;
  args: string[];
  options: { cwd: string; on: string | null };
}

const repository = repositoryOf('qa-remote', '/repo/.git');

const sourceOf = (branches: string[] = ['main']): PullSource => ({
  repository,
  cwd: '/repo',
  branches,
});

const alwaysOwner = (): boolean => true;

const pull = (fields: Partial<Pull>): Pull =>
  pullFacts({ number: 1, headRefName: 'main', title: 'Title', ...fields });

const threadsWith = (unresolved: number): unknown => ({
  kind: 'read',
  value: { unresolved, complete: true },
});

const readOf = (
  body: string,
  branches: string[] = ['main'],
  code = 0,
): ReturnType<typeof readRepositoryPulls> =>
  readRepositoryPulls(runWith([{ body, code }]), sourceOf(branches), alwaysOwner);

const emptyBody = (branchCount: number): string => bodyOf(branchCount);

const runWithRemotes = (remotes: string, remoteUrl: string, calls: Call[]): RunCommand => {
  return async (command, args, options) => {
    calls.push({ command, args, options });

    if (command === 'git') {
      const stdout = args[1] === 'get-url' ? `${remoteUrl}\n` : `${remotes}\n`;

      return { code: 0, stdout, stderr: '' };
    }

    return { code: 0, stdout: emptyBody(1), stderr: '' };
  };
};

const argsOf = (calls: Call[]): string[][] => calls.map((call) => call.args);

describe('readRepositoryPulls', () => {
  test('passes the repository machine to every command', async () => {
    const calls: Call[] = [];

    const run: RunCommand = async (command, args, options) => {
      calls.push({ command, args, options });

      return command === 'git'
        ? { code: 0, stdout: 'origin\n', stderr: '' }
        : { code: 0, stdout: emptyBody(1), stderr: '' };
    };

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    expect(calls).toEqual([
      { command: 'git', args: ['remote'], options: { cwd: '/repo', on: 'qa-remote' } },
      {
        command: 'git',
        args: ['remote', 'get-url', 'origin'],
        options: { cwd: '/repo', on: 'qa-remote' },
      },
      {
        command: 'gh',
        args: pullQueryArgs(['main'], null),
        options: { cwd: '/repo', on: 'qa-remote' },
      },
    ]);
  });

  test('passes the host and repository of an ssh remote to gh', async () => {
    const calls: Call[] = [];
    const run = runWithRemotes('origin', 'git@github.example.com:koja/koja.git', calls);

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    const ghArgs = argsOf(calls).at(-1) ?? [];

    expect(ghArgs.slice(0, 4)).toEqual(['api', 'graphql', '--hostname', 'github.example.com']);
    expect(formFieldOf(ghArgs, 'owner')).toBe('koja');
    expect(formFieldOf(ghArgs, 'name')).toBe('koja');

    expect(ghArgs).toEqual(
      pullQueryArgs(['main'], {
        host: 'github.example.com',
        owner: 'koja',
        repository: 'koja',
      }),
    );
  });

  test('passes the host and repository of an ssh URI with a port to gh', async () => {
    const calls: Call[] = [];
    const run = runWithRemotes('origin', 'ssh://git@github.example.com:22/koja/koja.git', calls);

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    const ghArgs = argsOf(calls).at(-1) ?? [];

    expect(ghArgs.slice(0, 4)).toEqual(['api', 'graphql', '--hostname', 'github.example.com']);
    expect(formFieldOf(ghArgs, 'owner')).toBe('koja');
    expect(formFieldOf(ghArgs, 'name')).toBe('koja');
  });

  test('passes only the host of an https remote with user info', async () => {
    const calls: Call[] = [];
    const run = runWithRemotes('origin', 'https://user@github.example.com/koja/koja.git', calls);

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    const ghArgs = argsOf(calls).at(-1) ?? [];

    expect(ghArgs.slice(0, 4)).toEqual(['api', 'graphql', '--hostname', 'github.example.com']);
    expect(ghArgs).not.toContain('user@github.example.com');
    expect(formFieldOf(ghArgs, 'owner')).toBe('koja');
    expect(formFieldOf(ghArgs, 'name')).toBe('koja');
  });

  test('passes the host of an https remote to gh and prefers origin', async () => {
    const calls: Call[] = [];
    const run = runWithRemotes('upstream\norigin', 'https://ghe.example.com/koja/koja.git', calls);

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    const ghArgs = argsOf(calls).at(-1) ?? [];
    const lookupArgs = argsOf(calls).slice(0, 2);

    expect(lookupArgs).toEqual([['remote'], ['remote', 'get-url', 'origin']]);

    expect(ghArgs.slice(0, 4)).toEqual(['api', 'graphql', '--hostname', 'ghe.example.com']);

    expect(ghArgs).toEqual(
      pullQueryArgs(['main'], {
        host: 'ghe.example.com',
        owner: 'koja',
        repository: 'koja',
      }),
    );
  });

  test('passes no host for a remote without one and takes the first remote', async () => {
    const calls: Call[] = [];
    const run = runWithRemotes('upstream', '/srv/git/koja.git', calls);

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    const ghArgs = argsOf(calls).at(-1) ?? [];
    const lookupArgs = argsOf(calls).slice(0, 2);

    expect(lookupArgs).toEqual([['remote'], ['remote', 'get-url', 'upstream']]);

    expect(ghArgs.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(ghArgs).not.toContain('--hostname');
    expect(formFieldOf(ghArgs, 'owner')).toBe('{owner}');
    expect(formFieldOf(ghArgs, 'name')).toBe('{repo}');
    expect(ghArgs).toEqual(pullQueryArgs(['main'], null));
  });

  test('fails when the remote url read fails without calling gh', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command, args) => {
      calls.push([command, ...args].join(' '));

      return command === 'git' && args[1] !== 'get-url'
        ? { code: 0, stdout: 'origin\n', stderr: '' }
        : { code: 1, stdout: '', stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), alwaysOwner)).toEqual({
      kind: 'failed',
      rateLimited: false,
    });

    expect(calls).toEqual(['git remote', 'git remote get-url origin']);
  });

  test('returns dropped and starts no gh when ownership is lost after the remote url read', async () => {
    const calls: string[] = [];
    let ownerChecks = 0;

    const stillOwner = (): boolean => {
      ownerChecks += 1;

      return ownerChecks === 1;
    };

    const run: RunCommand = async (command, args) => {
      calls.push([command, ...args].join(' '));

      const stdout = args[1] === 'get-url' ? 'git@github.example.com:koja/koja.git\n' : 'origin\n';

      return { code: 0, stdout, stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), stillOwner)).toEqual({ kind: 'dropped' });

    expect(calls).toEqual(['git remote', 'git remote get-url origin']);
  });

  test('reads no PRs for a repository without a remote', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command) => {
      calls.push(command);

      return { code: 0, stdout: '', stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), alwaysOwner)).toEqual({
      kind: 'read',
      pulls: [],
      rateLimit: null,
    });

    expect(calls).toEqual(['git']);
  });

  test('reads no PRs for a repository without branches and calls no gh', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command) => {
      calls.push(command);

      return { code: 0, stdout: 'origin\n', stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf([]), alwaysOwner)).toEqual({
      kind: 'read',
      pulls: [],
      rateLimit: null,
    });

    expect(calls).toEqual(['git']);
  });

  test('fails when git remote fails without calling gh', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command) => {
      calls.push(command);

      return { code: 1, stdout: '', stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), alwaysOwner)).toEqual({
      kind: 'failed',
      rateLimited: false,
    });

    expect(calls).toEqual(['git']);
  });

  test('returns dropped and starts no gh when ownership is lost after git remote', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command) => {
      calls.push(command);

      return { code: 0, stdout: 'origin\n', stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), () => false)).toEqual({ kind: 'dropped' });
    expect(calls).toEqual(['git']);
  });

  test('fails when the gh output is not JSON', async () => {
    expect(await readOf('not json')).toEqual({ kind: 'failed', rateLimited: false });
  });

  test('fails when the answer has no repository', async () => {
    expect(await readOf(JSON.stringify({ data: {} }))).toEqual({
      kind: 'failed',
      rateLimited: false,
    });
  });

  test('fails when an alias is missing', async () => {
    const body = JSON.stringify({
      data: { rateLimit: null, repository: { open0: { nodes: [] } } },
    });

    expect(await readOf(body)).toEqual({ kind: 'failed', rateLimited: false });
  });

  test('fails on an error path outside the check and thread paths', async () => {
    const body = JSON.stringify({
      data: {
        rateLimit: null,
        repository: { open0: { nodes: [] }, latest0: { nodes: [] } },
      },
      errors: [{ path: ['repository', 'open0', 'nodes', 0, 'title'] }],
    });

    expect(await readOf(body)).toEqual({ kind: 'failed', rateLimited: false });
  });

  test('fails when an open PR node misses a required field', async () => {
    expect(await readOf(bodyOf(1, { open: { 0: { number: 1 } } }))).toEqual({
      kind: 'failed',
      rateLimited: false,
    });
  });

  test('keeps a partial answer as a read with the failed part', async () => {
    const read = await readOf(githubFixture('threads-failed.json'), ['threads-failed']);

    expect(read).toMatchObject({
      kind: 'read',
      pulls: [
        { checks: { kind: 'read', value: 'failing' }, threads: { kind: 'failed', last: null } },
      ],
    });
  });

  test('reads the rate limit from the last batch', async () => {
    const read = await readOf(emptyBody(1));

    expect(read).toMatchObject({
      kind: 'read',
      rateLimit: { remaining: 4000, resetAt: Date.parse('2026-11-25T12:00:00Z') },
    });
  });

  test('reads a missing rate limit as null', async () => {
    const body = JSON.stringify({
      data: { repository: { open0: { nodes: [] }, latest0: { nodes: [] } } },
    });

    expect(await readOf(body)).toMatchObject({ kind: 'read', rateLimit: null });
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
