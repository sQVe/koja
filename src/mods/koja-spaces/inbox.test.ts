import { describe, expect, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import { placeOf } from '../../data/gitIdentity.ts';
import type { StackNeed } from '../../data/pullNeeds.ts';
import { inboxGroups, inboxIds } from './inbox.ts';
import type { ShownRow } from './projects.ts';
import type { ListedSpace } from './tree.ts';

const listed = (id: string, status: Status | null): ShownRow => {
  const space: SpaceInfo = {
    id,
    index: 1,
    name: id,
    named: false,
    folder: `/code/${id}`,
    machine: null,
    branch: null,
    active: false,
    status,
    tabs: [],
  };

  return {
    row: { space, git: null, status, place: placeOf(space.machine, space.folder) },
    project: 'koja',
  };
};

describe('inboxGroups', () => {
  test('a blocked space with failing CI sits only in Agent asks', () => {
    const row = listed('review', 'blocked');

    const groups = inboxGroups([row], () => 'failing');

    expect(inboxIds(groups)).toEqual(['review']);
    expect(groups.map((group) => group.id)).toEqual(['asks']);
  });

  test('a space sits in the first group that holds it', () => {
    const blocked = listed('blocked', 'blocked');
    const idle = listed('idle', 'idle');
    const working = listed('working', 'working');
    const done = listed('done', 'done');

    const needs = new Map<ListedSpace, StackNeed>([
      [blocked.row, 'conflict'],
      [idle.row, 'failing'],
    ]);

    const needOf = (row: ListedSpace): StackNeed | null => needs.get(row) ?? null;

    const groups = inboxGroups([blocked, idle, working, done], needOf);

    expect(groups.map((group) => [group.id, group.spaces.map(({ row }) => row.space.id)])).toEqual([
      ['asks', ['blocked']],
      ['pulls', ['idle']],
      ['running', ['working']],
      ['quiet', ['done']],
    ]);
  });

  test('groups keep Projects order and hide when empty', () => {
    const first = listed('first', 'idle');
    const second = listed('second', 'done');
    const third = listed('third', null);

    const groups = inboxGroups([first, second, third], () => null);

    expect(groups.map((group) => group.id)).toEqual(['quiet']);
    expect(inboxIds(groups)).toEqual(['first', 'second', 'third']);
  });

  test('regroups an interleaved Projects order into the fixed group order', () => {
    const quietFirst = listed('quiet-first', 'done');
    const runningFirst = listed('running-first', 'working');
    const quietSecond = listed('quiet-second', 'done');
    const askFirst = listed('ask-first', 'blocked');
    const runningSecond = listed('running-second', 'working');
    const askSecond = listed('ask-second', 'blocked');

    const groups = inboxGroups(
      [quietFirst, runningFirst, quietSecond, askFirst, runningSecond, askSecond],
      () => null,
    );

    expect(groups.map((group) => group.id)).toEqual(['asks', 'running', 'quiet']);

    expect(inboxIds(groups)).toEqual([
      'ask-first',
      'ask-second',
      'running-first',
      'running-second',
      'quiet-first',
      'quiet-second',
    ]);
  });
});
