import { afterEach, expect, it } from 'bun:test';

import { BoxRenderable, TextAttributes } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';

import { createRowCache } from '../src/client/client.ts';
import type { RowCache, StoreSnapshot } from '../src/client/client.ts';
import { paneId, tabId, workspaceId } from '../src/ids.ts';
import type { PaneId } from '../src/ids.ts';
import type { Layout } from '../src/layout.ts';
import { CursorShape, decodeRowUpdate, encodeRowUpdate, rowWords } from '../src/rows/rows.ts';
import type { RowUpdate } from '../src/rows/rows.ts';
import { mountPanes } from '../src/ui/paneLayer.ts';
import type { PaneLayerSession } from '../src/ui/paneLayer.ts';
import { placementOf } from '../src/ui/screenTargets.ts';
import { createTerminal } from '../src/vt/vt.ts';
import type { Terminal } from '../src/vt/vt.ts';

const columns = 80;

const rows = 6;

const size = { columns, rows };

let setup: TestRendererSetup | undefined;

afterEach(() => {
  setup?.renderer.destroy();
  setup = undefined;
});

const pane = (id: number) => ({
  id: paneId(id),
  tabId: tabId(1),
  lifecycle: 'running' as const,
  generation: id,
  size,
  exitCode: undefined,
  startFolder: undefined,
  restored: true,
  error: undefined,
});

const snapshotOf = (layout: Layout, paneCount: number, focusedPaneId: PaneId): StoreSnapshot => ({
  revision: 1,
  workspaces: [{ id: workspaceId(1), root: '/work', label: 'work', tabIds: [tabId(1)] }],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout,
      focusedPaneId,
      zoomedPaneId: undefined,
      label: undefined,
    },
  ],
  panes: Array.from({ length: paneCount }, (_, index) => pane(index + 1)),
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

const blankUpdate = (cursor: RowUpdate['cursor']): RowUpdate => ({
  pane: 1,
  sequence: 1,
  size,
  cursor,
  modes: 0,
  epoch: 1,
  first: 0,
  activeTop: 0,
  rowCount: 1,
  cells: new Uint32Array(rowWords(columns)),
  graphemes: new Uint32Array(),
  colors: new Uint32Array(),
});

