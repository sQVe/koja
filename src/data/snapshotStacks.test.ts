import { describe, expect, test } from 'bun:test';

import { fixture } from '../../tests/fixtureJson.ts';
import {
  branchListAt,
  rawSnapshotOf,
  repositoryKey,
  repositoryStacksAt,
  recordIn,
  stackFacts,
  stackListAt,
  stacksAt,
  validRaw,
} from '../../tests/snapshotRaw.ts';
import type { RawSnapshot } from '../../tests/snapshotRaw.ts';
import { repositoryOf } from './gitIdentity.ts';
import { parseSnapshot } from './snapshot.ts';

const withStacks = (): RawSnapshot => {
  const { snapshot } = validRaw();

  snapshot.facts.stacks = { [repositoryKey]: stackFacts() };

  return snapshot;
};

const malformedStacks: [string, (snapshot: RawSnapshot) => void][] = [
  [
    'a stacks map that is not a record',
    (snapshot) => {
      snapshot.facts.stacks = [];
    },
  ],
  [
    'stacks for a repository no worktree names',
    (snapshot) => {
      stacksAt(snapshot)[repositoryOf(null, '/other/.git').key] = stackFacts();
    },
  ],
  [
    'a repository stacks entry that is not a record',
    (snapshot) => {
      stacksAt(snapshot)[repositoryKey] = null;
    },
  ],
  [
    'a failed flag that is not a boolean',
    (snapshot) => {
      repositoryStacksAt(snapshot, repositoryKey).failed = 'no';
    },
  ],
  [
    'a stacks list that is not a list',
    (snapshot) => {
      repositoryStacksAt(snapshot, repositoryKey).stacks = {};
    },
  ],
  [
    'a repository stacks entry with an unknown key',
    (snapshot) => {
      repositoryStacksAt(snapshot, repositoryKey).extra = true;
    },
  ],
  [
    'a stack that is not a record',
    (snapshot) => {
      stackListAt(snapshot, repositoryKey)[0] = null;
    },
  ],
  [
    'a stack with a missing trunk',
    (snapshot) => {
      delete recordIn(stackListAt(snapshot, repositoryKey)[0], 'stack').trunk;
    },
  ],
  [
    'a stack branches list that is not a list',
    (snapshot) => {
      recordIn(stackListAt(snapshot, repositoryKey)[0], 'stack').branches = {};
    },
  ],
  [
    'a stack with an unknown key',
    (snapshot) => {
      recordIn(stackListAt(snapshot, repositoryKey)[0], 'stack').extra = true;
    },
  ],
  [
    'a branch that is not a record',
    (snapshot) => {
      branchListAt(snapshot, repositoryKey)[0] = null;
    },
  ],
  [
    'a branch with a missing name',
    (snapshot) => {
      delete recordIn(branchListAt(snapshot, repositoryKey)[0], 'branch').branch;
    },
  ],
  [
    'a branch pull number that is not a positive whole number',
    (snapshot) => {
      recordIn(branchListAt(snapshot, repositoryKey)[0], 'branch').pullNumber = 0;
    },
  ],
  [
    'a branch with an unknown restack value',
    (snapshot) => {
      recordIn(branchListAt(snapshot, repositoryKey)[0], 'branch').restack = 'later';
    },
  ],
  [
    'a branch with an unknown key',
    (snapshot) => {
      recordIn(branchListAt(snapshot, repositoryKey)[0], 'branch').extra = true;
    },
  ],
];

describe('parseSnapshot stack facts', () => {
  test('reads the stacks of the current snapshot', () => {
    const parsed = parseSnapshot(fixture('snapshot-v8.json'));
    const key = repositoryOf(null, '/code/koja/.git').key;
    const stack = parsed?.facts.stacks[key]?.stacks[0];

    expect(stack?.trunk).toBe('main');

    expect(stack?.branches[1]).toEqual({
      branch: 'me-1037-draw-the-stack-row',
      pullNumber: null,
      restack: 'needed',
    });
  });

  test('accepts a branch without a pull number', () => {
    const snapshot = withStacks();

    recordIn(branchListAt(snapshot, repositoryKey)[0], 'branch').pullNumber = null;

    expect(parseSnapshot(snapshot)?.facts.stacks[repositoryKey]?.stacks).toHaveLength(1);
  });

  for (const [name, mutate] of malformedStacks) {
    test(`rejects ${name}`, () => {
      const snapshot = withStacks();

      mutate(snapshot);

      expect(parseSnapshot(snapshot)).toBeNull();
    });
  }

  test('rejects a version 6 snapshot that carries stacks', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v6.json'));

    stored.facts.stacks = { [repositoryOf(null, '/code/koja/.git').key]: stackFacts() };

    expect(parseSnapshot(stored)).toBeNull();
  });
});
