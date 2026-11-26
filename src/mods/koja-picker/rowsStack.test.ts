import { describe, expect, test } from 'bun:test';

import {
  factsWithStack,
  pickerData,
  spaceOf,
  stackOf,
  stackPullOf,
  tabOf,
} from '../../../tests/pickerFixtures.ts';
import type { Facts } from '../../data/snapshot.ts';
import type { SpaceStack } from '../../data/spaceStack.ts';
import type { PickerData } from './rows.ts';
import { buildRows } from './rows.ts';

const folder = '/home/me/koja';

const branchNames = [
  'add-search',
  'add-search-ui',
  'add-search-tests',
  'fix-crash',
  'fix-crash-tests',
  'layer-one',
  'layer-two',
  'layer-three',
];

const pullNumbers = [501, 504, 505, 506, 507, 508, 509, 510];

const pullAt = (number: number, index: number) => {
  const branch = branchNames[index] ?? `branch-${index}`;
  const state = index === 1 ? 'merged' : 'open';

  return stackPullOf({ branch, number, state });
};

const mergedStack = (): SpaceStack => stackOf(pullNumbers.map(pullAt));

const ticketStack = (): SpaceStack =>
  stackOf([
    stackPullOf({ branch: 'me-1181-bottom', ticket: 'ME-1181', number: 601 }),
    stackPullOf({ branch: 'me-1182-middle', ticket: 'ME-1182', number: 602 }),
    stackPullOf({ branch: 'me-1183-top', ticket: 'ME-1183', number: 603 }),
  ]);

const reasonOf = (rows: ReturnType<typeof buildRows>, index: number) => {
  const row = rows[index];

  if (row?.kind !== 'space') {
    throw new Error(`no space row at ${index}`);
  }

  return row.reason;
};

const twoSpaces = (stored: Facts | null): PickerData =>
  pickerData({
    spaces: [
      spaceOf('b', 1, 'notes', [tabOf('b1', 1, true)]),
      spaceOf('a', 2, 'koja', [tabOf('a1', 1, true)]),
    ],
    panes: [],
    stored,
  });

const withStack = (stack: SpaceStack): PickerData => twoSpaces(factsWithStack(folder, stack));

describe('buildRows with stacks', () => {
  test('searching a PR number finds the space whose stack holds it', () => {
    const rows = buildRows('504', null, withStack(mergedStack()));

    expect(rows[0]?.space.id).toBe('a');

    expect(reasonOf(rows, 0)).toEqual({
      value: '#504',
      position: 2,
      total: 8,
      state: 'merged',
    });
  });

  test('an exact stack PR outranks a space named by the same number', () => {
    const fixture = pickerData({
      spaces: [
        spaceOf('b', 1, '504', [tabOf('b1', 1, true)]),
        spaceOf('a', 2, 'koja', [tabOf('a1', 1, true)]),
      ],
      panes: [],
      stored: factsWithStack(folder, mergedStack()),
    });

    const rows = buildRows('504', null, fixture);

    expect(rows[0]?.space.id).toBe('a');
    expect(reasonOf(rows, 0)?.value).toBe('#504');
  });

  test('a PR number matches only exactly', () => {
    const fixture = withStack(mergedStack());

    expect(buildRows('50', null, fixture)).toEqual([]);
    expect(buildRows('5041', null, fixture)).toEqual([]);
  });

  test('a leading # matches the same PR', () => {
    const plain = buildRows('504', null, withStack(mergedStack()));
    const hash = buildRows('#504', null, withStack(mergedStack()));

    expect(hash.map((row) => row.key)).toEqual(plain.map((row) => row.key));
    expect(reasonOf(hash, 0)).toEqual(reasonOf(plain, 0));
    expect(reasonOf(hash, 0)?.value).toBe('#504');
  });

  test('a ticket ID or branch in the stack finds the space', () => {
    const fixture = withStack(ticketStack());

    expect(buildRows('ME-1182', null, fixture)[0]?.space.id).toBe('a');

    expect(reasonOf(buildRows('ME-1182', null, fixture), 0)).toEqual({
      value: 'ME-1182',
      position: 2,
      total: 3,
      state: 'open',
    });

    expect(reasonOf(buildRows('bottom', null, fixture), 0)).toEqual({
      value: 'me-1181-bottom',
      position: 1,
      total: 3,
      state: 'open',
    });
  });

  test('a space found by its own name has no reason', () => {
    const fixture = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack(folder, stackOf([stackPullOf({ branch: 'koja-old', number: 601 })])),
    });

    expect(buildRows('koja', null, fixture)[0]?.space.id).toBe('a');
    expect(reasonOf(buildRows('koja', null, fixture), 0)).toBeNull();
  });

  test('a space without recorded facts keeps today’s search', () => {
    const fixture = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: null,
    });

    expect(buildRows('koja', null, fixture)[0]?.space.id).toBe('a');
    expect(reasonOf(buildRows('koja', null, fixture), 0)).toBeNull();
  });

  test('a recorded place without a stack gives no stack match', () => {
    const fixture = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack(folder, stackOf([])),
    });

    expect(buildRows('504', null, fixture)).toEqual([]);
  });

  test('a checkout branch outside the stack gives no stack match', () => {
    const stored = factsWithStack(folder, mergedStack());

    for (const worktree of Object.values(stored.git.worktrees)) {
      worktree.branch = 'elsewhere';
    }

    expect(buildRows('504', null, twoSpaces(stored))).toEqual([]);
  });

  test('a space filtered out by status finds no stack match', () => {
    const fixture = withStack(mergedStack());

    expect(buildRows('504', ['blocked'], fixture)).toEqual([]);
  });

  test('sets the reason only when the stack match beats every field of the space', () => {
    const equal = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack(folder, stackOf([stackPullOf({ branch: 'koja-old', number: 601 })])),
    });

    expect(reasonOf(buildRows('koja', null, equal), 0)).toBeNull();

    const betterField = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack(folder, stackOf([stackPullOf({ branch: 'xkoja', number: 602 })])),
    });

    expect(reasonOf(buildRows('koja', null, betterField), 0)).toBeNull();

    const betterStack = pickerData({
      spaces: [{ ...spaceOf('a', 1, '504', [tabOf('a1', 1, true)]), folder }],
      panes: [],
      stored: factsWithStack(folder, stackOf([stackPullOf({ branch: 'add-search', number: 504 })])),
    });

    expect(reasonOf(buildRows('504', null, betterStack), 0)).toEqual({
      value: '#504',
      position: 1,
      total: 1,
      state: 'open',
    });

    const noFieldMatch = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack(folder, stackOf([stackPullOf({ branch: 'fix-crash', number: 603 })])),
    });

    expect(reasonOf(buildRows('h', null, noFieldMatch), 0)).toEqual({
      value: 'fix-crash',
      position: 1,
      total: 1,
      state: 'open',
    });
  });

  test('an empty query gives a space with a stack score 0 and no reason', () => {
    const fixture = pickerData({
      spaces: [{ ...spaceOf('a', 1, '', []), folder: '' }],
      panes: [],
      stored: factsWithStack('', stackOf([stackPullOf({ branch: 'add-search', number: 504 })])),
    });

    const rows = buildRows('', null, fixture);

    expect(rows.map((row) => row.key)).toEqual(['space:a']);
    expect(reasonOf(rows, 0)).toBeNull();
  });
});
