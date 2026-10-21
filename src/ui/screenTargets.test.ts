import { expect, it } from 'bun:test';

import type { StoreSnapshot } from '../client/client.ts';
import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import {
  placementOf,
  statusBarLine,
  tabAt,
  tabEntry,
  tabLabelsOf,
  targetAt,
  targetNear,
  visibleStart,
  workspaceAt,
} from './screenTargets.ts';
import type { Placement } from './screenTargets.ts';

const area = (x: number, y: number, columns: number, rows: number) => ({ x, y, columns, rows });

// Two framed panes beside a 20-column side list.
const placement: Placement = {
  rectangles: [
    { paneId: paneId(1), ...area(0, 0, 30, 10), terminal: area(1, 1, 28, 8) },
    { paneId: paneId(2), ...area(30, 0, 30, 10), terminal: area(31, 1, 28, 8) },
  ],
  size: { columns: 60, rows: 10 },
  focusedPaneId: paneId(1),
  offset: 20,
};

it('maps an outer cell to the pane under it and its local cell', () => {
  expect(targetAt(placement, 21, 1)).toEqual({ paneId: paneId(1), column: 0, row: 0 });
  expect(targetAt(placement, 51, 8)).toEqual({ paneId: paneId(2), column: 0, row: 7 });
  expect(targetAt(placement, 78, 8)).toEqual({ paneId: paneId(2), column: 27, row: 7 });
});

it('hits nothing on the side list, a border, or beyond the panes', () => {
  expect(targetAt(placement, 5, 3)).toBeUndefined();
  expect(targetAt(placement, 20, 3)).toBeUndefined();
  expect(targetAt(placement, 49, 3)).toBeUndefined();
  expect(targetAt(placement, 25, 0)).toBeUndefined();
  expect(targetAt(placement, 25, 9)).toBeUndefined();
  expect(targetAt(placement, 25, 10)).toBeUndefined();
  expect(targetAt(placement, 90, 3)).toBeUndefined();
});

it('clamps a cell outside a pane to the nearest cell of that pane', () => {
  expect(targetNear(placement, paneId(1), 70, 20)).toEqual({
    paneId: paneId(1),
    column: 27,
    row: 7,
  });

  expect(targetNear(placement, paneId(2), 0, 0)).toEqual({ paneId: paneId(2), column: 0, row: 0 });
  expect(targetNear(placement, paneId(3), 25, 3)).toBeUndefined();
});

const pane = (number: number) => ({ kind: 'pane' as const, paneId: paneId(number) });

it('hits only the zoomed pane, over the whole pane area', () => {
  const workspace = workspaceId(1);

  const snapshot = {
    revision: 1,
    workspaces: [{ id: workspace, root: '/work', label: 'work', tabIds: [tabId(1)] }],
    tabs: [
      {
        id: tabId(1),
        workspaceId: workspace,
        layout: {
          kind: 'split' as const,
          direction: 'right' as const,
          ratio: 0.5,
          first: pane(1),
          second: pane(2),
        },
        focusedPaneId: paneId(2),
        zoomedPaneId: paneId(2),
      },
    ],
    panes: [],
    defaultView: {
      focusedWorkspaceId: workspace,
      activeTabs: [{ workspaceId: workspace, tabId: tabId(1) }],
    },
    attachedClientId: clientId(1),
    foregroundClientId: undefined,
    clients: [],
  } as unknown as StoreSnapshot;

  const zoomed = placementOf(snapshot, { columns: 80, rows: 24 });

  expect(targetAt(zoomed, 20, 0)).toEqual({ paneId: paneId(2), column: 0, row: 0 });
  expect(targetAt(zoomed, 79, 22)).toEqual({ paneId: paneId(2), column: 59, row: 22 });
  expect(targetAt(zoomed, 30, 5)?.paneId).toBe(paneId(2));
});

const listSnapshot = (workspaceCount: number, focused: number, tabCount: number) =>
  ({
    revision: 1,
    workspaces: Array.from({ length: workspaceCount }, (_, index) => ({
      id: workspaceId(index + 1),
      root: '/work',
      label: `w${index + 1}`,
      tabIds: Array.from({ length: tabCount }, (_unused, tab) => tabId(tab + 1)),
    })),
    tabs: [],
    panes: [],
    defaultView: {
      focusedWorkspaceId: workspaceId(focused),
      activeTabs: [{ workspaceId: workspaceId(focused), tabId: tabId(2) }],
    },
    attachedClientId: clientId(1),
    foregroundClientId: undefined,
    clients: [],
  }) as unknown as StoreSnapshot;

const terminal = { columns: 80, rows: 6 };

