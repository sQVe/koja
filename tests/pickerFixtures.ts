import type { PaneInfo, Program, SpaceInfo, Status, TabInfo } from 'herdr';

import type { StackPull, SpaceStack } from '../src/data/spaceStack.ts';
import { rollupStatuses } from '../src/kit/statusRollup.ts';
import type { PickerData } from '../src/mods/koja-picker/rows.ts';

export const shell: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

export const tabOf = (id: string, index: number, active = false): TabInfo => ({
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

export const spaceOf = (id: string, index: number, name: string, tabs: TabInfo[]): SpaceInfo => ({
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

export const paneOf = (pane: string, tab: string, status: Status | null = null): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab,
  title: `title ${pane}`,
  name: null,
  cwd: null,
  branch: null,
  status,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

const defaultSpaces = (): SpaceInfo[] => [
  spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)]),
  spaceOf('s2', 2, 'notes', [tabOf('n1', 1, true)]),
];

const defaultPanes = (): PaneInfo[] => [
  paneOf('p1', 'k1'),
  paneOf('p2', 'k1', 'blocked'),
  paneOf('p3', 'k2'),
  paneOf('p4', 'n1'),
];

export const pickerData = (
  overrides: Partial<PickerData> = {},
  terminalList: unknown[] = [],
): PickerData => {
  const spaces = overrides.spaces ?? defaultSpaces();
  const panes = overrides.panes ?? defaultPanes();

  return {
    spaces,
    panes,
    terminals: terminalList,
    statuses: rollupStatuses(spaces, panes, terminalList),
    stored: null,
    facts: {},
    recent: [],
    focus: {},
    ...overrides,
  };
};

export const stackPullOf = (fields: Partial<StackPull> & Pick<StackPull, 'branch'>): StackPull => ({
  ticket: null,
  number: null,
  title: null,
  state: 'open',
  checkedOut: false,
  restack: 'none',
  ...fields,
});

export const stackOf = (pulls: StackPull[]): SpaceStack => ({
  pulls,
  merged: pulls.filter((pull) => pull.state === 'merged').length,
  total: pulls.length,
});
