import { describe, expect, test } from 'bun:test';

import { pullFacts } from '../../../tests/pullFacts.ts';
import type { DataState } from '../../data/consumer.ts';
import { placeOf, repositoryOf, worktreeOf } from '../../data/gitIdentity.ts';
import type { Pull } from '../../data/pulls.ts';
import type {
  Facts,
  GitFacts,
  PlaceGit,
  RepositoryPulls,
  Snapshot,
  WorktreeGit,
} from '../../data/snapshot.ts';
import { emptyFacts, snapshotVersion } from '../../data/snapshot.ts';
import type { KeptNeed } from './gitFacts.ts';
import { answeredPlaces, gitInfoAt, needAt, pullFailedAt, pullFactsOf } from './gitFacts.ts';
import type { GitInfo } from './tree.ts';

interface Checkout {
  folder: string;
  machine?: string | null;
  commonDirectory: string;
  linked: boolean;
}

const factsOf = (
  checkouts: readonly Checkout[],
  pulls: Record<string, RepositoryPulls> = {},
): Facts => {
  const places: Record<string, PlaceGit> = {};
  const worktrees: Record<string, WorktreeGit> = {};

  for (const checkout of checkouts) {
    const machine = checkout.machine ?? null;
    const worktree = worktreeOf(machine, checkout.folder);

    places[placeOf(machine, checkout.folder).key] = {
      kind: 'repository',
      worktree: worktree.key,
    };

    worktrees[worktree.key] = {
      repository: repositoryOf(machine, checkout.commonDirectory),
      root: checkout.folder,
      branch: 'main',
      linked: checkout.linked,
      bare: false,
    };
  }

  return { ...emptyFacts(), git: { places, worktrees }, pulls };
};

const placesFacts = (places: Record<string, PlaceGit>): Facts => {
  const facts: GitFacts = { places, worktrees: {} };

  return { ...emptyFacts(), git: facts };
};

const stateOf = (facts: Facts, kind: 'live' | 'stale' = 'live'): DataState => {
  const snapshot: Snapshot = { version: snapshotVersion, revision: 3, facts };
  const fields = { snapshot, owner: 'window-a', generation: 1, heartbeatAt: 0 };

  return kind === 'live' ? { kind, ...fields, staleAt: 30_000 } : { kind, ...fields };
};

describe('gitInfoAt', () => {
  test('gives the git info of a linked worktree place', () => {
    const place = placeOf(null, '/code/koja-fix');

    const state = stateOf(
      factsOf([{ folder: '/code/koja-fix', commonDirectory: '/code/koja/.git', linked: true }]),
    );

    expect(gitInfoAt(state, place)).toEqual({
      branch: 'main',
      worktreeKey: worktreeOf(null, '/code/koja-fix').key,
      repo: repositoryOf(null, '/code/koja/.git'),
      root: '/code/koja-fix',
      linked: true,
    });
  });

  test('gives null for a place outside Git and for a place whose reads failed', () => {
    const state = stateOf(
      placesFacts({
        [placeOf(null, '/tmp/notes').key]: { kind: 'none' },
        [placeOf(null, '/srv/broken').key]: { kind: 'failed' },
      }),
    );

    expect(gitInfoAt(state, placeOf(null, '/tmp/notes'))).toBeNull();
    expect(gitInfoAt(state, placeOf(null, '/srv/broken'))).toBeNull();
  });

  test('leaves an unanswered place undefined', () => {
    const place = placeOf(null, '/code/koja');

    expect(gitInfoAt(stateOf(emptyFacts()), place)).toBeUndefined();
    expect(gitInfoAt({ kind: 'unavailable' }, place)).toBeUndefined();
  });

  test('uses the facts of a stale snapshot', () => {
    const place = placeOf('build-box', '/srv/app');

    const state = stateOf(
      factsOf([
        {
          folder: '/srv/app',
          machine: 'build-box',
          commonDirectory: '/srv/app/.git',
          linked: false,
        },
      ]),
      'stale',
    );

    expect(gitInfoAt(state, place)?.repo.machine).toBe('build-box');
    expect(gitInfoAt(state, place)?.root).toBe('/srv/app');
  });
});

const kojaFacts = (pulls: Record<string, RepositoryPulls> = {}): Facts =>
  factsOf([{ folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false }], pulls);

const kojaGit: GitInfo = {
  branch: 'main',
  worktreeKey: worktreeOf(null, '/code/koja').key,
  repo: repositoryOf(null, '/code/koja/.git'),
  root: '/code/koja',
  linked: false,
};

