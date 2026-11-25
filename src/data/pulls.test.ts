import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import {
  bodyOf,
  formFieldOf,
  githubFixture,
  pullNodeOf,
  runWith,
} from '../../tests/pullAnswers.ts';
import { pullFacts } from '../../tests/pullFacts.ts';
import type { RunCommand } from './gitIdentity.ts';
import { repositoryOf } from './gitIdentity.ts';
import { branchesPerQuery, pullQueryArgs } from './pullQuery.ts';
import { ghResolvedConfigKey } from './pullRemote.ts';
import type { Pull } from './pulls.ts';
import { parseStoredPull, readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';

interface Call {
  command: string;
  args: string[];
  options: { cwd: string; on: string | null };
}

interface RateLimitedBody {
  data: Record<string, unknown>;
}

interface RemoteAnswers {
  remotes: string;
  urls: Record<string, string>;
  marked: string | null;
}

interface RemoteUrlCase {
  name: string;
  remoteUrl: string;
  host: string | null;
  owner: string;
  repository: string;
  nameFlag: '-f' | '-F';
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

const bodyWithRateLimit = (branchCount: number, remaining: number, resetAt: string): string => {
  const body = JSON.parse(bodyOf(branchCount)) as RateLimitedBody;
  const data = { ...body.data, rateLimit: { cost: 1, remaining, resetAt } };

  return JSON.stringify({ ...body, data });
};

const gitAnswerOf = (args: string[], answers: RemoteAnswers): ExecResult => {
  if (args[1] === 'get-url') {
    const url = answers.urls[args[2] ?? ''] ?? '';

    return { code: 0, stdout: `${url}\n`, stderr: '' };
  }

  if (args[0] === 'config') {
    if (answers.marked === null) {
      return { code: 1, stdout: '', stderr: '' };
    }

    return { code: 0, stdout: `remote.${answers.marked}.gh-resolved base\n`, stderr: '' };
  }

  return { code: 0, stdout: `${answers.remotes}\n`, stderr: '' };
};

const runWithRemotes = (
  remotes: string,
  urls: Record<string, string>,
  calls: Call[],
  marked: string | null = null,
): RunCommand => {
  const answers = { remotes, urls, marked };

  return async (command, args, options) => {
    calls.push({ command, args, options });

    if (command === 'git') {
      return gitAnswerOf(args, answers);
    }

    return { code: 0, stdout: emptyBody(1), stderr: '' };
  };
};

const argsOf = (calls: Call[]): string[][] => calls.map((call) => call.args);

const remoteUrlCases: RemoteUrlCase[] = [
  {
    name: 'maps the ssh port 443 endpoint to github.com',
    remoteUrl: 'ssh://git@ssh.github.com:443/owner/repo.git',
    host: 'github.com',
    owner: 'owner',
    repository: 'repo',
    nameFlag: '-f',
  },
  {
    name: 'decodes an encoded owner and repository name',
    remoteUrl: 'https://github.example.com/koja%2Dteam/koja%2Dapp.git',
    host: 'github.example.com',
    owner: 'koja-team',
    repository: 'koja-app',
    nameFlag: '-f',
  },
  {
    name: 'passes an all-digit owner raw',
    remoteUrl: 'https://github.example.com/1234/koja.git',
    host: 'github.example.com',
    owner: '1234',
    repository: 'koja',
    nameFlag: '-f',
  },
  {
    name: 'keeps the placeholders for an unparsable remote URL',
    remoteUrl: 'git@github.example.com:koja%ZZ/koja.git',
    host: null,
    owner: '{owner}',
    repository: '{repo}',
    nameFlag: '-F',
  },
];

const hostFlagOf = (args: string[]): string | null => {
  const index = args.indexOf('--hostname');
  const host = index === -1 ? undefined : args[index + 1];

  return host ?? null;
};

const nameFlagOf = (args: string[], field: string): string | null => {
  const index = args.findIndex((argument) => argument.startsWith(`${field}=`));
  const flag = index <= 0 ? undefined : args[index - 1];

  return flag ?? null;
};

describe('readRepositoryPulls', () => {
  test('passes the repository machine to every command', async () => {
    const calls: Call[] = [];

    const run = runWithRemotes(
      'origin\nupstream',
      {
        origin: 'git@github.com:koja/koja.git',
        upstream: 'git@github.com:base-owner/koja.git',
      },
      calls,
    );

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    expect(calls).toEqual([
      { command: 'git', args: ['remote'], options: { cwd: '/repo', on: 'qa-remote' } },
      {
        command: 'git',
        args: ['config', '--get-regexp', ghResolvedConfigKey],
        options: { cwd: '/repo', on: 'qa-remote' },
      },
      {
        command: 'git',
        args: ['remote', 'get-url', 'origin'],
        options: { cwd: '/repo', on: 'qa-remote' },
      },
      {
        command: 'gh',
        args: pullQueryArgs(['main'], {
          host: 'github.com',
          owner: 'koja',
          repository: 'koja',
        }),
        options: { cwd: '/repo', on: 'qa-remote' },
      },
    ]);
  });

  test('passes the host and repository of an ssh remote to gh', async () => {
    const calls: Call[] = [];
    const run = runWithRemotes('origin', { origin: 'git@github.example.com:koja/koja.git' }, calls);

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

  test('passes the host of an https remote to gh and prefers origin', async () => {
    const calls: Call[] = [];

    const run = runWithRemotes(
      'upstream\norigin',
      { origin: 'https://ghe.example.com/koja/koja.git' },
      calls,
    );

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    const ghArgs = argsOf(calls).at(-1) ?? [];
    const lookupArgs = argsOf(calls).slice(0, 3);

    expect(lookupArgs).toEqual([
      ['remote'],
      ['config', '--get-regexp', ghResolvedConfigKey],
      ['remote', 'get-url', 'origin'],
    ]);

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
    const run = runWithRemotes('upstream', { upstream: '/srv/git/koja.git' }, calls);

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

  test('reads the pull requests of the remote gh resolved, not the fork', async () => {
    const calls: Call[] = [];

    const run = runWithRemotes(
      'origin\nupstream',
      {
        origin: 'git@github.com:fork-owner/koja.git',
        upstream: 'git@github.com:base-owner/koja.git',
      },
      calls,
      'upstream',
    );

    await readRepositoryPulls(run, sourceOf(), alwaysOwner);

    const ghArgs = argsOf(calls).at(-1) ?? [];

    expect(argsOf(calls)).toContainEqual(['remote', 'get-url', 'upstream']);

    expect(ghArgs).toEqual(
      pullQueryArgs(['main'], {
        host: 'github.com',
        owner: 'base-owner',
        repository: 'koja',
      }),
    );
  });

  test('reports the GitHub host the read used', async () => {
    const calls: Call[] = [];
    const run = runWithRemotes('origin', { origin: 'git@github.example.com:koja/koja.git' }, calls);

    expect(await readRepositoryPulls(run, sourceOf(), alwaysOwner)).toMatchObject({
      kind: 'read',
      host: 'github.example.com',
    });
  });

  test('reports the GitHub host of a rate-limited failure', async () => {
    const host = 'github.example.com';

    const run: RunCommand = async (command, args) => {
      if (command === 'git') {
        const stdout = args[1] === 'get-url' ? `git@${host}:koja/koja.git\n` : 'origin\n';

        return { code: 0, stdout, stderr: '' };
      }

      return { code: 1, stdout: '', stderr: 'API rate limit exceeded for user ID 1' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), alwaysOwner)).toEqual({
      kind: 'failed',
      rateLimited: true,
      host,
    });
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
      host: null,
    });

    expect(calls).toEqual(['git remote', 'git remote get-url origin']);
  });

  test('fails when the git config read fails without calling gh', async () => {
    const calls: string[] = [];

    const run: RunCommand = async (command, args) => {
      calls.push([command, ...args].join(' '));

      if (command === 'git' && args[0] === 'config') {
        return { code: 2, stdout: '', stderr: 'fatal: bad config' };
      }

      const stdout =
        args[1] === 'get-url' ? 'git@github.com:koja/koja.git\n' : 'origin\nupstream\n';

      return { code: 0, stdout, stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), alwaysOwner)).toEqual({
      kind: 'failed',
      rateLimited: false,
      host: null,
    });

    expect(calls).toEqual(['git remote', `git config --get-regexp ${ghResolvedConfigKey}`]);
  });

  test('returns dropped and starts no gh when ownership is lost after the remote url read', async () => {
    const calls: string[] = [];
    let ownerChecks = 0;

    const stillOwner = (): boolean => {
      ownerChecks += 1;

      return ownerChecks <= 1;
    };

    const run: RunCommand = async (command, args) => {
      calls.push([command, ...args].join(' '));

      const stdout = args[1] === 'get-url' ? 'git@github.example.com:koja/koja.git\n' : 'origin\n';

      return { code: 0, stdout, stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), stillOwner)).toEqual({ kind: 'dropped' });

    expect(calls).toEqual(['git remote', 'git remote get-url origin']);
  });

  test('returns dropped and starts no gh when ownership is lost after the git config read', async () => {
    const calls: string[] = [];
    let ownerChecks = 0;

    const stillOwner = (): boolean => {
      ownerChecks += 1;

      return ownerChecks === 1;
    };

    const run: RunCommand = async (command, args) => {
      calls.push([command, ...args].join(' '));

      const stdout =
        args[1] === 'get-url' ? 'git@github.example.com:koja/koja.git\n' : 'origin\nupstream\n';

      return { code: 0, stdout, stderr: '' };
    };

    expect(await readRepositoryPulls(run, sourceOf(), stillOwner)).toEqual({ kind: 'dropped' });

    expect(calls).toEqual(['git remote', `git config --get-regexp ${ghResolvedConfigKey}`]);
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
      host: null,
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
      host: null,
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
      host: null,
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
    expect(await readOf('not json')).toEqual({ kind: 'failed', rateLimited: false, host: null });
  });

  test('fails when the answer has no repository', async () => {
    expect(await readOf(JSON.stringify({ data: {} }))).toEqual({
      kind: 'failed',
      rateLimited: false,
      host: null,
    });
  });

  test('fails when an alias is missing', async () => {
    const body = JSON.stringify({
      data: { rateLimit: null, repository: { open0: { nodes: [] } } },
    });

    expect(await readOf(body)).toEqual({ kind: 'failed', rateLimited: false, host: null });
  });

  test('fails on an error path outside the check and thread paths', async () => {
    const body = JSON.stringify({
      data: {
        rateLimit: null,
        repository: { open0: { nodes: [] }, latest0: { nodes: [] } },
      },
      errors: [{ path: ['repository', 'open0', 'nodes', 0, 'title'] }],
    });

    expect(await readOf(body)).toEqual({ kind: 'failed', rateLimited: false, host: null });
  });

  test('fails on an error path on the open node itself', async () => {
    const body = JSON.stringify({
      data: {
        rateLimit: null,
        repository: { open0: { nodes: [] }, latest0: { nodes: [] } },
      },
      errors: [{ path: ['repository', 'open0', 'nodes', 0] }],
    });

    expect(await readOf(body)).toEqual({ kind: 'failed', rateLimited: false, host: null });
  });

  test('reads no checks value from an inherited enum name', async () => {
    const node = {
      ...pullNodeOf(pull({})),
      commits: { nodes: [{ commit: { statusCheckRollup: { state: 'constructor' } } }] },
    };

    expect(await readOf(bodyOf(1, { open: { 0: node } }))).toEqual({
      kind: 'failed',
      rateLimited: false,
      host: null,
    });
  });

  test('reads an inherited merge, state and review name as unknown or none', async () => {
    const node = {
      ...pullNodeOf(pull({})),
      mergeable: 'constructor',
      mergeStateStatus: '__proto__',
      reviewDecision: 'constructor',
    };

    expect(await readOf(bodyOf(1, { open: { 0: node } }))).toMatchObject({
      kind: 'read',
      pulls: [{ mergeable: 'unknown', mergeState: 'unknown', review: 'none' }],
    });
  });

  test('fails when an open PR node misses a required field', async () => {
    expect(await readOf(bodyOf(1, { open: { 0: { number: 1 } } }))).toEqual({
      kind: 'failed',
      rateLimited: false,
      host: null,
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

  test('reads the rate limit from a single batch', async () => {
    const read = await readOf(emptyBody(1));

    expect(read).toMatchObject({
      kind: 'read',
      rateLimit: { remaining: 4000, resetAt: Date.parse('2026-11-25T12:00:00Z') },
    });
  });

  test('takes the rate limit from the last of several batches', async () => {
    const branches = Array.from({ length: branchesPerQuery + 1 }, (_, index) => `branch-${index}`);

    const answers = [
      { body: bodyWithRateLimit(branchesPerQuery, 4000, '2026-11-25T12:00:00Z') },
      { body: bodyWithRateLimit(1, 3999, '2026-11-25T12:30:00Z') },
    ];

    const calls: string[][] = [];

    const read = await readRepositoryPulls(
      runWith(answers, calls),
      sourceOf(branches),
      alwaysOwner,
    );

    expect(calls.length).toBe(2);

    expect(read).toMatchObject({
      kind: 'read',
      rateLimit: { remaining: 3999, resetAt: Date.parse('2026-11-25T12:30:00Z') },
    });
  });

  test('reads a missing rate limit as null', async () => {
    const body = JSON.stringify({
      data: { repository: { open0: { nodes: [] }, latest0: { nodes: [] } } },
    });

    expect(await readOf(body)).toMatchObject({ kind: 'read', rateLimit: null });
  });
});

describe('the gh arguments of a remote URL', () => {
  test.each(remoteUrlCases)(
    '$name',
    async ({ remoteUrl, host, owner, repository: repositoryName, nameFlag }) => {
      const calls: Call[] = [];
      const run = runWithRemotes('origin', { origin: remoteUrl }, calls);

      await readRepositoryPulls(run, sourceOf(), alwaysOwner);

      const ghArgs = argsOf(calls).at(-1) ?? [];
      const expectedRemote = host === null ? null : { host, owner, repository: repositoryName };

      expect(hostFlagOf(ghArgs)).toBe(host);
      expect(nameFlagOf(ghArgs, 'owner')).toBe(nameFlag);
      expect(nameFlagOf(ghArgs, 'name')).toBe(nameFlag);
      expect(formFieldOf(ghArgs, 'owner')).toBe(owner);
      expect(formFieldOf(ghArgs, 'name')).toBe(repositoryName);
      expect(ghArgs).toEqual(pullQueryArgs(['main'], expectedRemote));
    },
  );
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
