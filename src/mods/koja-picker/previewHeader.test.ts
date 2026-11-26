import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, TabInfo } from 'herdr';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { PickerData } from './rows.ts';

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

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette, shared: () => undefined }));

await mock.module('../../kit/index.ts', () =>
  realKitIndexFake([
    'fileStatus',
    'icon',
    'palette',
    'paneHeader',
    'size',
    'statusMark',
    'text',
    'textRole',
    'theme',
  ]),
);

const modulePath = './previewHeader.ts';

const { previewHeader, previewTargetOf } = (await import(modulePath)) as {
  previewHeader: (target: unknown) => DrawnElement;
  previewTargetOf: (data: PickerData, paneId: string | null) => unknown;
};

afterAll(() => {
  mock.restore();
});

const shell: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

const tabOf = (id: string): TabInfo => ({
  id,
  index: 1,
  name: '1',
  named: false,
  active: true,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

const spaceOf = (tabs: TabInfo[]): SpaceInfo => ({
  id: 's1',
  index: 1,
  name: 'koja',
  named: true,
  folder: '/code/koja',
  machine: null,
  branch: null,
  active: true,
  status: null,
  tabs,
});

const terminalPane = (): PaneInfo => ({
  pane: 'p1',
  terminal: 't1',
  tab: 'k1',
  title: 'Pi',
  cwd: '/code/koja',
  branch: 'me-1189-go-to',
  status: 'working',
  app: null,
  program: shell,
  focused: true,
  zoomed: false,
  movable: true,
});

// Herdr leaves branch, status, and program out of a mod pane's record.
const modPane = (): PaneInfo =>
  ({
    pane: 'm1',
    terminal: null,
    mod: 'koja-gallery',
    tab: 'k2',
    title: 'Gallery',
    focused: false,
    zoomed: false,
  }) as unknown as PaneInfo;

const dataWith = (paneList: PaneInfo[]): PickerData => ({
  spaces: [spaceOf([tabOf('k1'), tabOf('k2')])],
  panes: paneList,
  terminals: [],
  statuses: { spaces: {}, tabs: {} },
  facts: {},
  recent: [],
  focus: {},
});

const headerOf = (paneList: PaneInfo[], paneId: string): DrawnElement =>
  previewHeader(previewTargetOf(dataWith(paneList), paneId));

describe('previewHeader', () => {
  test('names the space, the pane, and the whole branch of a terminal', () => {
    const header = headerOf([terminalPane()], 'p1');

    expect(drawnTexts(header)).toEqual(['koja', 'Pi', 'me-1189-go-to']);
    expect(drawnIcons(header)).toContain('git-branch.svg');
  });

  test('draws a mod pane without a branch or a status', () => {
    const header = headerOf([modPane()], 'm1');

    expect(drawnTexts(header)).toEqual(['koja', 'Gallery']);
    expect(drawnIcons(header)).not.toContain('git-branch.svg');
  });

  test('draws an empty band for a pane whose tab belongs to no space', () => {
    const header = headerOf([{ ...terminalPane(), tab: 'k9' }], 'p1');

    expect(drawnTexts(header)).toEqual([]);
  });

  test('draws an empty band for a row with no pane', () => {
    const header = previewHeader(previewTargetOf(dataWith([terminalPane()]), null));

    expect(drawnTexts(header)).toEqual([]);
  });
});
