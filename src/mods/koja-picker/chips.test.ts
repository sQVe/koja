import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { ScrollHandle } from 'gpui-base';
import type { SpaceInfo, Status } from 'herdr';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, clickablesWithText, drawn, drawnTexts } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { PickerData } from './rows.ts';

const palette = {
  border: '#999ca7',
  blocked: '#c0392b',
  dim: '#525460',
  done: '#2e7d32',
  foreground: '#1e2028',
  hover: '#cdd0d7',
  idle: '#525460',
  muted: '#3a3d4c',
  working: '#b8860b',
} as const;

Object.assign(globalThis, { kojaModName: 'koja-picker' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn(), svg: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

await mock.module('../../kit/index.ts', () =>
  realKitIndexFake(['segmentedChip', 'size', 'statusMark', 'theme']),
);

const modulePath = './chips.ts';

const { chips } = (await import(modulePath)) as {
  chips: (
    activeIndex: number,
    data: PickerData,
    scroll: ScrollHandle,
    onChange: (index: number, cx: unknown) => void,
  ) => DrawnElement;
};

const scroll = { scroll_to_item: () => undefined } as unknown as ScrollHandle;

afterAll(() => {
  mock.restore();
});

const spaceOf = (id: string): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: true,
  folder: `/home/me/${id}`,
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs: [],
});

const dataWith = (statuses: (Status | null)[]): PickerData => ({
  spaces: statuses.map((_status, index) => spaceOf(`s${index}`)),
  panes: [],
  terminals: [],
  statuses: {
    spaces: Object.fromEntries(statuses.map((status, index) => [`s${index}`, status])),
    tabs: {},
  },
  stored: null,
  facts: {},
  recent: [],
  focus: {},
});

describe('chips', () => {
  test('each chip counts the spaces in its status', () => {
    const data = dataWith(['blocked', 'done', 'working', 'working', 'idle', 'idle', null]);
    const row = chips(0, data, scroll, () => undefined);

    expect(drawnTexts(row)).toEqual([
      'All',
      '7',
      'Waiting',
      '1',
      'Done',
      '1',
      'Working',
      '2',
      'Idle',
      '2',
    ]);
  });

  test('a filter with no space still shows its chip with a count of zero', () => {
    const row = chips(0, dataWith(['idle']), scroll, () => undefined);
    const waiting = clickablesWithText(row, 'Waiting').at(0);
    const texts = waiting === undefined ? [] : drawnTexts(waiting);

    expect(texts).toEqual(['Waiting', '0']);
  });

  test('a click on a chip asks for that filter', () => {
    const asked: number[] = [];

    const row = chips(0, dataWith(['blocked']), scroll, (index) => {
      asked.push(index);
    });

    const done = clickablesWithText(row, 'Done').at(0);

    expect(done).toBeDefined();

    if (done !== undefined) {
      click(done);
    }

    expect(asked).toEqual([2]);
  });

  test('the strip scrolls sideways and tracks the handle it is given', () => {
    const handle = { scroll_to_item: () => undefined } as unknown as ScrollHandle;
    const row = chips(0, dataWith(['idle']), handle, () => undefined);

    expect(row.styles['overflow_x_scroll']).toEqual([]);
    expect(row.styles['track_scroll']).toEqual([handle]);
  });
});
