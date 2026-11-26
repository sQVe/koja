import { describe, expect, test } from 'bun:test';

import {
  gitAt,
  gitFacts,
  placeAt,
  placesAt,
  placesIn,
  repositoryAt,
  snapshotOf,
  validRaw,
  worktree,
  worktreeAt,
  worktreesAt,
} from '../../tests/snapshotRaw.ts';
import type { RawSnapshot } from '../../tests/snapshotRaw.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import { parseSnapshot } from './snapshot.ts';

const malformedFields: [string, (snapshot: RawSnapshot, key: string) => void][] = [
  [
    'an empty root',
    (snapshot, key) => {
      worktreeAt(snapshot, key).root = '';
    },
  ],
  [
    'an empty common directory',
    (snapshot, key) => {
      repositoryAt(snapshot, key).commonDirectory = '';
    },
  ],
  [
    'a root that is not a string',
    (snapshot, key) => {
      worktreeAt(snapshot, key).root = 1;
    },
  ],
  [
    'a repository that is not a record',
    (snapshot, key) => {
      worktreeAt(snapshot, key).repository = 'main';
    },
  ],
  [
    'a worktree that is not a record',
    (snapshot, key) => {
      worktreesAt(snapshot)[key] = 'main';
    },
  ],
  [
    'an unknown repository field',
    (snapshot, key) => {
      repositoryAt(snapshot, key).extra = true;
    },
  ],
  [
    'an unknown git field',
    (snapshot) => {
      gitAt(snapshot).extra = true;
    },
  ],
  [
    'a machine that is not a string or null',
    (snapshot, key) => {
      repositoryAt(snapshot, key).machine = 1;
    },
  ],
  [
    'a repository key that is not a string',
    (snapshot, key) => {
      repositoryAt(snapshot, key).key = 1;
    },
  ],
  [
    'a linked flag that is not a boolean',
    (snapshot, key) => {
      worktreeAt(snapshot, key).linked = 'yes';
    },
  ],
  [
    'a repository place without a worktree',
    (snapshot, key) => {
      delete placeAt(snapshot, key).worktree;
    },
  ],
  [
    'a worktree reference that is not a string',
    (snapshot, key) => {
      placeAt(snapshot, key).worktree = 1;
    },
  ],
];

describe('parseSnapshot git facts', () => {
  test('rejects a place that names a missing worktree', () => {
    const git = gitFacts();
    const place = placeOf(null, '/work');

    git.places[place.key] = { kind: 'repository', worktree: worktreeOf(null, '/missing').key };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects a worktree whose key does not match its root', () => {
    const git = gitFacts();
    const place = placeOf(null, '/work');
    const wrongKey = worktreeOf(null, '/elsewhere').key;

    git.worktrees = { [wrongKey]: worktree(null, '/work') };
    git.places[place.key] = { kind: 'repository', worktree: wrongKey };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects a repository whose key does not match its commonDirectory', () => {
    const git = gitFacts();
    const key = worktreeOf(null, '/work').key;
    const tree = worktree(null, '/work');
    const repository = { ...tree.repository, commonDirectory: '/other/.git' };

    git.worktrees[key] = { ...tree, repository };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects an unknown place kind', () => {
    const git = { places: { [placeOf(null, '/work').key]: { kind: 'other' } }, worktrees: {} };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects an unknown field in a worktree', () => {
    const key = worktreeOf(null, '/work').key;

    const git = {
      places: gitFacts().places,
      worktrees: { [key]: { ...worktree(null, '/work'), extra: true } },
    };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects an unknown field in a place', () => {
    const place = placeOf(null, '/work');

    const git = {
      places: { [place.key]: { kind: 'none', extra: true } },
      worktrees: {},
    };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects a places map that is not a record', () => {
    expect(parseSnapshot(snapshotOf({ places: [], worktrees: {} }))).toBeNull();
  });

  test('rejects a worktrees map that is not a record', () => {
    expect(parseSnapshot(snapshotOf({ places: {}, worktrees: [] }))).toBeNull();
  });

  test('rejects a place that is not a record', () => {
    const git = { places: { [placeOf(null, '/work').key]: 'none' }, worktrees: {} };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects a branch that is not a string or null', () => {
    const key = worktreeOf(null, '/work').key;

    const git = {
      places: gitFacts().places,
      worktrees: { [key]: { ...worktree(null, '/work'), branch: 1 } },
    };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  for (const [name, mutate] of malformedFields) {
    test(`rejects ${name}`, () => {
      const { snapshot, key } = validRaw();

      mutate(snapshot, key);

      expect(parseSnapshot(snapshot)).toBeNull();
    });
  }

  test('accepts a detached branch', () => {
    const { snapshot, key } = validRaw();

    worktreeAt(snapshot, key).branch = null;

    const parsed = parseSnapshot(snapshot);

    expect(parsed?.facts.git.worktrees[key]?.branch).toBeNull();
  });

  test('accepts a worktree no place names', () => {
    const { snapshot, key } = validRaw();
    const orphanKey = worktreeOf(null, '/orphan').key;

    worktreesAt(snapshot)[orphanKey] = {
      repository: repositoryOf(null, '/orphan/.git'),
      root: '/orphan',
      branch: 'main',
      linked: false,
    };

    const parsed = parseSnapshot(snapshot);

    expect(Object.keys(parsed?.facts.git.worktrees ?? {})).toEqual([key, orphanKey]);
  });

  test('accepts a place key that is not canonical', () => {
    const { snapshot } = validRaw();

    placesAt(snapshot).notes = { kind: 'none' };

    const parsed = parseSnapshot(snapshot);

    expect(parsed?.facts.git.places['notes']).toEqual({ kind: 'none' });
  });

  test('keeps an own __proto__ place key', () => {
    const stored: unknown = JSON.parse(`{
      "version": 4,
      "revision": 4,
      "facts": {
        "git": {
          "places": { "__proto__": { "kind": "none" } },
          "worktrees": {}
        },
        "pulls": {}
      }
    }`);

    const parsed = parseSnapshot(stored);

    expect(parsed).not.toBeNull();
    expect(Object.keys(placesIn(parsed))).toEqual(['__proto__']);
    expect(Object.hasOwn(placesIn(parsed), '__proto__')).toBe(true);
    expect(placesIn(parsed)['__proto__']).toEqual({ kind: 'none' });

    const serialized = JSON.stringify(parsed);
    const roundTripped: unknown = JSON.parse(serialized);

    expect(Object.keys(placesIn(roundTripped))).toEqual(['__proto__']);
    expect(placesIn(roundTripped)['__proto__']).toEqual({ kind: 'none' });
    expect(roundTripped).toEqual(parsed);
  });
});
