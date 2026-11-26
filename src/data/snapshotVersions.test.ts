import { describe, expect, test } from 'bun:test';

import { fixture } from '../../tests/fixtureJson.ts';
import { pullFacts } from '../../tests/pullFacts.ts';
import {
  recordIn,
  repositoryKey,
  version3GitFacts,
  withBareFalse,
} from '../../tests/snapshotRaw.ts';
import { repositoryOf } from './gitIdentity.ts';
import { pullNeeds } from './pullNeeds.ts';
import { parseSnapshot } from './snapshot.ts';

describe('parseSnapshot versions', () => {
  test('reads version 3 pulls with unread parts', () => {
    const stored = fixture('snapshot-v3.json');
    const parsed = parseSnapshot(stored);
    const pulls = parsed?.facts.pulls[repositoryOf(null, '/code/koja/.git').key]?.pulls ?? [];

    const unread = pullFacts({
      number: 41,
      headRefName: 'main',
      title: 'Read the theme once per turn',
    });

    expect(parsed?.version).toBe(8);
    expect(parsed?.revision).toBe(8);
    expect(pulls).toEqual([unread]);
    expect(pulls.map((entry) => pullNeeds(entry))).toEqual([[]]);
  });

  test('rejects a version 3 pull with a needs field', () => {
    const stored = {
      version: 3,
      revision: 4,
      facts: {
        git: version3GitFacts(),
        pulls: {
          [repositoryKey]: {
            pulls: [
              {
                number: 1,
                state: 'OPEN',
                isDraft: false,
                title: 'Title',
                headRefName: 'main',
                checks: { kind: 'unread' },
              },
            ],
            failed: false,
          },
        },
      },
    };

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('rejects a version 3 pull with an extra field', () => {
    const stored = {
      version: 3,
      revision: 4,
      facts: {
        git: version3GitFacts(),
        pulls: {
          [repositoryKey]: {
            pulls: [
              {
                number: 1,
                state: 'OPEN',
                isDraft: false,
                title: 'Title',
                headRefName: 'main',
                extra: true,
              },
            ],
            failed: false,
          },
        },
      },
    };

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('reads the version 2 fixture without PR facts', () => {
    const stored = recordIn(fixture('snapshot-v2.json'), 'snapshot');
    const git: unknown = recordIn(stored.facts, 'facts').git;
    const parsed = parseSnapshot(stored);
    const parsedGit: unknown = parsed?.facts.git;

    expect(parsed?.version).toBe(8);
    expect(parsed?.revision).toBe(7);
    expect(parsedGit).toEqual(withBareFalse(git));
    expect(parsed?.facts.pulls).toEqual({});
    expect(parsed?.facts.trackers).toEqual({});
    expect(parsed?.facts.stacks).toEqual({});
  });

  test('accepts empty version 2 places and worktrees maps', () => {
    const stored = {
      version: 2,
      revision: 4,
      facts: { git: { places: {}, worktrees: {} } },
    };

    expect(parseSnapshot(stored)).toEqual({
      version: 8,
      revision: 4,
      facts: { git: { places: {}, worktrees: {} }, pulls: {}, trackers: {}, stacks: {} },
    });
  });

  test('rejects an unknown field in version 2 facts', () => {
    const stored = {
      version: 2,
      revision: 4,
      facts: { git: { places: {}, worktrees: {} }, extra: true },
    };

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('rejects a version 2 revision that is not a positive whole number', () => {
    const facts = { git: { places: {}, worktrees: {} } };

    expect(parseSnapshot({ version: 2, revision: 0, facts })).toBeNull();
    expect(parseSnapshot({ version: 2, revision: 1.5, facts })).toBeNull();
    expect(parseSnapshot({ version: 2, revision: '4', facts })).toBeNull();
  });

  test('rejects an unknown field in a version 2 snapshot', () => {
    const facts = { git: { places: {}, worktrees: {} } };

    expect(parseSnapshot({ version: 2, revision: 4, facts, extra: true })).toBeNull();
  });

  test('rejects a version 2 snapshot without a revision', () => {
    const facts = { git: { places: {}, worktrees: {} } };

    expect(parseSnapshot({ version: 2, facts })).toBeNull();
  });

  test('rejects a version 2 snapshot without facts', () => {
    expect(parseSnapshot({ version: 2, revision: 4 })).toBeNull();
  });

  test('rejects version 2 facts that are not a record', () => {
    expect(parseSnapshot({ version: 2, revision: 4, facts: [] })).toBeNull();
  });

  test('rejects the retired version 1 fixture', () => {
    expect(parseSnapshot(fixture('snapshot-v1.json'))).toBeNull();
  });
});