describe('needAt', () => {
  const conflictingPull = pullFacts({
    number: 11,
    headRefName: 'main',
    mergeable: 'conflicting',
  });

  const failingPull = pullFacts({
    number: 12,
    headRefName: 'main',
    checks: { kind: 'read', value: 'failing' },
  });

  const readState = (failed: boolean, pulls: Pull[] = [conflictingPull]): DataState =>
    stateOf(kojaFacts({ [kojaGit.repo.key]: { pulls, failed } }));

  test('gives null when the state is unavailable or the row has no checkout', () => {
    expect(needAt({ kind: 'unavailable' }, kojaGit, new Map())).toBeNull();
    expect(needAt(stateOf(kojaFacts()), null, new Map())).toBeNull();
  });

  test('keeps the needs of worktrees that stay when a read drops the ones that left', () => {
    const otherFolder = '/code/other';
    const thirdFolder = '/code/third';

    const otherGit: GitInfo = {
      branch: 'main',
      worktreeKey: worktreeOf(null, otherFolder).key,
      repo: repositoryOf(null, `${otherFolder}/.git`),
      root: otherFolder,
      linked: false,
    };

    const thirdGit: GitInfo = {
      branch: 'main',
      worktreeKey: worktreeOf(null, thirdFolder).key,
      repo: repositoryOf(null, `${thirdFolder}/.git`),
      root: thirdFolder,
      linked: false,
    };

    const checkouts = {
      koja: { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
      other: { folder: otherFolder, commonDirectory: `${otherFolder}/.git`, linked: false },
      third: { folder: thirdFolder, commonDirectory: `${thirdFolder}/.git`, linked: false },
    };

    const all = [checkouts.koja, checkouts.other, checkouts.third];
    const withoutKojaCheckouts = [checkouts.other, checkouts.third];

    const pulls = {
      [kojaGit.repo.key]: { pulls: [conflictingPull], failed: false },
      [otherGit.repo.key]: { pulls: [conflictingPull], failed: false },
    };

    const lastNeeds = new Map<string, KeptNeed>();

    expect(needAt(stateOf(factsOf(all, pulls)), kojaGit, lastNeeds)).toBe('conflict');
    expect(needAt(stateOf(factsOf(all, pulls)), otherGit, lastNeeds)).toBe('conflict');

    const withoutKoja = stateOf(factsOf(withoutKojaCheckouts, pulls));

    expect(needAt(withoutKoja, thirdGit, lastNeeds)).toBeNull();
    expect(lastNeeds.has(kojaGit.worktreeKey)).toBe(false);

    const otherFailed = stateOf(
      factsOf(withoutKojaCheckouts, {
        [otherGit.repo.key]: { pulls: [], failed: true },
      }),
    );

    expect(needAt(otherFailed, otherGit, lastNeeds)).toBe('conflict');
    expect(needAt(readState(true), kojaGit, lastNeeds)).toBeNull();
  });

  test('keeps the last need through a failed or unavailable read, then replaces or drops it on a successful one', () => {
    const lastNeeds = new Map<string, KeptNeed>();

    expect(needAt(readState(false), kojaGit, lastNeeds)).toBe('conflict');
    expect(needAt(readState(true), kojaGit, lastNeeds)).toBe('conflict');
    expect(needAt({ kind: 'unavailable' }, kojaGit, lastNeeds)).toBeNull();
    expect(needAt(readState(true), kojaGit, lastNeeds)).toBe('conflict');

    expect(needAt(readState(false, [failingPull]), kojaGit, lastNeeds)).toBe('failing');
    expect(lastNeeds.get(kojaGit.worktreeKey)?.need).toBe('failing');
    expect(needAt(readState(true), kojaGit, lastNeeds)).toBe('failing');

    expect(needAt(stateOf(kojaFacts()), kojaGit, lastNeeds)).toBeNull();
    expect(lastNeeds.has(kojaGit.worktreeKey)).toBe(false);
    expect(needAt(readState(true), kojaGit, lastNeeds)).toBeNull();
  });

  test('drops the kept need when the row moves to another branch or repository', () => {
    const otherBranch = { ...kojaGit, branch: 'other' };
    const otherRepository = { ...kojaGit, repo: repositoryOf(null, '/code/other/.git') };

    const moved = [
      { git: otherBranch, state: readState(true) },
      {
        git: otherRepository,
        state: stateOf(kojaFacts({ [otherRepository.repo.key]: { pulls: [], failed: true } })),
      },
    ];

    for (const row of moved) {
      const lastNeeds = new Map<string, KeptNeed>();

      expect(needAt(readState(false), kojaGit, lastNeeds)).toBe('conflict');
      expect(needAt(row.state, row.git, lastNeeds)).toBeNull();
      expect(needAt(readState(true), kojaGit, lastNeeds)).toBeNull();
    }
  });
});

describe('pullFactsOf', () => {
  test('gives the PR facts of the snapshot and none when unavailable', () => {
    const pulls = { [kojaGit.repo.key]: { pulls: [], failed: true } };

    expect(pullFactsOf(stateOf(kojaFacts(pulls)))).toEqual(pulls);
    expect(pullFactsOf({ kind: 'unavailable' })).toEqual({});
  });
});

describe('pullFailedAt', () => {
  test('is true when the PR facts of the repository failed', () => {
    const state = stateOf(kojaFacts({ [kojaGit.repo.key]: { pulls: [], failed: true } }));

    expect(pullFailedAt(state, kojaGit)).toBe(true);
  });

  test('is false when the PR facts of the repository were read', () => {
    const state = stateOf(kojaFacts({ [kojaGit.repo.key]: { pulls: [], failed: false } }));

    expect(pullFailedAt(state, kojaGit)).toBe(false);
  });

  test('is false for an unavailable state and for a repository with no PR facts', () => {
    expect(pullFailedAt(stateOf(kojaFacts()), kojaGit)).toBe(false);
    expect(pullFailedAt({ kind: 'unavailable' }, kojaGit)).toBe(false);
  });
});

describe('answeredPlaces', () => {
  test('names the places the facts answer', () => {
    const notes = placeOf(null, '/tmp/notes');
    const broken = placeOf(null, '/srv/broken');

    const state = stateOf(
      placesFacts({
        [notes.key]: { kind: 'none' },
        [broken.key]: { kind: 'failed' },
      }),
    );

    expect(answeredPlaces(state)).toEqual(new Set([notes.key, broken.key]));
    expect(answeredPlaces({ kind: 'unavailable' })).toEqual(new Set());
  });
});
