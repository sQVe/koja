import { describe, expect, test } from 'bun:test';

import { fixture } from '../../tests/fixtureJson.ts';
import {
  gitFacts,
  pull,
  pullsAt,
  rawSnapshotOf,
  recordIn,
  repositoryKey,
  snapshotOf,
  validRaw,
  withBareFalse,
  worktreeAt,
  worktreesAt,
} from '../../tests/snapshotRaw.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { Facts, GitFacts, PlaceGit, Snapshot, WorktreeGit } from './snapshot.ts';
import { emptyFacts, joinFacts, parseSnapshot, worktreeKeyAtPlace } from './snapshot.ts';

describe('parseSnapshot', () => {
  test('reads the version 4 fixture with its PR facts', () => {
    const stored = recordIn(fixture('snapshot-v4.json'), 'snapshot');
    const parsed = parseSnapshot(stored);
    const facts: Facts | undefined = parsed?.facts;
    const git: GitFacts | undefined = facts?.git;
    const places: PlaceGit[] = Object.values(git?.places ?? {});
    const worktrees: WorktreeGit[] = Object.values(git?.worktrees ?? {});

    expect(parsed?.version).toBe(9);
    expect(parsed?.revision).toBe(9);

    const storedFacts = recordIn(stored.facts, 'facts');
    const storedGit: unknown = storedFacts.git;
    const parsedGit: unknown = parsed?.facts.git;

    expect(parsedGit).toEqual(withBareFalse(storedGit));
    expect(parsed?.facts.pulls).toEqual({});
    expect(parsed?.facts.trackers).toEqual({});
    expect(parsed?.facts.stacks).toEqual({});

    expect(places.map((place) => place.kind)).toEqual([
      'repository',
      'repository',
      'none',
      'failed',
    ]);

    expect(worktrees.map((tree) => tree.linked)).toEqual([false, true]);
  });

  test('rejects an unknown field in version 4 facts', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v4.json'));

    recordIn(stored.facts, 'facts').extra = true;

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('accepts empty maps', () => {
    const stored = { version: 9, revision: 4, facts: emptyFacts() } satisfies Snapshot;

    expect(parseSnapshot(stored)).toEqual(stored);
  });

  test('a version 7 snapshot infers bareness from the paths', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v8.json'));
    const checkoutKey = worktreeOf(null, '/code/koja').key;
    const checkout = worktreeAt(stored, checkoutKey);
    const worktrees = worktreesAt(stored);

    delete checkout.bare;

    worktrees[worktreeOf(null, '/code/bare.git').key] = {
      repository: {
        machine: null,
        commonDirectory: '/code/bare.git',
        key: repositoryOf(null, '/code/bare.git').key,
      },
      root: '/code/bare.git',
      branch: 'main',
      linked: false,
    };

    worktrees[worktreeOf(null, '/code/bare/').key] = {
      repository: {
        machine: null,
        commonDirectory: '/code/bare',
        key: repositoryOf(null, '/code/bare').key,
      },
      root: '/code/bare/',
      branch: 'main',
      linked: false,
    };

    worktrees[worktreeOf(null, '/code/project').key] = {
      repository: {
        machine: null,
        commonDirectory: '/code/project/.bare',
        key: repositoryOf(null, '/code/project/.bare').key,
      },
      root: '/code/project',
      branch: 'main',
      linked: false,
    };

    worktrees[worktreeOf(null, '/code/project/me-1').key] = {
      repository: {
        machine: null,
        commonDirectory: '/code/project/.bare',
        key: repositoryOf(null, '/code/project/.bare').key,
      },
      root: '/code/project/me-1',
      branch: 'me-1',
      linked: true,
    };

    const parsed = parseSnapshot({ ...stored, version: 7 });
    const parsedWorktrees = parsed?.facts.git.worktrees ?? {};

    const barenessOf = (root: string): boolean | undefined =>
      parsedWorktrees[worktreeOf(null, root).key]?.bare;

    expect(parsed?.version).toBe(9);
    expect(barenessOf('/code/koja')).toBe(false);
    expect(barenessOf('/code/bare.git')).toBe(true);
    expect(barenessOf('/code/bare/')).toBe(true);
    expect(barenessOf('/code/project')).toBe(true);
    expect(barenessOf('/code/project/me-1')).toBe(false);
  });

  test('a version 6 snapshot reads with empty stacks', () => {
    const stored = recordIn(fixture('snapshot-v6.json'), 'snapshot');
    const parsed = parseSnapshot(stored);

    expect(parsed?.version).toBe(9);
    expect(parsed?.facts.stacks).toEqual({});
  });

  test('a version 8 snapshot keeps its git, tracker, and stack facts and drops its pulls', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v8.json'));
    const facts = recordIn(stored.facts, 'facts');
    const key = repositoryOf(null, '/code/koja/.git').key;
    const storedPulls = recordIn(pullsAt(stored)[key], 'repository pulls').pulls;

    const parsed = parseSnapshot(stored);
    const storedGit: unknown = facts.git;
    const storedTrackers: unknown = facts.trackers;
    const storedStacks: unknown = facts.stacks;
    const parsedGit: unknown = parsed?.facts.git;
    const parsedTrackers: unknown = parsed?.facts.trackers;
    const parsedStacks: unknown = parsed?.facts.stacks;

    expect(storedPulls).toHaveLength(1);
    expect(parsed?.version).toBe(9);
    expect(parsed?.facts.pulls).toEqual({});
    expect(parsedGit).toEqual(withBareFalse(storedGit));
    expect(parsedTrackers).toEqual(storedTrackers);
    expect(parsedStacks).toEqual(storedStacks);
  });

  test('reads the frozen version 9 fixture with its pull URL', () => {
    const stored = recordIn(fixture('snapshot-v9.json'), 'snapshot');
    const key = repositoryOf(null, '/code/koja/.git').key;
    const parsed = parseSnapshot(stored);
    const pulls = parsed?.facts.pulls[key]?.pulls ?? [];
    const parsedFacts: unknown = parsed?.facts;
    const storedFacts: unknown = stored.facts;

    expect(parsed?.version).toBe(9);
    expect(parsed?.revision).toBe(12);
    expect(parsedFacts).toEqual(storedFacts);
    expect(pulls.map((entry) => entry.url)).toEqual(['https://github.com/sqve/koja/pull/143']);
  });

  test("a version 9 snapshot round-trips each pull's URL", () => {
    const { snapshot } = validRaw();
    const url = 'https://github.com/example/example/pull/1';

    pullsAt(snapshot)[repositoryKey] = { pulls: [pull({ url })], failed: false };

    const parsed = parseSnapshot(snapshot);

    expect(parsed?.version).toBe(9);
    expect(parsed?.facts.pulls[repositoryKey]?.pulls.map((entry) => entry.url)).toEqual([url]);
  });

  test('a version 8 snapshot keeps its stacks', () => {
    const stored = recordIn(fixture('snapshot-v8.json'), 'snapshot');
    const parsed = parseSnapshot(stored);
    const key = repositoryOf(null, '/code/koja/.git').key;

    expect(parsed?.version).toBe(9);
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
    expect(parseSnapshot({ version: 9, facts: emptyFacts() })).toBeNull();
  });

  test('rejects a revision that is not a positive whole number', () => {
    expect(parseSnapshot({ version: 9, revision: 0, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 9, revision: 1.5, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 9, revision: '4', facts: emptyFacts() })).toBeNull();
  });

  test('rejects missing facts', () => {
    expect(parseSnapshot({ version: 9, revision: 4 })).toBeNull();
  });

  test('rejects facts that are not a record', () => {
    expect(parseSnapshot({ version: 9, revision: 4, facts: [] })).toBeNull();
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
    const stored = { version: 9, revision: 4, facts: emptyFacts(), extra: true };

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

describe('worktreeKeyAtPlace', () => {
  test('gives the worktree of a repository place and none for another kind', () => {
    const repositoryPlace = placeOf(null, '/code/koja');
    const plainPlace = placeOf(null, '/code/plain');

    const git: GitFacts = {
      places: {
        [repositoryPlace.key]: { kind: 'repository', worktree: 'worktree-key' },
        [plainPlace.key]: { kind: 'none' },
      },
      worktrees: {},
    };

    expect(worktreeKeyAtPlace(git, repositoryPlace.key)).toBe('worktree-key');
    expect(worktreeKeyAtPlace(git, plainPlace.key)).toBeNull();
    expect(worktreeKeyAtPlace(git, placeOf(null, '/code/unknown').key)).toBeNull();
  });
});
