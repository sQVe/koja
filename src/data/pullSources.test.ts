import { describe, expect, test } from 'bun:test';

import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import { pullSources } from './pullSources.ts';
import type { GitFacts } from './snapshot.ts';

interface Worktree {
  folder: string;
  linked: boolean;
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
      branch: 'main',
      linked: worktree.linked,
    };
  }

  return { places, worktrees: worktreeFacts };
};

const main = { folder: '/code/koja-z', linked: false };
const linked = { folder: '/code/koja-a', linked: true };

describe('pullSources', () => {
  test('gives one source for two worktrees of one repository', () => {
    expect(pullSources(factsOf([main, linked])).size).toBe(1);
    expect(pullSources(factsOf([linked, main])).size).toBe(1);
  });

  test('chooses the worktree root of the smallest place key in both input orders', () => {
    const source = { repository, cwd: '/code/koja-a' };
    const mainFirst = [...pullSources(factsOf([main, linked])).values()];
    const linkedFirst = [...pullSources(factsOf([linked, main])).values()];

    expect(mainFirst).toEqual([source]);
    expect(linkedFirst).toEqual([source]);
  });
});
