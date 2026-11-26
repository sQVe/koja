import { describe, expect, test } from 'bun:test';

import { fixture, keyOf } from '../../tests/fixtures.ts';
import { gitFacts, pull, snapshotOf, validRaw } from '../../tests/snapshotRaw.ts';
import { pullNeeds } from './pullNeeds.ts';
import type {
  Facts,
  GitFacts,
  PlaceGit,
  RepositoryPulls,
  Snapshot,
  WorktreeGit,
} from './snapshot.ts';
import { emptyFacts, joinFacts, parseSnapshot } from './snapshot.ts';

describe('parseSnapshot', () => {
  test('reads the version 4 fixture with its PR facts', () => {
    const stored = fixture('snapshot-v4.json');
    const parsed = parseSnapshot(stored);
    const facts: Facts | undefined = parsed?.facts;
    const git: GitFacts | undefined = facts?.git;
    const pulls: Record<string, RepositoryPulls> | undefined = facts?.pulls;
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

    const read = pulls?.[keyOf(null, '/code/koja/.git')]?.pulls ?? [];

    expect(read.map((entry) => pullNeeds(entry))).toEqual([['ready']]);
  });

  test('accepts empty maps', () => {
    const stored = { version: 4, revision: 4, facts: emptyFacts() } satisfies Snapshot;

    expect(parseSnapshot(stored)).toEqual(stored);
  });

  test('rejects a missing revision', () => {
    expect(parseSnapshot({ version: 4, facts: emptyFacts() })).toBeNull();
  });

  test('rejects a revision that is not a positive whole number', () => {
    expect(parseSnapshot({ version: 4, revision: 0, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 4, revision: 1.5, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 4, revision: '4', facts: emptyFacts() })).toBeNull();
  });

  test('rejects missing facts', () => {
    expect(parseSnapshot({ version: 4, revision: 4 })).toBeNull();
  });

  test('rejects facts that are not a record', () => {
    expect(parseSnapshot({ version: 4, revision: 4, facts: [] })).toBeNull();
  });

  test('rejects a value that is not an object', () => {
    expect(parseSnapshot('snapshot')).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot([snapshotOf(emptyFacts().git)])).toBeNull();
  });

  test('rejects an unknown field in facts', () => {
    const { snapshot } = validRaw();

    snapshot.facts.extra = true;

    expect(parseSnapshot(snapshot)).toBeNull();
  });

  test('rejects an unknown field in the snapshot', () => {
    const stored = { version: 4, revision: 4, facts: emptyFacts(), extra: true };

    expect(parseSnapshot(stored)).toBeNull();
  });
});

describe('joinFacts', () => {
  test('drops PR facts of a repository with no worktree', () => {
    const named = keyOf(null, '/work/.git');
    const orphan = keyOf(null, '/gone/.git');

    const facts = joinFacts(gitFacts(), {
      [named]: { pulls: [pull()], failed: false },
      [orphan]: { pulls: [], failed: true },
    });

    expect(facts.pulls).toEqual({ [named]: { pulls: [pull()], failed: false } });
  });
});
