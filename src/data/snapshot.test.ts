import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { pullFacts } from '../../tests/pullFacts.ts';
import { isRecord } from '../kit/fields.ts';
import { placeOf, repositoryOf } from './gitIdentity.ts';
import { pullNeeds } from './pullNeeds.ts';
import type { Pull } from './pulls.ts';
import type {
  Facts,
  GitFacts,
  PlaceGit,
  RepositoryPulls,
  Snapshot,
  TicketFacts,
  WorktreeGit,
} from './snapshot.ts';
import { emptyFacts, joinFacts, parseSnapshot } from './snapshot.ts';

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

const snapshotOf = (git: unknown): unknown => ({
  version: 5,
  revision: 4,
  facts: { git, pulls: {}, trackers: {} },
});

const pull = (fields: Partial<Pull> = {}): Pull =>
  pullFacts({ number: 1, headRefName: 'main', title: 'Title', ...fields });

const repositoryKey = keyOf(null, '/work/.git');

const ticketFacts = (): RawRecord => ({
  id: 'ME-1',
  title: 'Title',
  state: 'In Progress',
  url: 'https://linear.app/sqve/issue/ME-1',
  parent: null,
  failed: false,
});

const trackerFacts = (): RawRecord => ({
  workspace: 'sqve',
  tickets: { 'ME-1': ticketFacts() },
  failed: false,
});

