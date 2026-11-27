import { describe, expect, test } from 'bun:test';

import { bodyOf, githubFixture, runWith } from '../../tests/pullAnswers.ts';
import { repositoryOf } from './gitIdentity.ts';
import type { Pull, PullRead } from './pulls.ts';
import { readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';

interface GithubAnswer {
  data: { repository: Record<string, { nodes: { url: string }[] }> };
}

const repository = repositoryOf(null, '/repo/.git');

const sourceOf = (branches: string[]): PullSource => ({ repository, cwd: '/repo', branches });

const readOf = async (name: string): Promise<PullRead> =>
  readRepositoryPulls(
    runWith([{ body: githubFixture(`${name}.json`) }]),
    sourceOf([name]),
    () => true,
  );

const pullsOf = (read: PullRead): Pull[] => (read.kind === 'read' ? read.pulls : []);

const fixtureUrlOf = (name: string): string => {
  const answer = JSON.parse(githubFixture(`${name}.json`)) as GithubAnswer;
  const [node] = answer.data.repository['open0']?.nodes ?? [];

  if (node === undefined) {
    throw new Error(`the ${name} fixture has no open pull`);
  }

  return node.url;
};

const openNodeWithout = (url: string | null): Record<string, unknown> => {
  const node: Record<string, unknown> = {
    number: 7,
    state: 'OPEN',
    isDraft: false,
    title: 'Fixture pull request',
    headRefName: 'fixture-branch',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: null,
    commits: { nodes: [] },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
  };

  if (url !== null) {
    node['url'] = url;
  }

  return node;
};

const readOpenNode = (node: Record<string, unknown>): Promise<PullRead> =>
  readRepositoryPulls(
    runWith([{ body: bodyOf(1, { open: { 0: node } }) }]),
    sourceOf(['fixture-branch']),
    () => true,
  );

describe('pull URL', () => {
  test('a read pull carries its URL', async () => {
    const [pull] = pullsOf(await readOf('ready'));

    expect(pull?.url).toBe(fixtureUrlOf('ready'));
  });

  test('a pull node without a URL is malformed', async () => {
    const failed: PullRead = { kind: 'failed', rateLimited: false, host: null };

    expect(await readOpenNode(openNodeWithout(null))).toEqual(failed);
    expect(await readOpenNode(openNodeWithout(''))).toEqual(failed);
  });
});
