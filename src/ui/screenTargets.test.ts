import { expect, it } from 'bun:test';

import type { StoreSnapshot } from '../client/client.ts';
import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { placementOf, targetAt, targetNear } from './screenTargets.ts';
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
