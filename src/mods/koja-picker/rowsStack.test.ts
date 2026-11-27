import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { PaneInfo } from 'herdr';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTree } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import {
  factsWithStack,
  mergedStack,
  pickerData,
  spaceOf,
  stackFacts,
  stackOf,
  stackPullOf,
  tabOf,
  ticketStack,
} from '../../../tests/pickerFixtures.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import type { Pull } from '../../data/pulls.ts';
import type { Facts } from '../../data/snapshot.ts';
import type { SpaceStack } from '../../data/spaceStack.ts';
import type { PickerData } from './rows.ts';
import { buildRows } from './rows.ts';

interface Range {
  start: number;
  end: number;
}

type DrawRange = (range: Range) => DrawnElement[];

const folder = '/home/me/koja';

const palette = {
  blocked: '#c0392b',
  border: '#999ca7',
  dim: '#525460',
  done: '#2e7d32',
  foreground: '#1e2028',
  muted: '#3a3d4c',
  popover: '#dcdee5',
  working: '#b8860b',
  idle: '#525460',
} as const;

Object.assign(globalThis, { kojaModName: 'koja-picker' });

const virtualList = (
  _id: string,
  count: number,
  _height: number,
  _keyOf: (index: number) => string,
  draw: DrawRange,
): DrawnElement => drawnTree(draw({ start: 0, end: count }));

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_virtual_list: virtualList }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette, shared: () => undefined }));

await mock.module('../../kit/index.ts', () =>
  realKitIndexFake([
    'factLine',
    'icon',
    'listRow',
    'modName',
    'size',
    'statusMark',
    'text',
    'textRole',
    'theme',
    'workIcon',
  ]),
);

const { spaceFacts } = (await import('./spaceFacts.ts')) as {
  spaceFacts: (
    facts: Facts | null,
    spaceList: PickerData['spaces'],
    paneList: PaneInfo[],
  ) => PickerData['facts'];
};

const rowElementsPath = './rowElements.ts';

const { list } = (await import(rowElementsPath)) as {
  list: (
    rows: ReturnType<typeof buildRows>,
    query: string,
    selectedKey: string | null,
    data: PickerData,
    scroll: unknown,
    onItemClick: (key: string) => void,
  ) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const listOf = (query: string, data: PickerData): DrawnElement =>
  list(buildRows(query, null, data), query, null, data, {}, () => undefined);

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

  test('a space whose own name ties the stack match has no reason', () => {
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

const conflictAndReady = (): { stack: SpaceStack; pulls: Pull[] } => {
  const stack = stackOf([
    stackPullOf({ branch: 'me-1-lower', number: 701 }),
    stackPullOf({ branch: 'me-2-top', number: 702 }),
  ]);

  const pulls = [
    pullFacts({
      number: 701,
      headRefName: 'me-1-lower',
      mergeable: 'conflicting',
      mergeState: 'dirty',
    }),
    pullFacts({
      number: 702,
      headRefName: 'me-2-top',
      mergeable: 'mergeable',
      mergeState: 'clean',
      review: 'approved',
      checks: { kind: 'read', value: 'passing' },
      threads: { kind: 'read', value: { unresolved: 0, complete: true } },
    }),
  ];

  return { stack, pulls };
};

// The space sits on the top branch, whose own PR is ready, while the lower PR conflicts.
const dataForStack = (failed: boolean): PickerData => {
  const { stack, pulls } = conflictAndReady();
  const stored = stackFacts(folder, 'me-2-top', stack, pulls, failed);
  const spaces = [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])];
  const panes: PaneInfo[] = [];

  return pickerData({ spaces, panes, stored, facts: spaceFacts(stored, spaces, panes) });
};

describe('the work icon of a space with a stack', () => {
  test("a space's work icon covers its whole stack", () => {
    const found = listOf('', dataForStack(false));

    expect(drawnIcons(found)).toContain('triangle-alert.svg');
  });

  test('a failed PR read draws no work icon even when the stack has a need', () => {
    const found = listOf('', dataForStack(true));

    expect(drawnIcons(found)).toEqual([]);
  });
});
