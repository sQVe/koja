import { describe, expect, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import { placeOf } from '../../data/gitIdentity.ts';
import type { StackNeed } from '../../data/pullNeeds.ts';
import { inboxGroups } from './inbox.ts';
import type { ListedSpace } from './tree.ts';

const listed = (id: string, status: Status | null): ListedSpace => {
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

  return { space, git: null, status, place: placeOf(space.machine, space.folder) };
};

const idsOf = (groups: ReturnType<typeof inboxGroups>): string[][] =>
  groups.map((group) => group.spaces.map((row) => row.space.id));

describe('inboxGroups', () => {
  test('a blocked space with failing CI sits only in Agent asks', () => {
    const row = listed('review', 'blocked');

    const groups = inboxGroups([row], () => 'failing');

    expect(idsOf(groups)).toEqual([['review']]);
    expect(groups.map((group) => group.id)).toEqual(['asks']);
  });

  test('a space sits in the first group that holds it', () => {
    const blocked = listed('blocked', 'blocked');
    const idle = listed('idle', 'idle');
    const working = listed('working', 'working');
    const done = listed('done', 'done');

    const needs = new Map<ListedSpace, StackNeed>([
      [blocked, 'conflict'],
      [idle, 'failing'],
    ]);

    const needOf = (row: ListedSpace): StackNeed | null => needs.get(row) ?? null;

    const groups = inboxGroups([blocked, idle, working, done], needOf);

    expect(groups.map((group) => [group.id, group.spaces.map((row) => row.space.id)])).toEqual([
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
    expect(idsOf(groups)).toEqual([['first', 'second', 'third']]);
  });
});
