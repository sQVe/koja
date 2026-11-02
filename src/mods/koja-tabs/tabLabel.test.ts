import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, TabInfo } from 'herdr';

import { tabLabel, tabProgram } from './tabLabel.ts';

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
  name: 'Board',
  named: true,
  active: true,
  status: null,
  panes: 2,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
};

const terminalPane = (pane: string): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab: 't1',
  title: 'shell',
  cwd: null,
  branch: null,
  status: null,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

// Herdr leaves program out of a mod pane, but its declaration still lists it.
const modPane: PaneInfo = {
  pane: 'p9',
  terminal: null,
  mod: 'koja-gallery',
  tab: 't1',
  title: 'Gallery',
  focused: false,
  zoomed: false,
} as unknown as PaneInfo;

describe('tabLabel', () => {
  test('labels a tab that holds only a mod pane by its name', () => {
    expect(tabLabel(tab, tabProgram(tab, [modPane]))).toBe('Board');
  });

  test('labels a tab with a mod pane and a terminal by the terminal program', () => {
    const renamed = { ...tab, name: 'tb3' };

    expect(tabLabel(renamed, tabProgram(renamed, [modPane, terminalPane('p1')]))).toBe('zsh');
  });
});
