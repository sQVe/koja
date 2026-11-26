import { describe, expect, test } from 'bun:test';

import { pull, pullsAt, repositoryKey, validRaw } from '../../tests/snapshotRaw.ts';
import type { RawSnapshot } from '../../tests/snapshotRaw.ts';
import { placeOf } from './gitIdentity.ts';
import { parseSnapshot } from './snapshot.ts';

const malformedPulls: [string, (snapshot: RawSnapshot) => void][] = [
  [
    'a pull number that is not a number',
    (snapshot) => {
      pullsAt(snapshot)[repositoryKey] = { pulls: [{ ...pull(), number: '1' }], failed: false };
    },
  ],
  [
    'a pull without a headRefName',
    (snapshot) => {
      pullsAt(snapshot)[repositoryKey] = {
        pulls: [{ number: 1, state: 'OPEN', isDraft: false, title: 'Title' }],
        failed: false,
      };
    },
  ],
  [
    'a failed flag that is not a boolean',
    (snapshot) => {
      pullsAt(snapshot)[repositoryKey] = { pulls: [], failed: 'no' };
    },
  ],
  [
    'a pulls list that is not an array',
    (snapshot) => {
      pullsAt(snapshot)[repositoryKey] = { pulls: {}, failed: false };
    },
  ],
];

describe('parseSnapshot PR facts', () => {
  test('accepts a pull fact for a worktree repository', () => {
    const { snapshot } = validRaw();

    pullsAt(snapshot)[repositoryKey] = { pulls: [pull()], failed: true };

    expect(parseSnapshot(snapshot)?.facts.pulls[repositoryKey]).toEqual({
      pulls: [pull()],
      failed: true,
    });
  });

  test('rejects a stored pull with an extra field', () => {
    const { snapshot } = validRaw();

    pullsAt(snapshot)[repositoryKey] = {
      pulls: [{ ...pull(), extra: true }],
      failed: false,
    };

    expect(parseSnapshot(snapshot)).toBeNull();
  });

  test('rejects a pulls entry with an extra key', () => {
    const { snapshot } = validRaw();

    pullsAt(snapshot)[repositoryKey] = { pulls: [], failed: false, extra: true };

    expect(parseSnapshot(snapshot)).toBeNull();
  });

  test('rejects a pulls key no worktree names', () => {
    const { snapshot } = validRaw();

    pullsAt(snapshot)[placeOf(null, '/other/.git').key] = { pulls: [], failed: false };

    expect(parseSnapshot(snapshot)).toBeNull();
  });

  for (const [name, mutate] of malformedPulls) {
    test(`rejects ${name}`, () => {
      const { snapshot } = validRaw();

      mutate(snapshot);

      expect(parseSnapshot(snapshot)).toBeNull();
    });
  }
});
