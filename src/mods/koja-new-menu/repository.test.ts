import { describe, expect, test } from 'bun:test';

import type { Place } from '../../data/gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from '../../data/gitIdentity.ts';
import type { GitFacts } from '../../data/snapshot.ts';
import { emptyFacts, snapshotKey } from '../../data/snapshot.ts';
import { repositoryNameAt } from './repository.ts';

interface WorktreeFixture {
  commonDirectory: string;
  root: string;
  linked: boolean;
}

const place = placeOf(null, '/code/koja/me-1191');

const readWith =
  (git: GitFacts) =>
  (key: string): unknown =>
    key === snapshotKey ? { version: 6, revision: 1, facts: { ...emptyFacts(), git } } : undefined;

const factsOf = (worktrees: WorktreeFixture[], at: Place): GitFacts => {
  const keys = worktrees.map((worktree) => worktreeOf(at.machine, worktree.root));

  return {
    places: { [at.key]: { kind: 'repository', worktree: keys[0]?.key ?? '' } },
    worktrees: Object.fromEntries(
      worktrees.map((worktree, index) => {
        const key = keys[index]?.key ?? '';

        return [
          key,
          {
            repository: repositoryOf(at.machine, worktree.commonDirectory),
            root: worktree.root,
            branch: 'main',
            linked: worktree.linked,
          },
        ];
      }),
    ),
  };
};

describe('repositoryNameAt', () => {
  test('names the repository that holds the checkout', () => {
    const read = readWith(
      factsOf([{ commonDirectory: '/code/koja/.git', root: '/code/koja', linked: false }], place),
    );

    expect(repositoryNameAt(read, place)).toBe('koja');
  });

  test('names a workspace from the folder that holds its bare repository', () => {
    const read = readWith(
      factsOf([{ commonDirectory: '/code/koja/.bare', root: '/code/koja', linked: false }], place),
    );

    expect(repositoryNameAt(read, place)).toBe('koja');
  });

  test('names a linked worktree after the repository, not the worktree folder', () => {
    const read = readWith(
      factsOf(
        [
          { commonDirectory: '/code/koja/.bare', root: '/code/koja/me-1191', linked: true },
          { commonDirectory: '/code/koja/.bare', root: '/code/koja', linked: false },
        ],
        place,
      ),
    );

    expect(repositoryNameAt(read, place)).toBe('koja');
  });

  test('names a repository whose git folder sits outside the checkout', () => {
    const read = readWith(
      factsOf(
        [{ commonDirectory: '/code/elsewhere.git', root: '/code/checkout', linked: true }],
        place,
      ),
    );

    expect(repositoryNameAt(read, place)).toBe('elsewhere');
  });

  test('names nothing for a folder the facts have not read', () => {
    const read = readWith(
      factsOf([{ commonDirectory: '/code/koja/.git', root: '/code/koja', linked: false }], place),
    );

    expect(repositoryNameAt(read, placeOf(null, '/code/elsewhere'))).toBeNull();
  });

  test('names nothing for a folder that is not a repository', () => {
    const read = readWith({ ...emptyFacts().git, places: { [place.key]: { kind: 'none' } } });

    expect(repositoryNameAt(read, place)).toBeNull();
  });

  test('names nothing while the data layer has no snapshot', () => {
    expect(repositoryNameAt(() => undefined, place)).toBeNull();
  });
});
