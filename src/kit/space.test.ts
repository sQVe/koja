import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, TabInfo } from 'herdr';

import { spaceFolder } from './space.ts';

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

const tab: TabInfo = {
  id: 't1',
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
};

const space = (folder: string): SpaceInfo => ({
  id: 's1',
  index: 1,
  name: 'koja',
  named: true,
  folder,
  machine: null,
  branch: null,
  active: true,
  status: null,
  tabs: [tab],
});

const terminal = (pane: string, cwd: string | null): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab: 't1',
  title: 'shell',
  cwd,
  branch: null,
  status: null,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

// Herdr leaves the terminal-only fields out of a mod pane, but its declaration still lists them.
const modPane: PaneInfo = {
  pane: 'm1',
  terminal: null,
  mod: 'koja-gallery',
  tab: 't1',
  title: 'Gallery',
  focused: false,
  zoomed: false,
} as unknown as PaneInfo;

describe('spaceFolder', () => {
  test('reads a later terminal folder when an earlier pane has no cwd', () => {
    expect(spaceFolder(space('/old'), [modPane, terminal('p1', '/new')])).toBe('/new');
  });

  test('skips a terminal whose cwd is empty', () => {
    expect(spaceFolder(space('/old'), [terminal('p1', ''), terminal('p2', '/new')])).toBe('/new');
  });

  test('falls back to the space folder without a live terminal', () => {
    expect(spaceFolder(space('/old'), [modPane, terminal('p1', null)])).toBe('/old');
  });
});
