import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnTexts, drawnTree, elementWithText } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { pickerData, spaceOf, stackOf, stackPullOf, tabOf } from '../../../tests/pickerFixtures.ts';
import type { PickerData } from './rows.ts';
import { buildRows } from './rows.ts';

interface Range {
  start: number;
  end: number;
}

type DrawRange = (range: Range) => DrawnElement[];

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

// The real list asks for the visible range; the fake draws all of it so a test can read the tree.
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

const modulePath = './rowElements.ts';

const { list } = (await import(modulePath)) as {
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

const pullNumbers = [501, 502, 503, 504, 505, 506, 507, 508];

const pullAt = (number: number, index: number) => {
  const state = index === 3 ? 'merged' : 'open';

  return stackPullOf({ branch: `branch-${index}`, number, state });
};

const stack = () => stackOf(pullNumbers.map(pullAt));

const dataWith = (stacked: boolean): PickerData => {
  const stackValue = stacked ? stack() : null;

  return pickerData({
    spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
    panes: [],
    facts: { a: { project: 'koja', pull: null, need: null, stack: stackValue } },
  });
};

const listOf = (query: string, data: PickerData): DrawnElement =>
  list(buildRows(query, null, data), query, null, data, {}, () => undefined);

const dataWithState = (state: 'open' | 'unknown'): PickerData =>
  pickerData({
    spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
    panes: [],
    facts: {
      a: {
        project: 'koja',
        pull: null,
        need: null,
        stack: stackOf([
          stackPullOf({ branch: 'me-1181-bottom', ticket: 'ME-1181' }),
          stackPullOf({ branch: 'me-1182-middle', ticket: 'ME-1182', state }),
          stackPullOf({ branch: 'me-1183-top', ticket: 'ME-1183' }),
        ]),
      },
    },
  });

describe('list with a stack reason', () => {
  test('a found space row draws its reason', () => {
    const found = listOf('504', dataWith(true));

    expect(elementWithText(found, '#504')).not.toBeNull();

    const named = listOf('koja', dataWith(true));

    expect(elementWithText(named, '#504')).toBeNull();
  });

  test('a reason with an unknown state leaves out the state', () => {
    const reasonTexts = (data: PickerData): string[] =>
      drawnTexts(listOf('ME-1182', data)).filter((text) => text !== 'koja');

    const unknown = reasonTexts(dataWithState('unknown'));
    const known = reasonTexts(dataWithState('open'));
    const last = unknown.at(-1) ?? '';

    expect(unknown).toHaveLength(known.length - 2);
    expect(last).toContain('2');
    expect(last).toContain('3');
  });
});
