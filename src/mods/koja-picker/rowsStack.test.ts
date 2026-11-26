import { describe, expect, test } from 'bun:test';

import { pickerData, spaceOf, stackOf, stackPullOf, tabOf } from '../../../tests/pickerFixtures.ts';
import type { SpaceStack } from '../../data/spaceStack.ts';
import type { PickerData } from './rows.ts';
import { buildRows } from './rows.ts';
import type { SpaceFacts } from './spaceFacts.ts';

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
    stackPullOf({ branch: 'me-1181-bottom', ticket: 'ME-1181' }),
    stackPullOf({ branch: 'me-1182-middle', ticket: 'ME-1182' }),
    stackPullOf({ branch: 'me-1183-top', ticket: 'ME-1183' }),
  ]);

const factsAt = ([id, stack]: [string, SpaceStack | null]): [string, SpaceFacts] => [
  id,
  { project: id, pull: null, need: null, stack },
];

const factsOf = (stacks: Record<string, SpaceStack | null>): PickerData['facts'] => {
  const entries = Object.entries(stacks).map(factsAt);

  return Object.fromEntries(entries);
};

const reasonOf = (rows: ReturnType<typeof buildRows>, index: number) => {
  const row = rows[index];

  if (row?.kind !== 'space') {
    throw new Error(`no space row at ${index}`);
  }

  return row.reason;
};

const twoSpaces = (stack: SpaceStack | null): PickerData =>
  pickerData({
    spaces: [
      spaceOf('b', 1, 'notes', [tabOf('b1', 1, true)]),
      spaceOf('a', 2, 'koja', [tabOf('a1', 1, true)]),
    ],
    panes: [],
    facts: factsOf({ a: stack, b: null }),
  });

describe('buildRows with stacks', () => {
  test('searching a PR number finds the space whose stack holds it', () => {
    const rows = buildRows('504', null, twoSpaces(mergedStack()));

    expect(rows[0]?.space.id).toBe('a');

    expect(reasonOf(rows, 0)).toEqual({
      value: '#504',
      position: 2,
      total: 8,
      state: 'merged',
    });
  });

  test('a PR number matches only exactly', () => {
    const fixture = twoSpaces(mergedStack());

    expect(buildRows('50', null, fixture)).toEqual([]);
    expect(buildRows('5041', null, fixture)).toEqual([]);
  });

  test('a leading # matches the same PR', () => {
    const plain = buildRows('504', null, twoSpaces(mergedStack()));
    const hash = buildRows('#504', null, twoSpaces(mergedStack()));

    expect(hash.map((row) => row.key)).toEqual(plain.map((row) => row.key));
    expect(reasonOf(hash, 0)).toEqual(reasonOf(plain, 0));
    expect(reasonOf(hash, 0)?.value).toBe('#504');
  });

  test('a ticket ID or branch in the stack finds the space', () => {
    const fixture = twoSpaces(ticketStack());

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
      facts: factsOf({ a: stackOf([stackPullOf({ branch: 'koja-old', number: 601 })]) }),
    });

    expect(buildRows('koja', null, fixture)[0]?.space.id).toBe('a');
    expect(reasonOf(buildRows('koja', null, fixture), 0)).toBeNull();
  });

  test('a space without a stack keeps today’s search', () => {
    const fixture = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      facts: factsOf({ a: null }),
    });

    expect(buildRows('koja', null, fixture)[0]?.space.id).toBe('a');
    expect(reasonOf(buildRows('koja', null, fixture), 0)).toBeNull();
  });

  test('sets the reason only when the stack match beats every field of the space', () => {
    const equal = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      facts: factsOf({ a: stackOf([stackPullOf({ branch: 'koja-old', number: 601 })]) }),
    });

    expect(reasonOf(buildRows('koja', null, equal), 0)).toBeNull();

    const betterField = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      facts: factsOf({ a: stackOf([stackPullOf({ branch: 'xkoja', number: 602 })]) }),
    });

    expect(reasonOf(buildRows('koja', null, betterField), 0)).toBeNull();

    const betterStack = pickerData({
      spaces: [spaceOf('a', 1, '504', [tabOf('a1', 1, true)])],
      panes: [],
      facts: factsOf({ a: stackOf([stackPullOf({ branch: 'add-search', number: 504 })]) }),
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
      facts: factsOf({ a: stackOf([stackPullOf({ branch: 'fix-crash', number: 603 })]) }),
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
      facts: {
        a: {
          project: '',
          pull: null,
          need: null,
          stack: stackOf([stackPullOf({ branch: 'add-search', number: 504 })]),
        },
      },
    });

    const rows = buildRows('', null, fixture);

    expect(rows.map((row) => row.key)).toEqual(['space:a']);
    expect(reasonOf(rows, 0)).toBeNull();
  });
});
