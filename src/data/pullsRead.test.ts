import { describe, expect, test } from 'bun:test';

import { githubFixture, pullNodeOf, runWith } from '../../tests/pullAnswers.ts';
import { pullFacts } from '../../tests/pullFacts.ts';
import type { RunCommand } from './gitIdentity.ts';
import { repositoryOf } from './gitIdentity.ts';
import { pullNeeds } from './pullNeeds.ts';
import type { Pull, PullRead } from './pulls.ts';
import { readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';

const repository = repositoryOf(null, '/repo/.git');

const sourceOf = (branches: string[]): PullSource => ({ repository, cwd: '/repo', branches });

const readOf = async (
  branches: string[],
  answers: { body: string; code?: number; stderr?: string }[],
  calls: string[][] = [],
): Promise<PullRead> =>
  readRepositoryPulls(runWith(answers, calls), sourceOf(branches), () => true);

const pullsOf = (read: PullRead): Pull[] => (read.kind === 'read' ? read.pulls : []);

const readFixture = async (name: string): Promise<Pull[]> =>
  pullsOf(await readOf([name], [{ body: githubFixture(`${name}.json`) }]));

const historyOf = (): Pull[] => {
  const pulls = [pullFacts({ number: 1, headRefName: 'wanted', state: 'OPEN' })];

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

const runAnsweringHistory = (history: Pull[]): RunCommand => {
  return async (command, args) => {
    if (command === 'git') {
      const stdout = args[1] === 'get-url' ? '/srv/git/repo.git\n' : 'origin\n';

      return { code: 0, stdout, stderr: '' };
    }

    return { code: 0, stdout: answerOfQuery(args, history), stderr: '' };
  };
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

  test('never reads unknown mergeability as ready', async () => {
    const pulls = await readFixture('unknown');

    expect(pulls.map((pull) => pullNeeds(pull))).toEqual([[]]);
  });

  test('reads an open PR that is older than 100 newer PRs on other branches', async () => {
    const read = await readRepositoryPulls(
      runAnsweringHistory(historyOf()),
      sourceOf(['feature-125', 'wanted']),
      () => true,
    );

    const pulls = pullsOf(read);

    expect(pulls.map((pull) => pull.number)).toEqual([125, 1]);
    expect(pullNeeds(pulls[1] as Pull)).toEqual(['ready']);
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

    expect(read).toEqual({ kind: 'failed', rateLimited: true });
  });

  test('the local PR rows fake answers the reader', async () => {
    const body =
      '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{"open0":{"nodes":[{"number":7,"state":"OPEN","isDraft":false,"title":"Fixture pull request","headRefName":"fixture-branch","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":null,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"SUCCESS"}}}]},"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}]},"latest0":{"nodes":[]}}}}';

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
    });
  });
});