it('hits the workspace in a side list row', () => {
  const snapshot = listSnapshot(3, 1, 1);

  expect(workspaceAt(snapshot, terminal, { x: 0, y: 0 })).toBe(workspaceId(1));
  expect(workspaceAt(snapshot, terminal, { x: 19, y: 2 })).toBe(workspaceId(3));
});

it('hits nothing beside the rows, the list, or the status bar', () => {
  const snapshot = listSnapshot(3, 1, 1);

  expect(workspaceAt(snapshot, terminal, { x: 0, y: 3 })).toBeUndefined();
  expect(workspaceAt(snapshot, terminal, { x: 20, y: 0 })).toBeUndefined();
  expect(workspaceAt(snapshot, terminal, { x: 0, y: 5 })).toBeUndefined();

  expect(workspaceAt(listSnapshot(3, 1, 1), { columns: 40, rows: 6 }, { x: 0, y: 0 })).toBe(
    undefined,
  );
});

it('hits the drawn workspace when the list is scrolled to keep the focus in view', () => {
  const snapshot = listSnapshot(8, 8, 1);

  expect(workspaceAt(snapshot, terminal, { x: 3, y: 0 })).toBe(workspaceId(4));
  expect(workspaceAt(snapshot, terminal, { x: 3, y: 4 })).toBe(workspaceId(8));
});

it('hits the tab whose status bar label is under the cell', () => {
  const snapshot = listSnapshot(1, 1, 3);

  // INSERT [2] 3 reads: "INSERT 1 [2] 3" with the labels at columns 7, 9, and 13.
  expect(statusBarLine('insert', tabLabelsOf(snapshot, 'insert'))).toBe('INSERT 1 [2] 3');
  expect(tabAt(snapshot, 'insert', terminal, { x: 7, y: 5 })).toBe(1);
  expect(tabAt(snapshot, 'insert', terminal, { x: 10, y: 5 })).toBe(2);
  expect(tabAt(snapshot, 'insert', terminal, { x: 13, y: 5 })).toBe(3);
});

it('hits a named tab across its whole drawn label', () => {
  const snapshot = {
    ...listSnapshot(1, 1, 3),
    tabs: [{ id: tabId(1), label: 'build' }],
  } as unknown as StoreSnapshot;

  expect(statusBarLine('insert', tabLabelsOf(snapshot, 'insert'))).toBe('INSERT 1:build [2] 3');
  expect(tabAt(snapshot, 'insert', terminal, { x: 13, y: 5 })).toBe(1);
  expect(tabAt(snapshot, 'insert', terminal, { x: 15, y: 5 })).toBe(2);
  expect(tabAt(snapshot, 'insert', terminal, { x: 19, y: 5 })).toBe(3);
});

it('hits the second tab when the first tab label has wide characters', () => {
  const snapshot = {
    ...listSnapshot(1, 1, 3),
    tabs: [{ id: tabId(1), label: '日本語' }],
  } as unknown as StoreSnapshot;

  expect(statusBarLine('insert', tabLabelsOf(snapshot, 'insert'))).toBe('INSERT 1:日本語 [2] 3');
  expect(tabAt(snapshot, 'insert', terminal, { x: 14, y: 5 })).toBe(1);
  expect(tabAt(snapshot, 'insert', terminal, { x: 16, y: 5 })).toBe(2);
  expect(tabAt(snapshot, 'insert', terminal, { x: 18, y: 5 })).toBe(2);
  expect(tabAt(snapshot, 'insert', terminal, { x: 20, y: 5 })).toBe(3);
});

it('hits no tab on the mode name, a gap, past the last label, or another row', () => {
  const snapshot = listSnapshot(1, 1, 3);

  expect(tabAt(snapshot, 'insert', terminal, { x: 2, y: 5 })).toBeUndefined();
  expect(tabAt(snapshot, 'insert', terminal, { x: 8, y: 5 })).toBeUndefined();
  expect(tabAt(snapshot, 'insert', terminal, { x: 14, y: 5 })).toBeUndefined();
  expect(tabAt(snapshot, 'insert', terminal, { x: 7, y: 4 })).toBeUndefined();
});

it('hits chrome by the live terminal size, not the size the server last heard', () => {
  const snapshot = {
    ...listSnapshot(8, 8, 3),
    clients: [{ id: clientId(1), size: { columns: 80, rows: 6 } }],
  } as unknown as StoreSnapshot;

  const live = { columns: 40, rows: 10 };

  expect(workspaceAt(snapshot, live, { x: 0, y: 0 })).toBeUndefined();
  expect(tabAt(snapshot, 'insert', live, { x: 7, y: 9 })).toBe(1);
  expect(tabAt(snapshot, 'insert', live, { x: 7, y: 5 })).toBeUndefined();
});

