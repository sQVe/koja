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
    terminals: terminalList,
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
    expect(keysOf(buildRows('', null, data()))).toStrictEqual([
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
    expect(keysOf(buildRows('', ['blocked'], data()))).toStrictEqual([
      'space:s1',
      'tab:k1',
      'pane:p2',
    ]);
  });

  test('keeps an idle space when a background child is working', () => {
    const fixture = data(
      {
        spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
        panes: [paneOf('p1', 'k1'), paneOf('p2', 'k2')],
      },
      [{ address: 't-child', parent: 't-p1', status: 'working' }],
    );

    expect(keysOf(buildRows('', ['working'], fixture))).toStrictEqual(['space:s1', 'tab:k1']);
  });

  test('drops a done space from the done filter when a child works', () => {
    const fixture = data(
      {
        spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
        panes: [paneOf('p1', 'k1', 'done'), paneOf('p2', 'k2')],
      },
      [{ address: 't-child', parent: 't-p1', status: 'working' }],
    );

    expect(keysOf(buildRows('', ['done'], fixture))).toStrictEqual([]);
    expect(keysOf(buildRows('', ['working'], fixture))).toStrictEqual(['space:s1', 'tab:k1']);
  });

  test('keeps only spaces that match the query', () => {
    expect(keysOf(buildRows('nts', null, data()))).toStrictEqual(['space:s2']);
  });

  test('targets the inactive worker tab when the query is its task', () => {
    const fixture = data(
      {
        spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
        panes: [paneOf('p1', 'k1'), paneOf('p2', 'k2')],
      },
      [{ address: 't-p2', labels: { 'tau.task': 'Fix status counts' } }],
    );

    const [spaceRow] = buildRows('Fix status counts', null, fixture);

    expect(spaceRow?.kind).toBe('space');
    expect(spaceRow?.tab?.id).toBe('k2');
    expect(spaceRow?.pane?.pane).toBe('p2');
  });

  test('targets the worker pane whose task matches among two workers in one tab', () => {
    const fixture = data(
      {
        spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true)])],
        panes: [paneOf('p1', 'k1'), paneOf('p2', 'k1')],
      },
      [
        { address: 't-p1', labels: { 'tau.task': 'Fix status counts' } },
        { address: 't-p2', labels: { 'tau.task': 'Write docs' } },
      ],
    );

    const [spaceRow] = buildRows('Write docs', null, fixture);

    expect(spaceRow?.pane?.pane).toBe('p2');
  });

  test('lists a tab that holds only mod panes', () => {
    expect(keysOf(buildRows('', null, withModOnlyTab()))).toStrictEqual([
      'space:s1',
      'tab:k1',
      'tab:k2',
      'space:s2',
    ]);
  });

  test('matches a query against the title of a mod pane', () => {
    expect(keysOf(buildRows('gallery', null, withModOnlyTab()))).toStrictEqual([
      'space:s1',
      'tab:k1',
      'tab:k2',
    ]);
  });

  test('gives a mod pane beside a terminal its own row', () => {
    expect(keysOf(buildRows('', null, withMixedTab()))).toStrictEqual([
      'space:s1',
      'tab:k1',
      'pane:p1',
      'pane:m1',
      'tab:k2',
      'space:s2',
    ]);
  });

  test('labels each row with its kind', () => {
    expect(buildRows('', null, data()).map((row) => row.kind)).toEqual([
      'space',
      'tab',
      'pane',
      'pane',
      'tab',
      'space',
    ]);
  });

  test('matches a space by its status word', () => {
    expect(keysOf(buildRows('needs you', null, data()))).toContain('space:s1');
  });

  test('matches a space by the status word of one of its tabs', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [paneOf('p1', 'k1', 'blocked'), paneOf('p3', 'k2', 'idle')],
    });

    expect(keysOf(buildRows('idle', null, fixture))).toContain('space:s1');
  });

  test('keeps only the panes in the filtered status', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [paneOf('p1', 'k1', 'done'), paneOf('p2', 'k1', 'blocked'), paneOf('p3', 'k2')],
    });

    expect(keysOf(buildRows('', ['blocked'], fixture))).toStrictEqual([
      'space:s1',
      'tab:k1',
      'pane:p2',
    ]);
  });

  test('lists a pane of a tab outside the filter when the pane matches', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [
        paneOf('p1', 'k1', 'done'),
        paneOf('p2', 'k1', 'working'),
        paneOf('p3', 'k2', 'blocked'),
      ],
    });

    expect(keysOf(buildRows('', ['done', 'blocked'], fixture))).toStrictEqual([
      'space:s1',
      'pane:p1',
      'tab:k2',
    ]);
  });

  test('lists the spaces by how well they match the query', () => {
    const fixture = data({
      spaces: [
        spaceOf('a', 2, 'koja', [tabOf('a1', 1, true)]),
        spaceOf('b', 1, 'xkoja', [tabOf('b1', 1, true)]),
      ],
      panes: [],
    });

    expect(keysOf(buildRows('koja', null, fixture))).toStrictEqual(['space:a', 'space:b']);
  });

  test('ranks a space whose name matches above one matched only by its branch', () => {
    const fixture = data({
      spaces: [
        spaceOf('a', 2, 'koja', [tabOf('a1', 1, true)]),
        { ...spaceOf('b', 1, 'xyz', [tabOf('b1', 1, true)]), branch: 'koja' },
      ],
      panes: [],
    });

    expect(keysOf(buildRows('koja', null, fixture))).toStrictEqual(['space:a', 'space:b']);
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

  test('answers no pane for a missing row', () => {
    expect(rowPane(undefined, data())).toBeNull();
  });

  test('answers no pane for a space row without tabs', () => {
    const fixture = data({ spaces: [spaceOf('s1', 1, 'koja', [])], panes: [paneOf('p1', 'k1')] });
    const [row] = buildRows('', null, fixture);

    expect(rowPane(row, fixture)).toBeNull();
  });

  test('targets the most urgent pane of an unfiltered tab row', () => {
    const tabRow = buildRows('', null, data()).find((row) => row.key === 'tab:k1');

    expect(rowPane(tabRow, data())?.pane).toBe('p2');
  });

  test('targets the first pane in the filter of a filtered tab row', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [paneOf('p1', 'k1', 'idle'), paneOf('p2', 'k1', 'blocked'), paneOf('p3', 'k2')],
    });

    const tabRow = buildRows('', ['idle', 'blocked'], fixture).find((row) => row.key === 'tab:k1');

    expect(rowPane(tabRow, fixture)?.pane).toBe('p1');
  });

  test('prefers the pane focused in the tab over the most urgent one', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [
        { ...paneOf('p1', 'k1'), focused: true },
        paneOf('p2', 'k1', 'blocked'),
        paneOf('p3', 'k2'),
      ],
    });

    const tabRow = buildRows('', null, fixture).find((row) => row.key === 'tab:k1');

    expect(rowPane(tabRow, fixture)?.pane).toBe('p1');
  });

  test('targets the pane in the filtered status over a focused pane', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [
        { ...paneOf('p1', 'k1'), focused: true },
        paneOf('p2', 'k1', 'blocked'),
        paneOf('p3', 'k2'),
      ],
    });

    const [spaceRow] = buildRows('', ['blocked'], fixture);

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p2');
  });

  test('targets the tab of a pane the query matches', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [paneOf('p1', 'k1'), { ...paneOf('p2', 'k2'), title: 'Gallery' }],
    });

    const [spaceRow] = buildRows('gallery', null, fixture);

    expect(spaceRow?.tab?.id).toBe('k2');
    expect(rowPane(spaceRow, fixture)?.pane).toBe('p2');
  });

  test('targets the best-scoring pane even when a weaker match comes first', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [
        { ...paneOf('p1', 'k1'), title: 'x-gallery' },
        { ...paneOf('p2', 'k1'), title: 'gallery' },
        paneOf('p3', 'k2'),
      ],
    });

    const [spaceRow] = buildRows('gallery', null, fixture);

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p2');
  });

  test('keeps the pane target empty when the space name scores as well as the pane', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [
        { ...paneOf('p1', 'k1'), cwd: '/work/koja' },
        paneOf('p2', 'k1', 'blocked'),
        paneOf('p3', 'k2'),
      ],
    });

    const [spaceRow] = buildRows('koja', null, fixture);

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p2');
  });

  test('targets a pane that scores above the space name', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'my-koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [
        { ...paneOf('p1', 'k1'), cwd: '/work/koja' },
        paneOf('p2', 'k1', 'blocked'),
        paneOf('p3', 'k2'),
      ],
    });

    const [spaceRow] = buildRows('koja', null, fixture);

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p1');
  });

  test('keeps the pane target empty when the space status word scores as well', () => {
    const fixture = data({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [
        { ...paneOf('p1', 'k1'), title: 'needs you' },
        paneOf('p2', 'k1', 'blocked'),
        paneOf('p3', 'k2'),
      ],
    });

    const [spaceRow] = buildRows('needs you', null, fixture);

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p2');
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

  test('takes the folder name from a path with a trailing slash', () => {
    expect(paneDetail({ ...paneOf('p1', 'k1'), cwd: '/home/me/koja/' })).toBe('koja');
  });

  test('answers nothing for a terminal with no folder or branch', () => {
    expect(paneDetail(paneOf('p1', 'k1'))).toBeNull();
  });
});

