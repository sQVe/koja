import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, Status, TabInfo } from 'herdr';

import { rollupStatuses } from '../../kit/statusRollup.ts';
import type { PickerData } from './rows.ts';
import { buildRows, paneDetail, paneLabel, rowPane, statusCount, tabRowDisplay } from './rows.ts';

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

const data = (overrides: Partial<PickerData> = {}, terminalList: unknown[] = []): PickerData => {
  const spaces = overrides.spaces ?? defaultSpaces();
  const panes = overrides.panes ?? defaultPanes();

  return {
    spaces,
    panes,
    statuses: rollupStatuses(spaces, panes, terminalList),
    recent: [],
    focus: {},
    ...overrides,
  };
};

// Herdr leaves program out of a mod pane, but its declaration still lists it.
const modPaneOf = (pane: string, tab: string, title: string): PaneInfo =>
  ({
    pane,
    terminal: null,
    mod: 'koja-gallery',
    tab,
    title,
    focused: false,
    zoomed: false,
  }) as unknown as PaneInfo;

const withModOnlyTab = (): PickerData =>
  data({ panes: [paneOf('p1', 'k1'), modPaneOf('m1', 'k2', 'Gallery')] });

const withMixedTab = (): PickerData =>
  data({ panes: [paneOf('p1', 'k1'), modPaneOf('m1', 'k1', 'Gallery')] });

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

  test('keeps an idle space when a background child is working', () => {
    const fixture = data(
      {
        spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
        panes: [paneOf('p1', 'k1'), paneOf('p2', 'k2')],
      },
      [{ address: 't-child', parent: 't-p1', status: 'working' }],
    );

    expect(keysOf(buildRows('', ['working'], fixture))).toEqual(['space:s1', 'tab:k1']);
  });

  test('drops a done space from the done filter when a child works', () => {
    const fixture = data(
      {
        spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
        panes: [paneOf('p1', 'k1', 'done'), paneOf('p2', 'k2')],
      },
      [{ address: 't-child', parent: 't-p1', status: 'working' }],
    );

    expect(keysOf(buildRows('', ['done'], fixture))).toEqual([]);
    expect(keysOf(buildRows('', ['working'], fixture))).toEqual(['space:s1', 'tab:k1']);
  });

  test('keeps only spaces that match the query', () => {
    expect(keysOf(buildRows('nts', null, data()))).toEqual(['space:s2']);
  });

  test('lists a tab that holds only mod panes', () => {
    expect(keysOf(buildRows('', null, withModOnlyTab()))).toEqual([
      'space:s1',
      'tab:k1',
      'tab:k2',
      'space:s2',
    ]);
  });

  test('matches a query against the title of a mod pane', () => {
    expect(keysOf(buildRows('gallery', null, withModOnlyTab()))).toEqual([
      'space:s1',
      'tab:k1',
      'tab:k2',
    ]);
  });

  test('gives a mod pane beside a terminal its own row', () => {
    expect(keysOf(buildRows('', null, withMixedTab()))).toEqual([
      'space:s1',
      'tab:k1',
      'pane:p1',
      'pane:m1',
      'tab:k2',
      'space:s2',
    ]);
  });
});

