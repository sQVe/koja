import { describe, expect, test } from 'bun:test';

import { stacksOf } from '../../tests/stackFixtures.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import { pullSources } from './pullSources.ts';
import type { GitFacts, RepositoryStacks } from './snapshot.ts';

interface Worktree {
  folder: string;
  linked: boolean;
  branch?: string | null;
}

const repository = repositoryOf(null, '/code/koja/.git');

const factsOf = (worktrees: readonly Worktree[]): GitFacts => {
  const places: GitFacts['places'] = {};
  const worktreeFacts: GitFacts['worktrees'] = {};

  for (const worktree of worktrees) {
    const identity = worktreeOf(null, worktree.folder);

    places[placeOf(null, worktree.folder).key] = { kind: 'repository', worktree: identity.key };

    worktreeFacts[identity.key] = {
      repository,
      root: worktree.folder,
      branch: worktree.branch === undefined ? 'main' : worktree.branch,
      linked: worktree.linked,
    };
  }

  return { places, worktrees: worktreeFacts };
};

const pullSourcesOf = (
  facts: GitFacts,
  stacks: Readonly<Record<string, RepositoryStacks>> = {},
): ReturnType<typeof pullSources> => pullSources(facts, stacks);

const stackOfThree = (): Record<string, RepositoryStacks> =>
  stacksOf(repository, ['add-search', 'add-search-ui', 'add-search-tests']);

const main = { folder: '/code/koja-z', linked: false };
const linked = { folder: '/code/koja-a', linked: true };

describe('pullSources', () => {
  test('gives one source for two worktrees of one repository', () => {
    expect(pullSourcesOf(factsOf([main, linked])).size).toBe(1);
    expect(pullSourcesOf(factsOf([linked, main])).size).toBe(1);
  });

  test('chooses the worktree root of the smallest place key in both input orders', () => {
    const source = { repository, cwd: '/code/koja-a', branches: ['main'] };
    const mainFirst = [...pullSourcesOf(factsOf([main, linked])).values()];
    const linkedFirst = [...pullSourcesOf(factsOf([linked, main])).values()];

    expect(mainFirst).toEqual([source]);
    expect(linkedFirst).toEqual([source]);
  });

  test('collects the sorted unique branches of every worktree of one repository', () => {
    const facts = factsOf([
      { folder: '/code/koja-z', linked: false, branch: 'zeta' },
      { folder: '/code/koja-a', linked: true, branch: 'alpha' },
      { folder: '/code/koja-m', linked: true, branch: 'zeta' },
      { folder: '/code/koja-d', linked: true, branch: null },
    ]);

    const [source] = [...pullSourcesOf(facts).values()];

    expect(source?.branches).toEqual(['alpha', 'zeta']);
  });

  test('pull sources include every branch of an attached stack', () => {
    const facts = factsOf([{ folder: '/code/koja-z', linked: false, branch: 'add-search-ui' }]);

    const [source] = [...pullSourcesOf(facts, stackOfThree()).values()];

    expect(source?.branches).toEqual(['add-search', 'add-search-tests', 'add-search-ui']);
  });

  test('a stack with no checked-out branch adds no stack branches', () => {
    const facts = factsOf([{ folder: '/code/koja-z', linked: false, branch: 'main' }]);

    const [source] = [...pullSourcesOf(facts, stackOfThree()).values()];

    expect(source?.branches).toEqual(['main']);
  });
});