describe('tabRowDisplay', () => {
  const tuicr: Program = { ...shell, key: 'tuicr', name: 'tuicr', shell: false, agent: true };
  const tuicrPane = { ...paneOf('p1', 'k1'), program: tuicr, title: 'review' };

  test('labels an unnamed tab by the program it runs', () => {
    expect(tabRowDisplay(tabOf('k1', 1), [tuicrPane], []).label).toBe('tuicr');
  });

  test('takes the icon program from the same program as the label', () => {
    expect(tabRowDisplay(tabOf('k1', 1), [tuicrPane], []).program).toBe(tuicr);
  });

  test('keeps a custom tab name', () => {
    const named = { ...tabOf('k1', 1), name: 'review', named: true };

    expect(tabRowDisplay(named, [tuicrPane], []).label).toBe('review');
  });

  test('adds the zoom marker to a zoomed tab', () => {
    const zoomed = { ...tabOf('k1', 1), zoomed: true };

    expect(tabRowDisplay(zoomed, [tuicrPane], []).label).toBe('tuicr Z');
  });

  test('leaves the pane title out of the label', () => {
    expect(tabRowDisplay(tabOf('k1', 1), [paneOf('p1', 'k1')], []).label).toBe('zsh');
  });

  test('labels an unnamed worker tab by its task', () => {
    const worker = [{ address: 't-p1', labels: { 'tau.task': 'Fix status counts' } }];

    expect(tabRowDisplay(tabOf('k1', 1), [paneOf('p1', 'k1')], worker).label).toBe(
      'Fix status counts',
    );
  });
});

describe('statusCount', () => {
  test('counts spaces in any of the statuses', () => {
    const fixture = data();

    expect(statusCount(['blocked', 'done'], fixture.spaces, fixture.statuses)).toBe(1);
  });
});