describe('rowPane', () => {
  test('resolves a matched mod pane through the space row', () => {
    const mixed = withMixedTab();
    const [spaceRow] = buildRows('gallery', null, mixed);

    expect(rowPane(spaceRow, mixed)?.pane).toBe('m1');
  });

  test('keeps the active tab when the query matches the space name', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, false), tabOf('k2', 2, true)])],
      panes: [
        { ...paneOf('p1', 'k1'), cwd: '/work/koja' },
        { ...paneOf('p2', 'k2'), cwd: '/work/koja' },
      ],
    });

    const [row] = buildRows('koja', null, fixture);

    expect(row?.tab?.id).toBe('k2');
    expect(rowPane(row, fixture)?.pane).toBe('p2');
  });

  test('keeps the active tab when two panes tie on a partial space-name match', () => {
    const fixture = data({
      spaces: [
        {
          ...spaceOf('s1', 1, 'my-koja', [tabOf('k1', 1, false), tabOf('k2', 2, true)]),
          folder: '/work/project',
        },
      ],
      panes: [
        { ...paneOf('p1', 'k1'), cwd: '/work/koja' },
        { ...paneOf('p2', 'k2'), cwd: '/work/koja' },
      ],
    });

    const [row] = buildRows('koja', null, fixture);

    expect(row?.tab?.id).toBe('k2');
    expect(rowPane(row, fixture)?.pane).toBe('p2');
  });

  test('keeps the active tab when two panes share the matching program', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, false), tabOf('k2', 2, true)])],
      panes: [paneOf('p1', 'k1'), paneOf('p2', 'k2')],
    });

    const [row] = buildRows('zsh', null, fixture);

    expect(row?.tab?.id).toBe('k2');
    expect(rowPane(row, fixture)?.pane).toBe('p2');
  });

  test('targets a pane when only its field matches', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2, false)])],
      panes: [{ ...paneOf('p1', 'k1'), title: 'Gallery' }, paneOf('p2', 'k2')],
    });

    const [row] = buildRows('gallery', null, fixture);

    expect(row?.tab?.id).toBe('k1');
    expect(rowPane(row, fixture)?.pane).toBe('p1');
  });

  test('gives a filtered space row the first pane in that status', () => {
    const [spaceRow] = buildRows('', ['blocked'], data());

    expect(rowPane(spaceRow, data())?.pane).toBe('p2');
  });

  test('targets the non-active tab whose background child matches the filter', () => {
    const fixture = data(
      {
        spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
        panes: [paneOf('p1', 'k1'), paneOf('p2', 'k2')],
      },
      [{ address: 't-child', parent: 't-p2', status: 'working' }],
    );

    const [spaceRow] = buildRows('', ['working'], fixture);

    expect(spaceRow?.tab?.id).toBe('k2');
    expect(rowPane(spaceRow, fixture)?.pane).toBe('p2');
  });

  test('prefers the pane last focused in the tab, then the most urgent one', () => {
    const [spaceRow] = buildRows('', null, data());

    expect(rowPane(spaceRow, data({ focus: { k1: 'p1' } }))?.pane).toBe('p1');
    expect(rowPane(spaceRow, data())?.pane).toBe('p2');
  });
});

describe('paneLabel', () => {
  test('names a terminal by its program and title', () => {
    expect(paneLabel(paneOf('p1', 'k1'))).toBe('zsh · title p1');
  });

  test('names a mod pane by its title without a program', () => {
    expect(paneLabel(modPaneOf('m1', 'k1', 'Gallery'))).toBe('Gallery');
  });
});

describe('paneDetail', () => {
  test('joins a terminal folder and branch', () => {
    const pane = { ...paneOf('p1', 'k1'), cwd: '/home/me/koja', branch: 'main' };

    expect(paneDetail(pane)).toBe('koja · main');
  });

  test('answers nothing for a mod pane', () => {
    expect(paneDetail(modPaneOf('m1', 'k1', 'Gallery'))).toBeNull();
  });
});

describe('tabRowDisplay', () => {
  const tuicr: Program = { ...shell, key: 'tuicr', name: 'tuicr', shell: false, agent: true };
  const tuicrPane = { ...paneOf('p1', 'k1'), program: tuicr, title: 'review' };

  test('labels an unnamed tab by the program it runs', () => {
    expect(tabRowDisplay(tabOf('k1', 1), [tuicrPane]).label).toBe('tuicr');
  });

  test('takes the icon program from the same program as the label', () => {
    expect(tabRowDisplay(tabOf('k1', 1), [tuicrPane]).program).toBe(tuicr);
  });

  test('keeps a custom tab name', () => {
    const named = { ...tabOf('k1', 1), name: 'review', named: true };

    expect(tabRowDisplay(named, [tuicrPane]).label).toBe('review');
  });

  test('adds the zoom marker to a zoomed tab', () => {
    const zoomed = { ...tabOf('k1', 1), zoomed: true };

    expect(tabRowDisplay(zoomed, [tuicrPane]).label).toBe('tuicr Z');
  });

  test('leaves the pane title out of the label', () => {
    expect(tabRowDisplay(tabOf('k1', 1), [paneOf('p1', 'k1')]).label).toBe('zsh');
  });
});

describe('statusCount', () => {
  test('counts spaces in any of the statuses', () => {
    const fixture = data();

    expect(statusCount(['blocked', 'done'], fixture.spaces, fixture.statuses)).toBe(1);
  });
});
