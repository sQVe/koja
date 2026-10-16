import { afterEach, expect, it } from 'bun:test';

import { BoxRenderable, TextAttributes } from '@opentui/core';
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
    scrolls: [],
  },
  attachedClientId: undefined,
  foregroundClientId: undefined,
  clients: [],
});

const noScrollMode = {
  cursor: () => undefined,
  reach: () => undefined,
  subscribe: () => () => undefined,
};

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
    holdRows: () => undefined,
    newestSequence: () => 1,
    acknowledge: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    subscribeRows: () => () => undefined,
    subscribeFetched: () => () => undefined,
  };

  created.renderer.root.add(box);
  mountPanes(session, created.renderer, box, noScrollMode);
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

it('holds the shown rows and the rows a waiting motion needs as separate ranges', async () => {
  const created = await createTestRenderer({ width: columns, height: rows + 1 });

  setup = created;

  const cache = createRowCache({ rowLimit: 10 });

  cache.apply({ ...textAtColumn(1), first: 0, activeTop: 100_000 });

  const box = new BoxRenderable(created.renderer, { width: columns, height: rows + 1 });
  const held: (readonly { from: number; to: number }[] | undefined)[] = [];

  const scrolled = snapshotOf({ kind: 'pane', paneId: paneId(1) }, [pane(1, 'running')], 1);

  scrolled.defaultView.scrolls = [{ paneId: paneId(1), topRow: 5 }];

  const session: PaneLayerSession = {
    getState: () => ({ snapshot: scrolled, inputMode: 'scroll' }),
    rowCache: () => cache,
    holdRows: (_pane, ranges) => {
      held.push(ranges);
    },
    newestSequence: () => 1,
    acknowledge: () => undefined,
    subscribe: () => () => undefined,
    subscribeRows: () => () => undefined,
    subscribeFetched: () => () => undefined,
  };

  created.renderer.root.add(box);

  mountPanes(session, created.renderer, box, {
    ...noScrollMode,
    reach: () => ({ from: 90_000, to: 90_255 }),
  });

  expect(held.at(-1)).toEqual([
    { from: 5, to: 10 },
    { from: 90_000, to: 90_255 },
  ]);
});

const fullScreen = (activeTop: number, sequence: number): RowUpdate => {
  const stride = rowWords(columns);
  const cells = new Uint32Array(stride * rows);

  for (let line = 0; line < rows; line++) {
    cells[line * stride] = line;
  }

  return { ...textAtColumn(1), sequence, size, activeTop, rowCount: rows, cells };
};

it('redraws the scroll cursor on the same screen row when output advances a following view', async () => {
  const created = await createTestRenderer({ width: columns, height: rows + 1 });

  setup = created;

  const cache = createRowCache({ rowLimit: 10 });

  cache.apply(fullScreen(0, 1));

  const box = new BoxRenderable(created.renderer, { width: columns, height: rows + 1 });

  const listeners = new Set<
    (changed: { pane: ReturnType<typeof paneId>; rows: number[]; sequence: number }) => void
  >();

  const following = snapshotOf({ kind: 'pane', paneId: paneId(1) }, [pane(1, 'running')], 1);

  const session: PaneLayerSession = {
    getState: () => ({ snapshot: following, inputMode: 'scroll' }),
    rowCache: () => cache,
    holdRows: () => undefined,
    newestSequence: () => 1,
    acknowledge: () => undefined,
    subscribe: () => () => undefined,
    subscribeRows: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    subscribeFetched: () => () => undefined,
  };

  // Like the controller, the cursor row follows the active top when it is read.
  const mode = {
    ...noScrollMode,
    cursor: () => ({ pane: paneId(1), row: 3 + (cache.bounds()?.activeTop ?? 0), col: 0 }),
  };

  created.renderer.root.add(box);
  mountPanes(session, created.renderer, box, mode);
  await created.renderOnce();

  const highlighted = (): number[] =>
    created
      .captureSpans()
      .lines.flatMap((line, index) =>
        line.spans.some((span) => (span.attributes & TextAttributes.INVERSE) !== 0) ? [index] : [],
      );

  expect(highlighted()).toEqual([3]);

  const changed = cache.apply(fullScreen(1, 2));

  for (const listener of listeners) {
    listener({ pane: paneId(1), rows: changed, sequence: 2 });
  }

  await created.renderOnce();

  expect(highlighted()).toEqual([3]);
});
