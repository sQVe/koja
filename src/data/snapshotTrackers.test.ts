import { describe, expect, test } from 'bun:test';

import { fixture } from '../../tests/fixtureJson.ts';
import { keyOf } from '../../tests/gitKey.ts';
import {
  rawSnapshotOf,
  repositoryKey,
  ticketAt,
  ticketsAt,
  trackerAt,
  trackerFacts,
  trackersAt,
  validRaw,
} from '../../tests/snapshotRaw.ts';
import type { RawSnapshot } from '../../tests/snapshotRaw.ts';
import type { TicketFacts } from './snapshot.ts';
import { parseSnapshot } from './snapshot.ts';

const fixtureRepositoryKey = keyOf(null, '/code/koja/.git');

const fixtureTicket = (): TicketFacts => ({
  id: 'ME-1',
  title: 'Title spaces with their Linear tickets',
  state: 'In Progress',
  url: 'https://linear.app/sqve/issue/ME-1/title-spaces-with-their-linear-tickets',
  parent: null,
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
    'a ticket with a retired failed flag',
    (snapshot) => {
      ticketAt(snapshot, repositoryKey, 'ME-1').failed = false;
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

describe('parseSnapshot tracker facts', () => {
  test('drops the retired failed field from a version 5 ticket', () => {
    const parsed = parseSnapshot(fixture('snapshot-v5.json'));
    const tracker = parsed?.facts.trackers[fixtureRepositoryKey];
    const ticket: TicketFacts | undefined = tracker?.tickets['ME-1'];

    expect(parsed?.version).toBe(6);

    expect(ticket).toEqual(fixtureTicket());

    expect(Object.hasOwn(ticket ?? {}, 'failed')).toBe(false);
  });

  test('reads a version 5 ticket saved without a failed field', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v5.json'));

    delete ticketAt(stored, fixtureRepositoryKey, 'ME-1').failed;

    const parsed = parseSnapshot(stored);
    const tracker = parsed?.facts.trackers[fixtureRepositoryKey];
    const ticket: TicketFacts | undefined = tracker?.tickets['ME-1'];

    expect(ticket).toEqual(fixtureTicket());
  });

  test('rejects a version 5 ticket whose failed field is not a boolean', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v5.json'));

    ticketAt(stored, fixtureRepositoryKey, 'ME-1').failed = 'no';

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('reads a ticket in the current snapshot', () => {
    const parsed = parseSnapshot(fixture('snapshot-v6.json'));
    const tracker = parsed?.facts.trackers[fixtureRepositoryKey];
    const ticket: TicketFacts | undefined = tracker?.tickets['ME-1'];

    expect(parsed?.version).toBe(6);
    expect(tracker?.workspace).toBe('sqve');
    expect(tracker?.failed).toBe(false);

    expect(ticket).toEqual(fixtureTicket());
  });

  test('rejects a tracker with a missing title', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v6.json'));

    delete ticketAt(stored, fixtureRepositoryKey, 'ME-1').title;

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('rejects an unknown tracker key', () => {
    const stored = rawSnapshotOf(fixture('snapshot-v6.json'));

    trackerAt(stored, fixtureRepositoryKey).extra = true;

    expect(parseSnapshot(stored)).toBeNull();
  });

  test('rejects a trackers map that is not a record', () => {
    const { snapshot } = validRaw();

    snapshot.facts.trackers = [];

    expect(parseSnapshot(snapshot)).toBeNull();
  });

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
});
