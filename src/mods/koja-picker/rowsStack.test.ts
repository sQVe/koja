import { describe, expect, test } from 'bun:test';

import {
  factsWithStack,
  mergedStack,
  pickerData,
  spaceOf,
  stackOf,
  stackPullOf,
  tabOf,
  ticketStack,
} from '../../../tests/pickerFixtures.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import type { Facts } from '../../data/snapshot.ts';
import type { SpaceStack } from '../../data/spaceStack.ts';
import type { PickerData } from './rows.ts';
import { buildRows } from './rows.ts';

const folder = '/home/me/koja';

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

  test('a recorded stack PR keeps its number when a live pull shares its branch', () => {
    const stack = stackOf([stackPullOf({ branch: 'add-search', number: 501, state: 'merged' })]);

    const live = pullFacts({
      number: 900,
      headRefName: 'add-search',
      title: 'Other pull',
      state: 'OPEN',
    });

    const rows = buildRows('501', null, twoSpaces(factsWithStack(folder, stack, [live])));

    expect(rows[0]?.space.id).toBe('a');

    expect(reasonOf(rows, 0)).toEqual({
      value: '#501',
      position: 1,
      total: 1,
      state: null,
    });
  });

  test('a digits query that equals no stack PR and no field finds no space', () => {
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
    const stored = factsWithStack(folder, stackOf([]));

    for (const worktree of Object.values(stored.git.worktrees)) {
      worktree.branch = 'elsewhere';
    }

    const fixture = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored,
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

    expect(buildRows('504', null, fixture)[0]?.space.id).toBe('a');
    expect(buildRows('504', ['blocked'], fixture)).toEqual([]);
  });

  test('a field match stronger than the stack match gives no reason', () => {
    const fixture = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack(folder, stackOf([stackPullOf({ branch: 'xkoja', number: 602 })])),
    });

    expect(reasonOf(buildRows('koja', null, fixture), 0)).toBeNull();
  });

  test('a stack match with no field match gives its reason', () => {
    const fixture = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack(folder, stackOf([stackPullOf({ branch: 'fix-crash', number: 603 })])),
    });

    expect(reasonOf(buildRows('h', null, fixture), 0)).toEqual({
      value: 'fix-crash',
      position: 1,
      total: 1,
      state: 'open',
    });
  });

  test('an empty query gives a space no reason', () => {
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
