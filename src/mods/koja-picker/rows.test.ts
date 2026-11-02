import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, Status, TabInfo } from 'herdr';

import type { PickerData } from './rows.ts';
import { buildRows, rowPane, statusCount } from './rows.ts';

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

const tabOf = (id: string, index: number, active = false): TabInfo => ({
  id,
  index,
  name: String(index),
  named: false,
  active,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

const spaceOf = (id: string, index: number, name: string, tabs: TabInfo[]): SpaceInfo => ({
  id,
  index,
  name,
  named: true,
  folder: `/home/me/${name}`,
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs,
});

const paneOf = (pane: string, tab: string, status: Status | null = null): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab,
  title: `title ${pane}`,
  cwd: null,
  branch: null,
  status,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

const data = (overrides: Partial<PickerData> = {}): PickerData => ({
  spaces: [
    spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)]),
    spaceOf('s2', 2, 'notes', [tabOf('n1', 1, true)]),
  ],
  panes: [
    paneOf('p1', 'k1'),
    paneOf('p2', 'k1', 'blocked'),
    paneOf('p3', 'k2'),
    paneOf('p4', 'n1'),
  ],
  recent: [],
  focus: {},
  ...overrides,
});

const keysOf = (rows: { key: string }[]): string[] => rows.map((row) => row.key);

describe('buildRows', () => {
  test('lists tabs of spaces with several tabs, and panes of tabs with several panes', () => {
    expect(keysOf(buildRows('', null, data()))).toEqual([
      'space:s1',
      'tab:k1',
      'pane:p1',
      'pane:p2',
      'tab:k2',
      'space:s2',
    ]);
  });

  test('puts recent spaces first', () => {
    const rows = buildRows('', null, data({ recent: ['s2'] }));

    expect(rows[0]?.key).toBe('space:s2');
  });

  test('keeps only spaces, tabs, and panes in the filtered status', () => {
    expect(keysOf(buildRows('', ['blocked'], data()))).toEqual(['space:s1', 'tab:k1', 'pane:p2']);
  });

  test('keeps only spaces that match the query', () => {
    expect(keysOf(buildRows('nts', null, data()))).toEqual(['space:s2']);
  });
});

describe('rowPane', () => {
  test('gives a filtered space row the first pane in that status', () => {
    const [spaceRow] = buildRows('', ['blocked'], data());

    expect(rowPane(spaceRow, data())?.pane).toBe('p2');
  });

  test('prefers the pane last focused in the tab, then the most urgent one', () => {
    const [spaceRow] = buildRows('', null, data());

    expect(rowPane(spaceRow, data({ focus: { k1: 'p1' } }))?.pane).toBe('p1');
    expect(rowPane(spaceRow, data())?.pane).toBe('p2');
  });
});

describe('statusCount', () => {
  test('counts terminal panes in any of the statuses', () => {
    expect(statusCount(['blocked', 'done'], data().panes)).toBe(1);
  });
});