it('hits the side list rows of a live terminal taller than the server size', () => {
  const snapshot = {
    ...listSnapshot(8, 8, 1),
    clients: [{ id: clientId(1), size: { columns: 80, rows: 6 } }],
  } as unknown as StoreSnapshot;

  expect(workspaceAt(snapshot, { columns: 80, rows: 10 }, { x: 3, y: 0 })).toBe(workspaceId(1));
});

it('shows a labeled tab as number and label, in brackets when active', () => {
  expect(tabEntry(2, 'build', true)).toBe('[2:build]');
  expect(tabEntry(3, 'logs', false)).toBe('3:logs');
});

it('shows an unlabeled tab as its number only', () => {
  expect(tabEntry(1, undefined, true)).toBe('[1]');
  expect(tabEntry(4, undefined, false)).toBe('4');
});

const twoTabSnapshot = (activeTab: number | undefined, clients: unknown[] = []) =>
  ({
    revision: 1,
    workspaces: [
      { id: workspaceId(1), root: '/work', label: 'work', tabIds: [tabId(1), tabId(2)] },
    ],
    tabs: [1, 2].map((number) => ({
      id: tabId(number),
      workspaceId: workspaceId(1),
      layout: pane(number),
      focusedPaneId: paneId(number),
      zoomedPaneId: undefined,
    })),
    panes: [],
    defaultView: {
      focusedWorkspaceId: workspaceId(1),
      activeTabs:
        activeTab === undefined ? [] : [{ workspaceId: workspaceId(1), tabId: tabId(activeTab) }],
    },
    attachedClientId: clientId(1),
    foregroundClientId: undefined,
    clients,
  }) as unknown as StoreSnapshot;

it('places panes by the size the server knows for this client', () => {
  const clients = [
    { id: clientId(2), size: { columns: 50, rows: 12 } },
    { id: clientId(1), size: { columns: 100, rows: 30 } },
  ];

  const placed = placementOf(twoTabSnapshot(1, clients), { columns: 80, rows: 24 });

  expect(placed.size).toEqual({ columns: 80, rows: 29 });
  expect(placed.offset).toBe(20);
});

it('places the panes of the active tab, not the first tab', () => {
  const placed = placementOf(twoTabSnapshot(2), { columns: 80, rows: 24 });

  expect(placed.rectangles.map((rectangle) => rectangle.paneId)).toEqual([paneId(2)]);
  expect(placed.focusedPaneId).toBe(paneId(2));
});

it('places no panes and no focus when the workspace has no active tab', () => {
  const placed = placementOf(twoTabSnapshot(undefined), { columns: 80, rows: 24 });

  expect(placed.rectangles).toEqual([]);
  expect(placed.focusedPaneId).toBeUndefined();
});

it('keeps the side list offset when mapping a drag outside the pane to a column', () => {
  expect(targetNear(placement, paneId(1), 25, 3)).toEqual({
    paneId: paneId(1),
    column: 4,
    row: 2,
  });
});

it('scrolls the side list only as far as the focus needs', () => {
  expect(visibleStart(10, 2, 4)).toBe(0);
  expect(visibleStart(10, 5, 4)).toBe(2);
  expect(visibleStart(10, 9, 4)).toBe(6);
});

it('hits no workspace on rows above the list or on the status bar row of a long list', () => {
  const short = { columns: 80, rows: 4 };

  expect(workspaceAt(listSnapshot(8, 1, 1), short, { x: 0, y: 3 })).toBeUndefined();
  expect(workspaceAt(listSnapshot(8, 8, 1), short, { x: 0, y: -1 })).toBeUndefined();
  expect(workspaceAt(listSnapshot(8, 8, 1), short, { x: -1, y: 0 })).toBeUndefined();
  expect(workspaceAt(listSnapshot(8, 1, 1), short, { x: 0, y: 2 })).toBe(workspaceId(3));
});

it('shows the tabs of the focused workspace only', () => {
  const snapshot = {
    ...listSnapshot(2, 2, 1),
    workspaces: [
      { id: workspaceId(1), root: '/a', label: 'a', tabIds: [tabId(1)] },
      { id: workspaceId(2), root: '/b', label: 'b', tabIds: [tabId(2), tabId(3)] },
    ],
  } as unknown as StoreSnapshot;

  expect(tabLabelsOf(snapshot, 'insert').map((label) => label.text)).toEqual(['[1]', '2']);
});

it('shows no tabs when no workspace is focused', () => {
  const snapshot = {
    ...listSnapshot(2, 1, 2),
    defaultView: { focusedWorkspaceId: workspaceId(9), activeTabs: [] },
  } as unknown as StoreSnapshot;

  expect(tabLabelsOf(snapshot, 'insert')).toEqual([]);
});
