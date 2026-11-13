import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, Status, TabInfo } from 'herdr';

import { readTerminals, rollupStatuses, statusRank } from './statusRollup.ts';

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

const tabOf = (id: string, index: number): TabInfo => ({
  id,
  index,
  name: String(index),
  named: false,
  active: index === 1,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

const spaceOf = (id: string, tabs: TabInfo[]): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: true,
  folder: `/home/me/${id}`,
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
  title: pane,
  cwd: null,
  branch: null,
  status,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

const terminalOf = (address: string, parent: string | null, status: string | null): unknown => ({
  address,
  parent,
  status,
});

const fixtures = (): { spaces: SpaceInfo[]; panes: PaneInfo[] } => ({
  spaces: [spaceOf('s1', [tabOf('k1', 1), tabOf('k2', 2)])],
  panes: [paneOf('p1', 'k1', 'idle'), paneOf('p2', 'k2')],
});

const roll = (terminals: unknown[]): ReturnType<typeof rollupStatuses> => {
  const { spaces, panes } = fixtures();

  return rollupStatuses(spaces, panes, terminals);
};

describe('statusRank', () => {
  test('orders blocked above working above done above idle above null', () => {
    expect(statusRank('blocked')).toBeGreaterThan(statusRank('working'));
    expect(statusRank('working')).toBeGreaterThan(statusRank('done'));
    expect(statusRank('done')).toBeGreaterThan(statusRank('idle'));
    expect(statusRank(null)).toBeLessThan(statusRank('idle'));
  });
});

describe('readTerminals', () => {
  test('reads address, parent, and status from each record', () => {
    expect(readTerminals([terminalOf('t7', 't1', 'working'), { address: 5 }])).toEqual([
      { address: 't7', parent: 't1', status: 'working' },
      { address: '', parent: null, status: null },
    ]);
  });
});

describe('rollupStatuses', () => {
  test('a working background child beats an idle pane', () => {
    const result = roll([
      terminalOf('t-p1', null, 'idle'),
      terminalOf('t-child', 't-p1', 'working'),
    ]);

    expect(result.tabs['k1']).toBe('working');
    expect(result.spaces['s1']).toBe('working');
  });

  test('a working background child beats a done pane', () => {
    const { spaces } = fixtures();
    const panes = [paneOf('p1', 'k1', 'done'), paneOf('p2', 'k2')];
    const result = rollupStatuses(spaces, panes, [terminalOf('t-child', 't-p1', 'working')]);

    expect(result.tabs['k1']).toBe('working');
    expect(result.spaces['s1']).toBe('working');
  });

  test('a blocked pane beats a done pane in the same tab', () => {
    const { spaces } = fixtures();
    const panes = [paneOf('p1', 'k1', 'blocked'), paneOf('p2', 'k1', 'done')];
    const result = rollupStatuses(spaces, panes, []);

    expect(result.tabs['k1']).toBe('blocked');
  });

  test('a grandchild counts for its top pane tab and its space', () => {
    const result = roll([
      terminalOf('t-child', 't-p1', 'idle'),
      terminalOf('t-grandchild', 't-child', 'working'),
    ]);

    expect(result.tabs['k1']).toBe('working');
    expect(result.spaces['s1']).toBe('working');
  });

  test('a parent cycle with no pane contributes nothing', () => {
    const result = roll([terminalOf('t-a', 't-b', 'working'), terminalOf('t-b', 't-a', 'working')]);

    expect(result.tabs['k1']).toBe('idle');
    expect(result.spaces['s1']).toBe('idle');
  });

  test('a terminal that is its own parent contributes nothing', () => {
    const result = roll([terminalOf('t-self', 't-self', 'working')]);

    expect(result.tabs['k1']).toBe('idle');
    expect(result.spaces['s1']).toBe('idle');
  });

  test('a blocked child beats a working one', () => {
    const result = roll([
      terminalOf('t-child', 't-p1', 'working'),
      terminalOf('t-blocked', 't-p1', 'error'),
    ]);

    expect(result.tabs['k1']).toBe('blocked');
  });

  test('a blocked child anywhere blocks its space', () => {
    const result = roll([terminalOf('t-blocked', 't-p2', 'blocked')]);

    expect(result.tabs['k2']).toBe('blocked');
    expect(result.spaces['s1']).toBe('blocked');
  });

  test('a done pane sets its tab and space to done', () => {
    const { spaces } = fixtures();
    const panes = [paneOf('p1', 'k1', 'done'), paneOf('p2', 'k2')];
    const result = rollupStatuses(spaces, panes, []);

    expect(result.tabs['k1']).toBe('done');
    expect(result.spaces['s1']).toBe('done');
  });

  test('a child that is done or idle adds nothing', () => {
    const done = roll([terminalOf('t-child', 't-p1', 'done')]);
    const idle = roll([terminalOf('t-child', 't-p1', 'idle')]);

    expect(done.tabs['k1']).toBe('idle');
    expect(idle.tabs['k1']).toBe('idle');
    expect(done.spaces['s1']).toBe('idle');
  });

  test('a terminal under no pane is ignored', () => {
    const result = roll([terminalOf('t-orphan', 't-missing', 'working')]);

    expect(result.tabs['k1']).toBe('idle');
    expect(result.spaces['s1']).toBe('idle');
  });

  test('a descendant that is itself a pane counts only in its own tab', () => {
    const { spaces } = fixtures();
    const panes = [paneOf('p1', 'k1', 'idle'), paneOf('p2', 'k2', 'blocked')];
    const result = rollupStatuses(spaces, panes, [terminalOf('t-p2', 't-p1', null)]);

    expect(result.tabs['k1']).toBe('idle');
    expect(result.tabs['k2']).toBe('blocked');
  });

  test('answers null when no agent contributes', () => {
    const result = roll([]);

    expect(result.tabs['k2']).toBeNull();
    expect(result.spaces['s1']).toBe('idle');
  });
});
