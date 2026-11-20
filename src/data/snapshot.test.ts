import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRecord } from '../kit/fields.ts';
import { placeOf, repositoryOf } from './gitIdentity.ts';
import type { Facts, GitFacts, PlaceGit, Snapshot, WorktreeGit } from './snapshot.ts';
import { emptyFacts, parseSnapshot } from './snapshot.ts';

type RawRecord = Record<string, unknown>;

interface RawSnapshot {
  version: unknown;
  revision: unknown;
  facts: RawRecord;
}

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8'));

const keyOf = (machine: string | null, path: string): string => JSON.stringify([machine, path]);

const worktree = (machine: string | null, root: string): WorktreeGit => ({
  repository: repositoryOf(machine, `${root}/.git`),
  root,
  branch: 'main',
  linked: false,
});

const gitFacts = (): GitFacts => {
  const place = placeOf(null, '/work');

  return {
    places: { [place.key]: { kind: 'repository', worktree: keyOf(null, '/work') } },
    worktrees: { [keyOf(null, '/work')]: worktree(null, '/work') },
  };
};

const snapshotOf = (git: unknown): unknown => ({ version: 2, revision: 4, facts: { git } });

const validRaw = () => {
  const key = keyOf(null, '/work');

  const snapshot: RawSnapshot = {
    version: 2,
    revision: 4,
    facts: {
      git: {
        places: { [key]: { kind: 'repository', worktree: key } },
        worktrees: {
          [key]: {
            repository: {
              machine: null,
              commonDirectory: '/work/.git',
              key: keyOf(null, '/work/.git'),
            },
            root: '/work',
            branch: 'main',
            linked: false,
          },
        },
      },
    },
  };

  return { snapshot, key };
};

const recordIn = (value: unknown, name: string): RawRecord => {
  if (!isRecord(value)) {
    throw new Error(`the valid snapshot has no ${name}`);
  }

  return value;
};

const gitAt = (snapshot: RawSnapshot): RawRecord => recordIn(snapshot.facts.git, 'git');

const placesAt = (snapshot: RawSnapshot): RawRecord => recordIn(gitAt(snapshot).places, 'places');

const worktreesAt = (snapshot: RawSnapshot): RawRecord =>
  recordIn(gitAt(snapshot).worktrees, 'worktrees');

const worktreeAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(worktreesAt(snapshot)[key], 'worktree');

const repositoryAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(worktreeAt(snapshot, key).repository, 'repository');

const placeAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(placesAt(snapshot)[key], 'place');

const placesIn = (value: unknown): RawRecord => {
  const snapshot = recordIn(value, 'snapshot');
  const facts = recordIn(snapshot.facts, 'facts');
  const git = recordIn(facts.git, 'git');

  return recordIn(git.places, 'places');
};

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

describe('parseSnapshot', () => {
  test('reads the version 2 fixture', () => {
    const stored = fixture('snapshot-v2.json');
    const parsed = parseSnapshot(stored);
    const facts: Facts | undefined = parsed?.facts;
    const git: GitFacts | undefined = facts?.git;
    const places: PlaceGit[] = Object.values(git?.places ?? {});
    const worktrees: WorktreeGit[] = Object.values(git?.worktrees ?? {});

    expect(parsed).toEqual(stored as Snapshot);

    expect(places.map((place) => place.kind)).toEqual([
      'repository',
      'repository',
      'none',
      'failed',
    ]);

    expect(worktrees.map((tree) => tree.linked)).toEqual([false, true]);
  });

  test('keeps an own __proto__ place key', () => {
    const stored: unknown = JSON.parse(`{
      "version": 2,
      "revision": 4,
      "facts": {
        "git": {
          "places": { "__proto__": { "kind": "none" } },
          "worktrees": {}
        }
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

  test('rejects the retired version 1 fixture', () => {
    expect(parseSnapshot(fixture('snapshot-v1.json'))).toBeNull();
  });

  test('rejects a newer version', () => {
    expect(parseSnapshot(fixture('snapshot-v3.json'))).toBeNull();
  });

  test('rejects a place that names a missing worktree', () => {
    const git = gitFacts();
    const place = placeOf(null, '/work');

    git.places[place.key] = { kind: 'repository', worktree: keyOf(null, '/missing') };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects a worktree whose key does not match its root', () => {
    const git = gitFacts();
    const place = placeOf(null, '/work');
    const wrongKey = keyOf(null, '/elsewhere');

    git.worktrees = { [wrongKey]: worktree(null, '/work') };
    git.places[place.key] = { kind: 'repository', worktree: wrongKey };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects a repository whose key does not match its commonDirectory', () => {
    const git = gitFacts();
    const key = keyOf(null, '/work');
    const tree = worktree(null, '/work');
    const repository = { ...tree.repository, commonDirectory: '/other/.git' };

    git.worktrees[key] = { ...tree, repository };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects an unknown place kind', () => {
    const git = { places: { [keyOf(null, '/work')]: { kind: 'other' } }, worktrees: {} };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects an unknown field in a worktree', () => {
    const key = keyOf(null, '/work');

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

  test('rejects an unknown field in facts', () => {
    const { snapshot } = validRaw();

    snapshot.facts.extra = true;

    expect(parseSnapshot(snapshot)).toBeNull();
  });

  test('rejects an unknown field in the snapshot', () => {
    const stored = { version: 2, revision: 4, facts: emptyFacts(), extra: true };

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('rejects a places map that is not a record', () => {
    expect(parseSnapshot(snapshotOf({ places: [], worktrees: {} }))).toBeNull();
  });

  test('rejects a worktrees map that is not a record', () => {
    expect(parseSnapshot(snapshotOf({ places: {}, worktrees: [] }))).toBeNull();
  });

  test('rejects a place that is not a record', () => {
    const git = { places: { [keyOf(null, '/work')]: 'none' }, worktrees: {} };

    expect(parseSnapshot(snapshotOf(git))).toBeNull();
  });

  test('rejects a branch that is not a string or null', () => {
    const key = keyOf(null, '/work');

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
    const orphanKey = keyOf(null, '/orphan');

    worktreesAt(snapshot)[orphanKey] = {
      repository: {
        machine: null,
        commonDirectory: '/orphan/.git',
        key: keyOf(null, '/orphan/.git'),
      },
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

  test('accepts empty maps', () => {
    const stored = { version: 2, revision: 4, facts: emptyFacts() } satisfies Snapshot;

    expect(parseSnapshot(stored)).toEqual(stored);
  });

  test('rejects a missing revision', () => {
    expect(parseSnapshot({ version: 2, facts: emptyFacts() })).toBeNull();
  });

  test('rejects a revision that is not a positive whole number', () => {
    expect(parseSnapshot({ version: 2, revision: 0, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 2, revision: 1.5, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 2, revision: '4', facts: emptyFacts() })).toBeNull();
  });

  test('rejects missing facts', () => {
    expect(parseSnapshot({ version: 2, revision: 4 })).toBeNull();
  });

  test('rejects facts that are not a record', () => {
    expect(parseSnapshot({ version: 2, revision: 4, facts: [] })).toBeNull();
  });

  test('rejects a value that is not an object', () => {
    expect(parseSnapshot('snapshot')).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot([snapshotOf(emptyFacts().git)])).toBeNull();
  });
});
