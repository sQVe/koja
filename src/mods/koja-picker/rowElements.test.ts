import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, drawnTree, elementWithText } from '../../../tests/drawn.ts';
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
  stackOf,
  stackPullOf,
  tabOf,
} from '../../../tests/pickerFixtures.ts';
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

const dataWith = (): PickerData => {
  const stored = factsWithStack('/home/me/koja', mergedStack());

  return pickerData({
    spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
    panes: [],
    stored,
    facts: { a: { project: 'koja', pull: null, need: null } },
  });
};

const listOf = (query: string, data: PickerData): DrawnElement =>
  list(buildRows(query, null, data), query, null, data, {}, () => undefined);

const dataWithState = (state: 'open' | 'unknown'): PickerData =>
  pickerData({
    spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
    panes: [],
    stored: factsWithStack(
      '/home/me/koja',
      stackOf([
        stackPullOf({ branch: 'me-1181-bottom', ticket: 'ME-1181', number: 601 }),
        stackPullOf({ branch: 'me-1182-middle', ticket: 'ME-1182', number: 602, state }),
        stackPullOf({ branch: 'me-1183-top', ticket: 'ME-1183', number: 603 }),
      ]),
    ),
  });

describe('list with a stack reason', () => {
  test('a found space row draws its reason', () => {
    const found = listOf('504', dataWith());

    expect(elementWithText(found, '#504')).not.toBeNull();

    const named = listOf('koja', dataWith());

    expect(elementWithText(named, 'koja')).not.toBeNull();
    expect(elementWithText(named, '#504')).toBeNull();
  });

  test('a reason and a work icon both draw on a row with a need', () => {
    const data = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack('/home/me/koja', mergedStack()),
      facts: { a: { project: 'koja', pull: 504, need: 'review' } },
    });

    const found = listOf('504', data);

    expect(elementWithText(found, '#504')).not.toBeNull();
    expect(elementWithText(found, 'PR 2 of 8')).not.toBeNull();
    expect(drawnIcons(found)).toContain('message-square.svg');
  });

  test('a reason with an unknown state leaves out the state', () => {
    const reasonTexts = (data: PickerData): string[] =>
      drawnTexts(listOf('ME-1182', data)).filter((text) => text !== 'koja');

    const unknown = reasonTexts(dataWithState('unknown'));
    const known = reasonTexts(dataWithState('open'));

    expect(unknown).toContain('PR 2 of 3');
    expect(unknown).not.toContain('open');
    expect(known).toContain('open');
  });
});
