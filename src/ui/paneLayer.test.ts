import { afterEach, expect, it } from 'bun:test';

import { BoxRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';

import { createRowCache } from '../client/client.ts';
import type { StoreSnapshot } from '../client/client.ts';
import { paneId, tabId, workspaceId } from '../ids.ts';
import type { Layout } from '../layout.ts';
import { cellWords, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import { mountPanes } from './paneLayer.ts';
import type { PaneLayerSession } from './paneLayer.ts';

const columns = 80;

const rows = 6;

let setup: TestRendererSetup | undefined;

afterEach(() => {
  setup?.renderer.destroy();
  setup = undefined;
});

const size = { columns, rows };

const pane = (id: number, lifecycle: 'running' | 'failed') => ({
  id: paneId(id),
  tabId: tabId(1),
  lifecycle,
  generation: id,
  size,
  exitCode: undefined,
  startFolder: undefined,
  restored: true,
  error: lifecycle === 'failed' ? 'Cannot start' : undefined,
});

const snapshotOf = (
  layout: Layout,
  panes: StoreSnapshot['panes'],
  revision: number,
): StoreSnapshot => ({
  revision,
  workspaces: [
    {
      id: workspaceId(1),
      root: '/work',
      label: 'work',
      tabIds: [tabId(1)],
    },
  ],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout,
      focusedPaneId: paneId(1),
      zoomedPaneId: undefined,
      label: undefined,
    },
  ],
  panes,
  defaultView: {
    focusedWorkspaceId: workspaceId(1),
    activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(1) }],
  },
  attachedClientId: undefined,
  foregroundClientId: undefined,
  clients: [],
});

const textAtColumn = (column: number): RowUpdate => {
  const words = new Uint32Array(rowWords(columns));

  words[rowHeaderWords + column * cellWords] = 'Z'.codePointAt(0) ?? 0;

  return {
    pane: 1,
    sequence: 1,
    size: { columns, rows: 1 },
    cursor: { x: 0, y: 0, visible: false },
    modes: 0,
    epoch: 1,
    first: 0,
    activeTop: 0,
    rowCount: 1,
    cells: words,
    graphemes: new Uint32Array(),
    colors: new Uint32Array(),
  };
};

it('removes the terminal cells of a pane that became failed when the layout changes', async () => {
  const created = await createTestRenderer({ width: columns, height: rows + 1 });

  setup = created;

  const cache = createRowCache({ rowLimit: 10 });
  const rowsDrawn = cache.apply(textAtColumn(45));
  const box = new BoxRenderable(created.renderer, { width: columns, height: rows + 1 });
  const listeners = new Set<() => void>();

  let snapshot = snapshotOf({ kind: 'pane', paneId: paneId(1) }, [pane(1, 'running')], 1);

  const session: PaneLayerSession = {
    getState: () => ({ snapshot, inputMode: 'insert' }),
    rowCache: (id) => (id === paneId(1) ? cache : undefined),
    newestSequence: () => 1,
    acknowledge: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    subscribeRows: () => () => undefined,
  };

  created.renderer.root.add(box);
  mountPanes(session, created.renderer, box);
  await created.renderOnce();

  expect(rowsDrawn).toEqual([0]);
  expect(created.captureCharFrame()).toContain('Z');

  const failedSplit: Layout = {
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: { kind: 'pane', paneId: paneId(1) },
    second: { kind: 'pane', paneId: paneId(2) },
  };

  snapshot = snapshotOf(failedSplit, [pane(1, 'failed'), pane(2, 'running')], 2);

  for (const listener of listeners) {
    listener();
  }

  await created.renderOnce();

  expect(created.captureCharFrame()).not.toContain('Z');
});
