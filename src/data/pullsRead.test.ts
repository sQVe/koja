import { describe, expect, test } from 'bun:test';

import { bodyOf, fixtureNodes, githubFixture, runWith } from '../../tests/pullAnswers.ts';
import { repositoryOf } from './gitIdentity.ts';
import { pullNeeds } from './pullNeeds.ts';
import { pullQueryArgs } from './pullQuery.ts';
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

const branchesOf = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `branch-${index + 1}`);

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

  test('reads an open PR on a live branch whatever the repository PR count', async () => {
    const branches = branchesOf(25);
    const calls: string[][] = [];
    const { open } = fixtureNodes('failing-review.json');

    const read = await readOf(
      branches,
      [{ body: bodyOf(20) }, { body: bodyOf(5, { open: { 4: open } }) }],
      calls,
    );

    const firstBatch = pullQueryArgs(branches.slice(0, 20));
    const secondBatch = pullQueryArgs(branches.slice(20));

    const branchArguments = calls.map((args) =>
      args.filter((argument) => argument.startsWith('branch')),
    );

    const firstBranches = branches.slice(0, 20).map((branch, index) => `branch${index}=${branch}`);
    const secondBranches = branches.slice(20).map((branch, index) => `branch${index}=${branch}`);

    expect(calls).toEqual([firstBatch, secondBatch]);
    expect(branchArguments).toEqual([firstBranches, secondBranches]);

    expect(pullsOf(read)).toHaveLength(1);
    expect(pullNeeds(pullsOf(read)[0] as Pull)).toEqual(['failing', 'review']);
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
});