// Mounts the panes of one tab with the first pane focused, and draws them once.
const startLayer = async (layout: Layout, caches: Map<PaneId, RowCache>) => {
  const created = await createTestRenderer({ width: columns, height: rows + 1 });
  const box = new BoxRenderable(created.renderer, { width: columns, height: rows + 1 });
  const listeners = new Set<() => void>();
  const state = { snapshot: snapshotOf(layout, caches.size, paneId(1)) };

  setup = created;

  const session: PaneLayerSession = {
    getState: () => ({ snapshot: state.snapshot, inputMode: 'insert' }),
    rowCache: (id) => caches.get(id),
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

  const focus = async (id: PaneId): Promise<void> => {
    const tabs = state.snapshot.tabs.map((tab) => ({ ...tab, focusedPaneId: id }));

    state.snapshot = { ...state.snapshot, revision: state.snapshot.revision + 1, tabs };

    for (const listener of listeners) {
      listener();
    }

    await created.renderOnce();
  };

  // The top left cell of a pane on the screen, counted from 1 like the native cursor.
  const origin = (id: PaneId): { x: number; y: number } => {
    const found = placementOf(state.snapshot, { columns, rows: rows + 1 }).rectangles.find(
      (rectangle) => rectangle.paneId === id,
    );

    return { x: (found?.terminal.x ?? 0) + 1, y: (found?.terminal.y ?? 0) + 1 };
  };

  // The screen cells drawn inverse, as a column and a row counted from 0.
  const inverseCells = (): [number, number][] =>
    created.captureSpans().lines.flatMap((line, row) => {
      let column = 0;

      return line.spans.flatMap((span) => {
        const start = column;

        column += span.width;

        if ((span.attributes & TextAttributes.INVERSE) === 0) {
          return [];
        }

        return Array.from({ length: span.width }, (_, offset): [number, number] => [
          start + offset,
          row,
        ]);
      });
    });

  await created.renderOnce();

  return { created, focus, origin, inverseCells };
};

// The row update the server would send for the terminal's changed rows, as the client decodes it.
const sentFrame = (terminal: Terminal, sequence: number): RowUpdate => {
  const frame = terminal.frame();

  const decoded = decodeRowUpdate(
    encodeRowUpdate({
      ...blankUpdate(frame.cursor),
      sequence,
      rowCount: frame.rowCount,
      cells: Uint32Array.from(frame.cells),
      graphemes: Uint32Array.from(frame.graphemes),
    }),
  );

  if (!decoded.ok) {
    throw new Error(decoded.reason);
  }

  return decoded.update;
};

it('shows the focused pane cursor with the native cursor in the shape, blink, and place the program set', async () => {
  const created = createTerminal(columns, rows, 1_000_000);

  if (!created.ok) {
    throw new Error(created.reason);
  }

  using terminal = created.terminal;
  const cache = createRowCache({ rowLimit: 10 });
  const id = paneId(1);
  const layer = await startLayer({ kind: 'pane', paneId: id }, new Map([[id, cache]]));
  const { x, y } = layer.origin(id);

  const show = async (bytes: string, sequence: number) => {
    terminal.write(new TextEncoder().encode(bytes));
    cache.apply(sentFrame(terminal, sequence));
    await layer.focus(id);

    return layer.created.renderer.getCursorState();
  };

  expect(await show('\u001B[3;5H\u001B[4 q', 2)).toMatchObject({
    x: x + 4,
    y: y + 2,
    visible: true,
    style: 'underline',
    blinking: false,
  });

  expect((await show('\u001B[?25l', 3)).visible).toBe(false);

  expect(await show('\u001B[?25h\u001B[5 q', 4)).toMatchObject({
    x: x + 4,
    y: y + 2,
    visible: true,
    style: 'line',
    blinking: true,
  });

  expect(layer.inverseCells()).toEqual([]);
});

it('moves the native cursor with focus and draws the unfocused pane cursor as an inverse cell', async () => {
  const first = paneId(1);
  const second = paneId(2);
  const firstCache = createRowCache({ rowLimit: 10 });
  const secondCache = createRowCache({ rowLimit: 10 });

  firstCache.apply(
    blankUpdate({ x: 2, y: 0, visible: true, shape: CursorShape.bar, blinking: false }),
  );

  secondCache.apply(
    blankUpdate({ x: 3, y: 0, visible: false, shape: CursorShape.block, blinking: false }),
  );

  const split: Layout = {
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: { kind: 'pane', paneId: first },
    second: { kind: 'pane', paneId: second },
  };

  const layer = await startLayer(
    split,
    new Map([
      [first, firstCache],
      [second, secondCache],
    ]),
  );

  const firstOrigin = layer.origin(first);
  const secondOrigin = layer.origin(second);
  const firstCursor = { x: firstOrigin.x + 2, y: firstOrigin.y, visible: true, style: 'line' };

  expect(layer.created.renderer.getCursorState()).toMatchObject(firstCursor);
  expect(layer.inverseCells()).toEqual([]);

  await layer.focus(second);

  expect(layer.created.renderer.getCursorState().visible).toBe(false);
  expect(layer.inverseCells()).toEqual([[firstOrigin.x + 1, firstOrigin.y - 1]]);

  secondCache.apply(
    blankUpdate({ x: 3, y: 0, visible: true, shape: CursorShape.underline, blinking: true }),
  );

  await layer.focus(second);

  expect(layer.created.renderer.getCursorState()).toMatchObject({
    x: secondOrigin.x + 3,
    y: secondOrigin.y,
    visible: true,
    style: 'underline',
    blinking: true,
  });

  await layer.focus(first);

  expect(layer.created.renderer.getCursorState()).toMatchObject(firstCursor);
  expect(layer.inverseCells()).toEqual([[secondOrigin.x + 2, secondOrigin.y - 1]]);
});
