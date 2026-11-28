import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, TabInfo } from 'herdr';

import {
  ownName,
  tabLabel,
  tabLabelWithTasks,
  tabName,
  tabProgram,
  taskIndexOf,
  taskOfPane,
} from './tabLabel.ts';

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
  name: null,
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

const liveAgentPane = (pane: string, title: string): PaneInfo => ({
  ...terminalPane(pane),
  title,
  program: { ...shell, key: 'claude', name: 'Claude Code', shell: false, agent: true },
});

const labelOf = (tabInfo: TabInfo, paneList: PaneInfo[], terminalRecords: unknown[] = []): string =>
  tabLabel(tabInfo, tabProgram(tabInfo, paneList), paneList, terminalRecords);

const countingRecords = (records: unknown[]): { records: unknown[]; reads: () => number } => {
  let reads = 0;

  const counted = new Proxy(records, {
    get: (target, key, receiver) => {
      reads += 1;

      return Reflect.get(target, key, receiver) as unknown;
    },
  });

  return { records: counted, reads: () => reads };
};

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

  test('names the tab by its program when a plain terminal follows a worker pane', () => {
    const records = [terminalRecord('p1', 'Fix status counts')];

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

  test('ignores a plain terminal in another tab when it checks a tab for workers', () => {
    const otherTabShell = { ...terminalPane('p2'), tab: 't2' };
    const records = [terminalRecord('p1', 'Fix status counts')];

    expect(labelOf(unnamedTab, [terminalPane('p1'), otherTabShell], records)).toBe(
      'Fix status counts',
    );
  });

  test('ignores a worker terminal in another tab when it names a tab', () => {
    const otherTabWorker = { ...terminalPane('p2'), tab: 't2' };
    const records = [terminalRecord('p2', 'Fix status counts')];

    expect(labelOf(unnamedTab, [terminalPane('p1'), otherTabWorker], records)).toBe('zsh');
  });

  test('keeps the last non-empty task for a terminal address', () => {
    const records = [
      terminalRecord('p1', 'First task'),
      terminalRecord('p1', 'Second task'),
      terminalRecord('p1', ''),
    ];

    expect(labelOf(unnamedTab, [terminalPane('p1')], records)).toBe('Second task');
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

describe('tabLabel live agent titles', () => {
  test('names an unnamed tab of an agent by the work in its live title', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', 'Review the diff')])).toBe('Review the diff');
  });

  test('drops a status glyph before the work', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '✳ Review the diff')])).toBe('Review the diff');
  });

  test('drops a blinking mark before the work', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '[ ! ] Review the diff')])).toBe(
      'Review the diff',
    );
  });

  test('keeps a live title that starts with a bracket', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '[web] login')])).toBe('[web] login');
  });

  test('rejects a live title that holds only a bracket mark', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '[ ! ]')])).toBe('Claude Code');
  });

  test('follows the live title of a tab named after its program', () => {
    const named = { ...tab, name: 'Claude Code' };

    expect(labelOf(named, [liveAgentPane('p1', 'Review the diff')])).toBe('Review the diff');
  });

  test('keeps the name someone gave a tab over the live title', () => {
    expect(labelOf(tab, [liveAgentPane('p1', 'Review the diff')])).toBe('Board');
  });

  test('keeps the worker task over the live title', () => {
    const records = [terminalRecord('p1', 'Fix status counts')];

    expect(labelOf(unnamedTab, [liveAgentPane('p1', 'Review the diff')], records)).toBe(
      'Fix status counts',
    );
  });

  test('rejects a live title that names only the terminal, the program key, or nothing', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', 't-p1')])).toBe('Claude Code');
    expect(labelOf(unnamedTab, [liveAgentPane('p1', 'claude')])).toBe('Claude Code');
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '')])).toBe('Claude Code');
  });

  test('keeps the quotes an agent puts around its live title', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '"Review the diff"')])).toBe(
      '"Review the diff"',
    );

    expect(labelOf(unnamedTab, [liveAgentPane('p1', "'Review the diff'")])).toBe(
      "'Review the diff'",
    );
  });

  test('rejects a live title that is a quoted path', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '"~/code/koja"')])).toBe('Claude Code');
    expect(labelOf(unnamedTab, [liveAgentPane('p1', "'C:\\code'")])).toBe('Claude Code');
  });

  test('rejects a live title that is a path', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', '~/code/koja')])).toBe('Claude Code');
    expect(labelOf(unnamedTab, [liveAgentPane('p1', 'C:\\code')])).toBe('Claude Code');
  });

  test('rejects a live title that holds an at sign', () => {
    expect(labelOf(unnamedTab, [liveAgentPane('p1', 'pi@host')])).toBe('Claude Code');
  });

  test('keeps the program name for a program that is not an agent', () => {
    const pane = { ...terminalPane('p1'), title: 'vim notes.md' };

    expect(labelOf(unnamedTab, [pane])).toBe('zsh');
  });
});

describe('tabName', () => {
  test('reads no terminal records for a tab that keeps its name', () => {
    const counted = countingRecords([terminalRecord('p1', 'Fix status counts')]);

    expect(labelOf(tab, [terminalPane('p1')], counted.records)).toBe('Board');
    expect(counted.reads()).toBe(0);
  });

  test('reads terminal records for a tab that needs a task label', () => {
    const counted = countingRecords([terminalRecord('p1', 'Fix status counts')]);

    expect(labelOf(unnamedTab, [terminalPane('p1')], counted.records)).toBe('Fix status counts');
    expect(counted.reads()).toBeGreaterThan(0);
  });

  test('leaves the zoom marker to the label', () => {
    const zoomed = { ...unnamedTab, zoomed: true };
    const panes = [terminalPane('p1')];

    expect(tabName(zoomed, tabProgram(zoomed, panes), panes, [])).toBe('zsh');
  });
});

describe('ownName', () => {
  test('keeps the name someone gave a tab, unless it repeats the program name', () => {
    expect(ownName(tab, shell)).toBe('Board');
    expect(ownName({ ...tab, name: shell.name }, shell)).toBeNull();
  });

  test('gives no own name to a tab nobody named', () => {
    expect(ownName(unnamedTab, shell)).toBeNull();
  });
});

describe('taskIndexOf', () => {
  test('maps each terminal address to its last non-empty task', () => {
    const tasks = taskIndexOf([
      terminalRecord('p1', 'First task'),
      terminalRecord('p1', 'Second task'),
      terminalRecord('p2', ''),
    ]);

    expect(tasks.get('t-p1')).toBe('Second task');
    expect(tasks.has('t-p2')).toBe(false);
  });
});

describe('lookups with a task index', () => {
  test('labels a worker tab from the index', () => {
    const panes = [terminalPane('p1')];
    const tasks = taskIndexOf([terminalRecord('p1', 'Fix status counts')]);

    expect(tabLabelWithTasks(unnamedTab, tabProgram(unnamedTab, panes), panes, tasks)).toBe(
      'Fix status counts',
    );
  });

  test('finds a pane task through the index', () => {
    const tasks = taskIndexOf([terminalRecord('p1', 'Fix status counts')]);

    expect(taskOfPane(terminalPane('p1'), tasks)).toBe('Fix status counts');
  });
});