const validRaw = () => {
  const key = keyOf(null, '/work');

  const snapshot: RawSnapshot = {
    version: 5,
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
      pulls: {},
      trackers: { [repositoryKey]: trackerFacts() },
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

const rawSnapshotOf = (value: unknown): RawSnapshot => {
  const snapshot = recordIn(value, 'snapshot');

  return {
    version: snapshot.version,
    revision: snapshot.revision,
    facts: recordIn(snapshot.facts, 'facts'),
  };
};

const gitAt = (snapshot: RawSnapshot): RawRecord => recordIn(snapshot.facts.git, 'git');

const pullsAt = (snapshot: RawSnapshot): RawRecord => recordIn(snapshot.facts.pulls, 'pulls');

const trackersAt = (snapshot: RawSnapshot): RawRecord =>
  recordIn(snapshot.facts.trackers, 'trackers');

const trackerAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(trackersAt(snapshot)[key], 'tracker');

const ticketAt = (snapshot: RawSnapshot, repository: string, ticket: string): RawRecord => {
  const tickets = recordIn(trackerAt(snapshot, repository).tickets, 'tickets');

  return recordIn(tickets[ticket], 'ticket');
};

const ticketsAt = (snapshot: RawSnapshot, repository: string): RawRecord =>
  recordIn(trackerAt(snapshot, repository).tickets, 'tickets');

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
  test('reads the version 4 fixture with its PR facts', () => {
    const stored = recordIn(fixture('snapshot-v4.json'), 'snapshot');
    const parsed = parseSnapshot(stored);
    const facts: Facts | undefined = parsed?.facts;
    const git: GitFacts | undefined = facts?.git;
    const pulls: Record<string, RepositoryPulls> | undefined = facts?.pulls;
    const places: PlaceGit[] = Object.values(git?.places ?? {});
    const worktrees: WorktreeGit[] = Object.values(git?.worktrees ?? {});

    expect(parsed?.version).toBe(5);
    expect(parsed?.revision).toBe(9);

    const storedFacts = recordIn(stored.facts, 'facts');
    const storedGit: unknown = storedFacts.git;
    const storedPulls: unknown = storedFacts.pulls;
    const parsedGit: unknown = parsed?.facts.git;
    const parsedPulls: unknown = parsed?.facts.pulls;

    expect(parsedGit).toEqual(storedGit);
    expect(parsedPulls).toEqual(storedPulls);
    expect(parsed?.facts.trackers).toEqual({});

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

  test('rejects an unknown field in version 4 facts', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v4.json'));

    recordIn(stored.facts, 'facts').extra = true;

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('reads version 3 pulls with unread parts', () => {
    const stored = fixture('snapshot-v3.json');
    const parsed = parseSnapshot(stored);
    const pulls = parsed?.facts.pulls[keyOf(null, '/code/koja/.git')]?.pulls ?? [];

    const unread = pullFacts({
      number: 41,
      headRefName: 'main',
      title: 'Read the theme once per turn',
    });

    expect(parsed?.version).toBe(5);
    expect(parsed?.revision).toBe(8);
    expect(pulls).toEqual([unread]);
    expect(pulls.map((entry) => pullNeeds(entry))).toEqual([[]]);
  });

  test('rejects a version 3 pull with a needs field', () => {
    const stored = {
      version: 3,
      revision: 4,
      facts: {
        git: gitFacts(),
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
        git: gitFacts(),
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

    expect(parsed?.version).toBe(5);
    expect(parsed?.revision).toBe(7);
    expect(parsedGit).toEqual(git);
    expect(parsed?.facts.pulls).toEqual({});
    expect(parsed?.facts.trackers).toEqual({});
  });

  test('accepts empty version 2 places and worktrees maps', () => {
    const stored = {
      version: 2,
      revision: 4,
      facts: { git: { places: {}, worktrees: {} } },
    };

    expect(parseSnapshot(stored)).toEqual({
      version: 5,
      revision: 4,
      facts: { git: { places: {}, worktrees: {} }, pulls: {}, trackers: {} },
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

  test('rejects the retired version 1 fixture', () => {
    expect(parseSnapshot(fixture('snapshot-v1.json'))).toBeNull();
  });

  test('reads version 4 with no tracker facts', () => {
    const parsed = parseSnapshot(fixture('snapshot-v5.json'));

    expect(parsed?.facts.trackers).toEqual({});
  });

  test('reads a ticket in the current snapshot', () => {
    const parsed = parseSnapshot(fixture('snapshot-v6.json'));
    const tracker = parsed?.facts.trackers[keyOf(null, '/code/koja/.git')];
    const ticket: TicketFacts | undefined = tracker?.tickets['ME-1'];

    expect(parsed?.version).toBe(5);
    expect(tracker?.workspace).toBe('sqve');
    expect(tracker?.failed).toBe(false);

    expect(ticket).toEqual({
      id: 'ME-1',
      title: 'Title spaces with their Linear tickets',
      state: 'In Progress',
      url: 'https://linear.app/sqve/issue/ME-1/title-spaces-with-their-linear-tickets',
      parent: null,
      failed: false,
    });
  });

  test('rejects a tracker with a missing title', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v6.json'));

    delete ticketAt(stored, keyOf(null, '/code/koja/.git'), 'ME-1').title;

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('rejects an unknown tracker key', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v6.json'));

    trackerAt(stored, keyOf(null, '/code/koja/.git')).extra = true;

    expect(parseSnapshot(stored)).toBeNull();
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
    const stored = { version: 5, revision: 4, facts: emptyFacts(), extra: true };

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

    pullsAt(snapshot)[keyOf(null, '/other/.git')] = { pulls: [], failed: false };

    expect(parseSnapshot(snapshot)).toBeNull();
  });

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

  for (const [name, mutate] of malformedPulls) {
    test(`rejects ${name}`, () => {
      const { snapshot } = validRaw();

      mutate(snapshot);

      expect(parseSnapshot(snapshot)).toBeNull();
    });
  }

  test('rejects a trackers map that is not a record', () => {
    const { snapshot } = validRaw();

    snapshot.facts.trackers = [];

    expect(parseSnapshot(snapshot)).toBeNull();
  });

  const malformedTrackers: [string, (snapshot: RawSnapshot) => void][] = [
    [
      'a tracker that is not a record',
      (snapshot) => {
        trackersAt(snapshot)[repositoryKey] = null;
      },
    ],
    [
      'a tracker workspace that is not a string or null',
      (snapshot) => {
        trackerAt(snapshot, repositoryKey).workspace = 1;
      },
    ],
    [
      'a tracker failed flag that is not a boolean',
      (snapshot) => {
        trackerAt(snapshot, repositoryKey).failed = 'no';
      },
    ],
    [
      'a tickets map that is not a record',
      (snapshot) => {
        trackerAt(snapshot, repositoryKey).tickets = [];
      },
    ],
    [
      'a ticket that is not a record',
      (snapshot) => {
        ticketsAt(snapshot, repositoryKey)['ME-1'] = null;
      },
    ],
    [
      'a ticket without an id',
      (snapshot) => {
        delete ticketAt(snapshot, repositoryKey, 'ME-1').id;
      },
    ],
    [
      'a ticket id that is not a string',
      (snapshot) => {
        ticketAt(snapshot, repositoryKey, 'ME-1').id = 1;
      },
    ],
    [
      'a ticket title that is not a string',
      (snapshot) => {
        ticketAt(snapshot, repositoryKey, 'ME-1').title = 1;
      },
    ],
    [
      'a ticket without a state',
      (snapshot) => {
        delete ticketAt(snapshot, repositoryKey, 'ME-1').state;
      },
    ],
    [
      'a ticket state that is not a string',
      (snapshot) => {
        ticketAt(snapshot, repositoryKey, 'ME-1').state = 1;
      },
    ],
    [
      'a ticket without a url',
      (snapshot) => {
        delete ticketAt(snapshot, repositoryKey, 'ME-1').url;
      },
    ],
    [
      'a ticket url that is not a string',
      (snapshot) => {
        ticketAt(snapshot, repositoryKey, 'ME-1').url = 1;
      },
    ],
    [
      'a ticket parent that is not a string or null',
      (snapshot) => {
        ticketAt(snapshot, repositoryKey, 'ME-1').parent = 1;
      },
    ],
    [
      'a ticket failed flag that is not a boolean',
      (snapshot) => {
        ticketAt(snapshot, repositoryKey, 'ME-1').failed = 'no';
      },
    ],
    [
      'a ticket with an unknown key',
      (snapshot) => {
        ticketAt(snapshot, repositoryKey, 'ME-1').extra = true;
      },
    ],
    [
      'a tracker for a repository no worktree names',
      (snapshot) => {
        trackersAt(snapshot)[keyOf(null, '/other/.git')] = trackerFacts();
      },
    ],
  ];

  for (const [name, mutate] of malformedTrackers) {
    test(`rejects ${name}`, () => {
      const { snapshot } = validRaw();

      mutate(snapshot);

      expect(parseSnapshot(snapshot)).toBeNull();
    });
  }

  test('accepts a ticket with a parent', () => {
    const { snapshot } = validRaw();

    ticketAt(snapshot, repositoryKey, 'ME-1').parent = 'ME-0';

    const parsed = parseSnapshot(snapshot);
    const ticket = parsed?.facts.trackers[repositoryKey]?.tickets['ME-1'];

    expect(ticket?.parent).toBe('ME-0');
  });

  test('accepts empty maps', () => {
    const stored = { version: 5, revision: 4, facts: emptyFacts() } satisfies Snapshot;

    expect(parseSnapshot(stored)).toEqual(stored);
  });

  test('rejects a missing revision', () => {
    expect(parseSnapshot({ version: 5, facts: emptyFacts() })).toBeNull();
  });

  test('rejects a revision that is not a positive whole number', () => {
    expect(parseSnapshot({ version: 5, revision: 0, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 5, revision: 1.5, facts: emptyFacts() })).toBeNull();
    expect(parseSnapshot({ version: 5, revision: '4', facts: emptyFacts() })).toBeNull();
  });

  test('rejects missing facts', () => {
    expect(parseSnapshot({ version: 5, revision: 4 })).toBeNull();
  });

  test('rejects facts that are not a record', () => {
    expect(parseSnapshot({ version: 5, revision: 4, facts: [] })).toBeNull();
  });

  test('rejects a value that is not an object', () => {
    expect(parseSnapshot('snapshot')).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot([snapshotOf(emptyFacts().git)])).toBeNull();
  });
});

describe('joinFacts', () => {
  test('drops PR and tracker facts of a repository with no worktree', () => {
    const named = keyOf(null, '/work/.git');
    const orphan = keyOf(null, '/gone/.git');
    const tracker = { workspace: 'sqve', tickets: {}, failed: false };

    const facts = joinFacts(
      gitFacts(),
      {
        [named]: { pulls: [pull()], failed: false },
        [orphan]: { pulls: [], failed: true },
      },
      { [named]: tracker, [orphan]: { workspace: null, tickets: {}, failed: true } },
    );

    expect(facts.pulls).toEqual({ [named]: { pulls: [pull()], failed: false } });
    expect(facts.trackers).toEqual({ [named]: tracker });
  });
});
