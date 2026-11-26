import { describe, expect, test } from 'bun:test';

import { fixture } from '../../tests/fixtureJson.ts';
import {
  gitFacts,
  pull,
  rawSnapshotOf,
  recordIn,
  snapshotOf,
  validRaw,
  withBareFalse,
  worktreeAt,
} from '../../tests/snapshotRaw.ts';
import { repositoryOf, worktreeOf } from './gitIdentity.ts';
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
    const stored = recordIn(fixture('snapshot-v4.json'), 'snapshot');
    const parsed = parseSnapshot(stored);
    const facts: Facts | undefined = parsed?.facts;
    const git: GitFacts | undefined = facts?.git;
    const pulls: Record<string, RepositoryPulls> | undefined = facts?.pulls;
    const places: PlaceGit[] = Object.values(git?.places ?? {});
    const worktrees: WorktreeGit[] = Object.values(git?.worktrees ?? {});

    expect(parsed?.version).toBe(8);
    expect(parsed?.revision).toBe(9);

    const storedFacts = recordIn(stored.facts, 'facts');
    const storedGit: unknown = storedFacts.git;
    const storedPulls: unknown = storedFacts.pulls;
    const parsedGit: unknown = parsed?.facts.git;
    const parsedPulls: unknown = parsed?.facts.pulls;

    expect(parsedGit).toEqual(withBareFalse(storedGit));
    expect(parsedPulls).toEqual(storedPulls);
    expect(parsed?.facts.trackers).toEqual({});
    expect(parsed?.facts.stacks).toEqual({});

    expect(places.map((place) => place.kind)).toEqual([
      'repository',
      'repository',
      'none',
      'failed',
    ]);

    expect(worktrees.map((tree) => tree.linked)).toEqual([false, true]);

    const read = pulls?.[repositoryOf(null, '/code/koja/.git').key]?.pulls ?? [];

    expect(read.map((entry) => pullNeeds(entry))).toEqual([['ready']]);
  });

  test('rejects an unknown field in version 4 facts', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v4.json'));

    recordIn(stored.facts, 'facts').extra = true;

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('accepts empty maps', () => {
    const stored = { version: 8, revision: 4, facts: emptyFacts() } satisfies Snapshot;

    expect(parseSnapshot(stored)).toEqual(stored);
  });

  test('a version 7 snapshot treats every worktree as a checkout', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v8.json'));
    const key = worktreeOf(null, '/code/koja').key;
    delete worktreeAt(stored, key).bare;

    const parsed = parseSnapshot({ ...stored, version: 7 });

    expect(parsed?.version).toBe(8);
    expect(parsed?.facts.git.worktrees[key]?.bare).toBe(false);
  });

  test('a version 6 snapshot reads with empty stacks', () => {
    const stored = recordIn(fixture('snapshot-v6.json'), 'snapshot');
    const parsed = parseSnapshot(stored);

    expect(parsed?.version).toBe(8);
    expect(parsed?.facts.stacks).toEqual({});
  });

  test('a version 7 snapshot keeps its stacks', () => {
    const stored = recordIn(fixture('snapshot-v8.json'), 'snapshot');
    const parsed = parseSnapshot(stored);
    const key = repositoryOf(null, '/code/koja/.git').key;

    expect(parsed?.version).toBe(8);
    expect(parsed?.facts.stacks[key]?.failed).toBe(false);

    expect(parsed?.facts.stacks[key]?.stacks).toEqual([
      {
        trunk: 'main',
        branches: [
          {
            branch: 'me-1037-read-each-spaces-stack-from-gh-stack',
            pullNumber: 141,
            restack: 'none',
          },
          { branch: 'me-1037-draw-the-stack-row', pullNumber: null, restack: 'needed' },
        ],
      },
    ]);
  });

  test('rejects a missing revision', () => {
    expect(parseSnapshot({ version: 8, facts: emptyFacts() })).toBeNull();
  });

  test('rejects a revision that is not a positive whole number', () => {
    expect(parseSnapshot({ version: 8, revision: 0, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 8, revision: 1.5, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 8, revision: '4', facts: emptyFacts() })).toBeNull();
  });

  test('rejects missing facts', () => {
    expect(parseSnapshot({ version: 8, revision: 4 })).toBeNull();
  });

  test('rejects facts that are not a record', () => {
    expect(parseSnapshot({ version: 8, revision: 4, facts: [] })).toBeNull();
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
    const stored = { version: 8, revision: 4, facts: emptyFacts(), extra: true };

    expect(parseSnapshot(stored)).toBeNull();
  });
});

describe('joinFacts', () => {
  test('drops PR, tracker, and stack facts of a repository with no worktree', () => {
    const named = repositoryOf(null, '/work/.git').key;
    const orphan = repositoryOf(null, '/gone/.git').key;
    const tracker = { workspace: 'sqve', tickets: {}, failed: false };

    const facts = joinFacts(
      gitFacts(),
      {
        [named]: { pulls: [pull()], failed: false },
        [orphan]: { pulls: [], failed: true },
      },
      { [named]: tracker, [orphan]: { workspace: null, tickets: {}, failed: true } },
      {
        [named]: { stacks: [], failed: false },
        [orphan]: { stacks: [], failed: true },
      },
    );

    expect(facts.pulls).toEqual({ [named]: { pulls: [pull()], failed: false } });
    expect(facts.trackers).toEqual({ [named]: tracker });
    expect(facts.stacks).toEqual({ [named]: { stacks: [], failed: false } });
  });
});
