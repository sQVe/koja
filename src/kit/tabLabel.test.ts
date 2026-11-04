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

const unnamedTab: TabInfo = { ...tab, name: '2', named: false };

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

const terminalRecord = (pane: string, task: string): unknown => ({
  address: `t-${pane}`,
  labels: { 'tau.task': task },
});

const labelOf = (tabInfo: TabInfo, paneList: PaneInfo[], terminalRecords: unknown[] = []): string =>
  tabLabel(tabInfo, tabProgram(tabInfo, paneList), paneList, terminalRecords);

describe('tabLabel', () => {
  test('labels a tab that holds only a mod pane by its name', () => {
    expect(labelOf(tab, [modPane])).toBe('Board');
  });

  test('keeps the name someone gave a tab', () => {
    const renamed = { ...tab, name: 'tb3' };

    expect(labelOf(renamed, [modPane, terminalPane('p1')])).toBe('tb3');
  });

  test('names an unnamed tab by its terminal program', () => {
    expect(labelOf(unnamedTab, [terminalPane('p1')])).toBe('zsh');
  });

  test('names an unnamed tab by its agent over an earlier shell', () => {
    const agentPane = { ...terminalPane('p2'), program: { ...shell, name: 'claude', agent: true } };

    expect(labelOf(unnamedTab, [terminalPane('p1'), agentPane])).toBe('claude');
  });

  test('falls back to Terminal for an unnamed tab with no terminal', () => {
    expect(labelOf(unnamedTab, [modPane])).toBe('Terminal');
  });

  test('names an unnamed tab with one worker by its task', () => {
    const records = [terminalRecord('p1', 'Fix status counts')];

    expect(labelOf(unnamedTab, [terminalPane('p1')], records)).toBe('Fix status counts');
  });

  test('names an unnamed tab of three workers by the first task and the count of the others', () => {
    const panes = [terminalPane('p1'), terminalPane('p2'), terminalPane('p3')];

    const records = [
      terminalRecord('p1', 'Fix status counts'),
      terminalRecord('p2', 'Write docs'),
      terminalRecord('p3', 'Review'),
    ];

    expect(labelOf(unnamedTab, panes, records)).toBe('Fix status counts +2');
  });

  test('names the manager tab by its program when a worker pane sits beside it', () => {
    const managerRecord = { address: 't-p1', labels: {} };
    const records = [managerRecord, terminalRecord('p2', 'Fix status counts')];

    expect(labelOf(unnamedTab, [terminalPane('p1'), terminalPane('p2')], records)).toBe('zsh');
  });

  test('keeps the name of a named tab whose panes are workers', () => {
    const records = [terminalRecord('p1', 'Fix status counts')];

    expect(labelOf(tab, [terminalPane('p1')], records)).toBe('Board');
  });

  test('ignores mod panes when it checks a tab for workers', () => {
    const records = [terminalRecord('p1', 'Fix status counts')];

    expect(labelOf(unnamedTab, [modPane, terminalPane('p1')], records)).toBe('Fix status counts');
  });

  test('treats an empty task label as no task', () => {
    const records = [terminalRecord('p1', '')];

    expect(labelOf(unnamedTab, [terminalPane('p1')], records)).toBe('zsh');
  });

  test('adds the zoom marker to a zoomed worker tab', () => {
    const zoomed = { ...unnamedTab, zoomed: true };
    const records = [terminalRecord('p1', 'Fix status counts')];

    expect(labelOf(zoomed, [terminalPane('p1')], records)).toBe('Fix status counts Z');
  });
});
