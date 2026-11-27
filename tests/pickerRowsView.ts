import { mock } from 'bun:test';

import type { PickerData } from '../src/mods/koja-picker/rows.ts';
import { buildRows } from '../src/mods/koja-picker/rows.ts';
import type { DrawnElement } from './drawn.ts';
import { drawn, drawnTree } from './drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake, realKitIndexFake } from './moduleFakes.ts';
import type { SavedGlobals } from './savedGlobals.ts';
import { restoreGlobals, saveGlobals } from './savedGlobals.ts';

interface Range {
  start: number;
  end: number;
}

type DrawRange = (range: Range) => DrawnElement[];

interface RowList {
  list: (
    rows: ReturnType<typeof buildRows>,
    query: string,
    selectedKey: string | null,
    data: PickerData,
    scroll: unknown,
    onItemClick: (key: string) => void,
  ) => DrawnElement;
}

export interface PickerRows {
  listOf: (query: string, data: PickerData) => DrawnElement;
}

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

const virtualList = (
  _id: string,
  count: number,
  _height: number,
  _keyOf: (index: number) => string,
  draw: DrawRange,
): DrawnElement => drawnTree(draw({ start: 0, end: count }));

const kitParts = [
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
];

let savedGlobals: SavedGlobals = new Map();

export const setupPickerRows = async (): Promise<PickerRows> => {
  savedGlobals = saveGlobals(['kojaModName']);
  Object.assign(globalThis, { kojaModName: 'koja-picker' });

  await mock.module('gpui-base', () =>
    gpuiBaseFake({ h_flex: () => drawn(), v_virtual_list: virtualList }),
  );

  await mock.module('gpui-kit', () =>
    gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
  );

  await mock.module('herdr', () => herdrFake({ theme: () => palette, shared: () => undefined }));

  await mock.module('../src/kit/index.ts', () => realKitIndexFake(kitParts));

  const modulePath = '../src/mods/koja-picker/rowElements.ts';

  const { list } = (await import(modulePath)) as RowList;

  const listOf = (query: string, data: PickerData): DrawnElement =>
    list(buildRows(query, null, data), query, null, data, {}, () => undefined);

  return { listOf };
};

export const restorePickerRows = (): void => {
  restoreGlobals(savedGlobals);
  savedGlobals = new Map();
  mock.restore();
};
