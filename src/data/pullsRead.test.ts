import { describe, expect, test } from 'bun:test';

import type { Answer } from '../../tests/pullAnswers.ts';
import {
  answerFrom,
  formFieldOf,
  githubFixture,
  pullNodeOf,
  runWith,
} from '../../tests/pullAnswers.ts';
import { pullFacts, readyPull } from '../../tests/pullFacts.ts';
import type { RunCommand } from './gitIdentity.ts';
import { repositoryOf } from './gitIdentity.ts';
import { pullNeeds } from './pullNeeds.ts';
import { pullQueryArgs } from './pullQuery.ts';
import type { Pull, PullRead } from './pulls.ts';
import { readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';

const repository = repositoryOf(null, '/repo/.git');

const sourceOf = (branches: string[]): PullSource => ({ repository, cwd: '/repo', branches });

const readOf = async (branches: string[], answers: Answer[]): Promise<PullRead> =>
  readRepositoryPulls(runWith(answers), sourceOf(branches), () => true);

const pullsOf = (read: PullRead): Pull[] => (read.kind === 'read' ? read.pulls : []);

const readFixture = async (name: string): Promise<Pull[]> =>
  pullsOf(await readOf([name], [{ body: githubFixture(`${name}.json`) }]));

const historyOf = (): Pull[] => {
  const pulls = [
    readyPull({
      number: 1,
      headRefName: 'wanted',
    }),
  ];

  for (let number = 2; number <= 125; number += 1) {
    const headRefName = number === 2 ? 'wanted' : `feature-${number}`;
    const state = number === 125 ? 'OPEN' : 'CLOSED';

    pulls.push(pullFacts({ number, headRefName, state }));
  }

  return pulls;
};

const branchVariablesOf = (args: string[]): Map<number, string> => {
  const variables = new Map<number, string>();

  for (const argument of args) {
    const match = /^branch(\d+)=(.*)$/.exec(argument);

    if (match === null) {
      continue;
    }

    const index = match[1];
    const branch = match[2];

    if (index === undefined || branch === undefined) {
      continue;
    }

    variables.set(Number(index), branch);
  }

  return variables;
};

const asksOpen = (query: string, index: number): boolean =>
  new RegExp(`open${index}: pullRequests\\(headRefName: \\$branch${index}, states: OPEN,`).test(
    query,
  );

const asksLatest = (query: string, index: number): boolean =>
  new RegExp(`latest${index}: pullRequests\\(headRefName: \\$branch${index},`).test(query);

const newestOf = (history: Pull[], branch: string, state: string | null): unknown[] => {
  const matches = (pull: Pull): boolean => {
    const sameBranch = pull.headRefName === branch;
    const sameState = state === null || pull.state === state;

    return sameBranch && sameState;
  };

  const [newest] = history.filter(matches).toSorted((left, right) => right.number - left.number);

  return newest === undefined ? [] : [pullNodeOf(newest)];
};

const answerOfQuery = (args: string[], history: Pull[]): string => {
  const query = args.find((argument) => argument.startsWith('query=')) ?? '';
  const aliases: Record<string, unknown> = {};

  for (const [index, branch] of branchVariablesOf(args)) {
    const open = asksOpen(query, index) ? newestOf(history, branch, 'OPEN') : [];
    const latest = asksLatest(query, index) ? newestOf(history, branch, null) : [];

    aliases[`open${index}`] = { nodes: open };
    aliases[`latest${index}`] = { nodes: latest };
  }

  return JSON.stringify({
    data: {
      rateLimit: { cost: 1, remaining: 4000, resetAt: '2026-11-25T12:00:00Z' },
      repository: aliases,
    },
  });
};

const runAnsweringHistory = (history: Pull[], remoteUrl = '/srv/git/repo.git'): RunCommand => {
  return async (command, args) => {
    if (command === 'git') {
      const stdout = args[1] === 'get-url' ? `${remoteUrl}\n` : 'origin\n';

      return { code: 0, stdout, stderr: '' };
    }

    return { code: 0, stdout: answerOfQuery(args, history), stderr: '' };
  };
};

const remoteReadOf = async (remoteUrl: string): Promise<string[]> => {
  const calls: string[][] = [];

  const run: RunCommand = async (command, args) => {
    if (command === 'git') {
      const stdout = args[1] === 'get-url' ? `${remoteUrl}\n` : 'origin\n';

      return { code: 0, stdout, stderr: '' };
    }

    calls.push(args);

    return { code: 0, stdout: answerOfQuery(args, historyOf()), stderr: '' };
  };

  await readRepositoryPulls(run, sourceOf(['feature-125']), () => true);

  return calls.at(-1) ?? [];
};

describe('readRepositoryPulls', () => {
  test('reads a failed check and an unresolved thread as failing and review', async () => {
    const pulls = await readFixture('failing-review');

    expect(pulls.map((pull) => pullNeeds(pull))).toEqual([['failing', 'review']]);
  });

  test('reads a clean approved PR as ready', async () => {
    const pulls = await readFixture('ready');

    expect(pulls.map((pull) => pullNeeds(pull))).toEqual([['ready']]);
  });

  test('reads a conflicting PR as conflict', async () => {
    const pulls = await readFixture('conflict');

    expect(pulls.map((pull) => pullNeeds(pull))).toEqual([['conflict']]);
  });

  test('answers the failing check and conflict of the pulls it is given', async () => {
    const given = [
      pullFacts({
        number: 1,
        headRefName: 'failing',
        checks: { kind: 'read', value: 'failing' },
      }),
      pullFacts({ number: 2, headRefName: 'conflict', mergeable: 'conflicting' }),
    ];

    const pulls = pullsOf(await readOf(['failing', 'conflict'], [{ body: answerFrom(2, given) }]));

    expect(pulls.map((pull) => pullNeeds(pull))).toEqual([['failing'], ['conflict']]);
  });

  test('answers a pull whose state is not open under the latest alias', async () => {
    const given = [
      pullFacts({ number: 3, headRefName: 'merged', state: 'MERGED', title: 'Merged' }),
    ];

    const pulls = pullsOf(await readOf(['merged'], [{ body: answerFrom(1, given) }]));

    expect(pulls).toEqual([
      {
        number: 3,
        state: 'MERGED',
        isDraft: false,
        title: 'Merged',
        url: 'https://github.com/example/example/pull/3',
        headRefName: 'merged',
        mergeable: 'unknown',
        mergeState: 'unknown',
        review: 'none',
        checks: { kind: 'unread' },
        threads: { kind: 'unread' },
      },
    ]);
  });

  test('never reads unknown mergeability as ready', async () => {
    const pulls = await readFixture('unknown');

    expect(pulls.map((pull) => pullNeeds(pull))).toEqual([[]]);
  });

  test('reads an open PR that is older than 100 newer PRs on other branches', async () => {
    const branches = [
      'feature-125',
      ...Array.from({ length: 19 }, (_, index) => `live-${index}`),
      'wanted',
    ];

    const read = await readRepositoryPulls(
      runAnsweringHistory(historyOf()),
      sourceOf(branches),
      () => true,
    );

    const pulls = pullsOf(read);

    expect(pulls.map((pull) => pull.number)).toEqual([125, 1]);
    expect(pullNeeds(pulls[1] as Pull)).toEqual(['ready']);
  });

  test('reads the host and repository from https, ssh URI, and ssh shorthand remotes', async () => {
    const remoteUrls = [
      'https://user@github.example.com/koja/koja.git',
      'ssh://git@github.example.com:22/koja/koja.git',
      'ssh://git@github.example.com/koja/koja.git',
      'git@github.example.com:koja/koja.git',
    ];

    for (const remoteUrl of remoteUrls) {
      const ghArgs = await remoteReadOf(remoteUrl);

      expect(ghArgs.slice(0, 4)).toEqual(['api', 'graphql', '--hostname', 'github.example.com']);
      expect(formFieldOf(ghArgs, 'owner')).toBe('koja');
      expect(formFieldOf(ghArgs, 'name')).toBe('koja');
    }
  });

  test('marks an incomplete thread page', async () => {
    const [pull] = await readFixture('threads-incomplete');

    expect(pull?.threads).toEqual({ kind: 'read', value: { unresolved: 0, complete: false } });
    expect(pullNeeds(pull as Pull)).not.toContain('ready');
  });

  test('reads a merged-only branch as a summary pull', async () => {
    const [pull] = await readFixture('merged-only');

    expect(pull).toEqual({
      number: 807,
      state: 'MERGED',
      isDraft: false,
      title: 'Fixture: merged only',
      url: 'https://github.com/example/example/pull/807',
      headRefName: 'merged-only',
      mergeable: 'unknown',
      mergeState: 'unknown',
      review: 'none',
      checks: { kind: 'unread' },
      threads: { kind: 'unread' },
    });
  });

  test('fails a read on a rate limit', async () => {
    const read = await readOf(
      ['main'],
      [{ body: '', code: 1, stderr: 'API rate limit exceeded for user ID 1' }],
    );

    expect(read).toEqual({ kind: 'failed', rateLimited: true, host: null });
  });

  test('records a gh call with no answer instead of hiding it behind a failed read', async () => {
    const calls: string[][] = [];
    const unexpectedCalls: string[][] = [];

    const read = await readRepositoryPulls(
      runWith([], calls, unexpectedCalls),
      sourceOf(['main']),
      () => true,
    );

    expect(read).toEqual({ kind: 'failed', rateLimited: false, host: null });
    expect(calls).toEqual([pullQueryArgs(['main'], null)]);
    expect(unexpectedCalls).toEqual([pullQueryArgs(['main'], null)]);
  });

  test('the local PR rows fake answers the reader', async () => {
    const body =
      '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{"open0":{"nodes":[{"number":7,"state":"OPEN","isDraft":false,"title":"Fixture pull request","url":"https://github.com/example/example/pull/7","headRefName":"fixture-branch","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":null,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"SUCCESS"}}}]},"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}]},"latest0":{"nodes":[]}}}}';

    const pulls = pullsOf(await readOf(['fixture-branch'], [{ body }]));

    expect(pulls).toHaveLength(1);
    expect(pulls[0]).toMatchObject({ number: 7, title: 'Fixture pull request' });
    expect(pullNeeds(pulls[0] as Pull)).toEqual(['ready']);
  });

  test('the recovered PR read fake answers the reader', async () => {
    const body =
      '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{"open0":{"nodes":[]},"latest0":{"nodes":[]}}}}';

    expect(await readOf(['fixture-branch'], [{ body }])).toEqual({
      kind: 'read',
      pulls: [],
      rateLimit: { remaining: 4999, resetAt: Date.parse('2030-01-01T00:00:00Z') },
      host: null,
    });
  });
});
