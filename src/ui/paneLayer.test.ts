import { afterEach, expect, it } from 'bun:test';

import { BoxRenderable, TextAttributes } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';

import { createRowCache } from '../client/client.ts';
import type { RowCache, StoreSnapshot } from '../client/client.ts';
import { paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { legacyArrangement } from '../layout.ts';
import type { Layout } from '../layout.ts';
import { cellWords, CursorShape, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import { mountPanes } from './paneLayer.ts';
import type { PaneLayerSession } from './paneLayer.ts';

type RowsListener = Parameters<PaneLayerSession['subscribeRows']>[0];

interface ScreenOptions {
  sequence?: number;
  activeTop?: number;
  first?: number;
}

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
      arrangement: legacyArrangement(layout),
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

const textAtColumn = (column: number, row = 0): RowUpdate => {
  const words = new Uint32Array(rowWords(columns) * (row + 1));

  words[row * rowWords(columns)] = row;
  words[row * rowWords(columns) + rowHeaderWords + column * cellWords] = 'Z'.codePointAt(0) ?? 0;

  return {
    pane: 1,
    sequence: 1,
    size: { columns, rows: row + 1 },
    cursor: { x: 0, y: 0, visible: false, shape: CursorShape.default, blinking: false },
    modes: 0,
    epoch: 1,
    first: 0,
    activeTop: 0,
    rowCount: row + 1,
    cells: words,
    graphemes: new Uint32Array(),
    colors: new Uint32Array(),
  };
};

it('removes the terminal cells of a pane that became failed when the layout changes', async () => {
  const created = await createTestRenderer({ width: columns, height: rows + 1 });

  setup = created;

  const cache = createRowCache({ rowLimit: 10 });
  const rowsDrawn = cache.apply(textAtColumn(20, 1));
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

  expect(rowsDrawn).toEqual([0, 1]);
  expect(created.captureCharFrame().split('\n')[1]?.[20]).toBe('Z');

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

  const frame = created.captureCharFrame();
  const errorLine = frame.split('\n')[1] ?? '';

  expect(errorLine.slice(1, 13)).toBe('Cannot start');
  expect(errorLine[20]).toBe(' ');
  expect(frame).not.toContain('Z');
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

const layerWidth = 40;

const layerHeight = rows + 1;

const screenOf = (lines: string[], options: ScreenOptions = {}): RowUpdate => {
  const { sequence = 1, activeTop = 0, first = activeTop } = options;
  const stride = rowWords(columns);
  const words = new Uint32Array(stride * lines.length);

  for (const [index, line] of lines.entries()) {
    words[index * stride] = (first + index - activeTop) >>> 0;

    for (const [column, character] of Array.from(line).entries()) {
      words[index * stride + rowHeaderWords + column * cellWords] = character.codePointAt(0) ?? 0;
    }
  }

  return {
    ...textAtColumn(0),
    sequence,
    size: { columns, rows },
    activeTop,
    first,
    rowCount: lines.length,
    cells: words,
  };
};

const scrolledTo = (snapshot: StoreSnapshot, topRow: number): StoreSnapshot => ({
  ...snapshot,
  defaultView: { ...snapshot.defaultView, scrolls: [{ paneId: paneId(1), topRow }] },
});

const focusing = (snapshot: StoreSnapshot, focused: number): StoreSnapshot => ({
  ...snapshot,
  tabs: snapshot.tabs.map((tab) => ({ ...tab, focusedPaneId: paneId(focused) })),
});

const rightSplit: Layout = {
  kind: 'split',
  direction: 'right',
  ratio: 0.5,
  first: { kind: 'pane', paneId: paneId(1) },
  second: { kind: 'pane', paneId: paneId(2) },
};

const single: Layout = { kind: 'pane', paneId: paneId(1) };

const startLayer = async (initial: StoreSnapshot, caches: Map<PaneId, RowCache>) => {
  const created = await createTestRenderer({ width: layerWidth, height: layerHeight });

  setup = created;

  const box = new BoxRenderable(created.renderer, { width: layerWidth, height: layerHeight });
  const stateListeners = new Set<() => void>();
  const rowListeners = new Set<RowsListener>();
  const fetchedListeners = new Set<(pane: PaneId) => void>();
  const scrollListeners = new Set<() => void>();
  const acknowledged: [PaneId, number][] = [];
  const held = new Map<PaneId, readonly { from: number; to: number }[] | undefined>();
  const sequences = new Map<PaneId, number>();

  const scroll: {
    cursor: { pane: PaneId; row: number; col: number } | undefined;
    reach: { from: number; to: number } | undefined;
  } = { cursor: undefined, reach: undefined };

  let snapshot = initial;

  const session: PaneLayerSession = {
    getState: () => ({ snapshot, inputMode: 'insert' }),
    rowCache: (id) => caches.get(id),
    holdRows: (id, ranges) => {
      held.set(id, ranges);
    },
    newestSequence: (id) => sequences.get(id) ?? 1,
    acknowledge: (id, sequence) => {
      acknowledged.push([id, sequence]);
    },
    subscribe: (listener) => {
      stateListeners.add(listener);

      return () => stateListeners.delete(listener);
    },
    subscribeRows: (listener) => {
      rowListeners.add(listener);

      return () => rowListeners.delete(listener);
    },
    subscribeFetched: (listener) => {
      fetchedListeners.add(listener);

      return () => fetchedListeners.delete(listener);
    },
  };

  created.renderer.root.add(box);

  const unmount = mountPanes(session, created.renderer, box, {
    cursor: () => scroll.cursor,
    reach: () => scroll.reach,
    subscribe: (listener) => {
      scrollListeners.add(listener);

      return () => scrollListeners.delete(listener);
    },
  });

  await created.renderOnce();

  const notify = (next: StoreSnapshot): void => {
    snapshot = next;

    for (const listener of stateListeners) {
      listener();
    }
  };

  const layer = {
    created,
    box,
    caches,
    acknowledged,
    held,
    scroll,
    unmount,
    listenerCount: () =>
      stateListeners.size + rowListeners.size + fetchedListeners.size + scrollListeners.size,
    lines: (): string[] => created.captureCharFrame().split('\n'),
    notify,
    show: async (next: StoreSnapshot): Promise<void> => {
      notify(next);

      await created.renderOnce();
    },
    switchSnapshot: (next: StoreSnapshot): void => {
      snapshot = next;
    },
    emitRows: async (id: PaneId, update: RowUpdate): Promise<void> => {
      const changed = caches.get(id)?.apply(update) ?? [];

      sequences.set(id, update.sequence);

      for (const listener of rowListeners) {
        listener({ pane: id, rows: changed, sequence: update.sequence });
      }

      await created.renderOnce();
    },
    emitFetched: async (id: PaneId): Promise<void> => {
      for (const listener of fetchedListeners) {
        listener(id);
      }

      await created.renderOnce();
    },
    emitScroll: async (): Promise<void> => {
      for (const listener of scrollListeners) {
        listener();
      }

      await created.renderOnce();
    },
  };

  return layer;
};

const cacheWith = (update: RowUpdate): RowCache => {
  const cache = createRowCache({ rowLimit: 10 });

  cache.apply(update);

  return cache;
};

const firstPane = paneId(1);

const secondPane = paneId(2);

const colorAt = (created: TestRendererSetup, x: number, y: number) => {
  let start = 0;

  for (const span of created.captureSpans().lines[y]?.spans ?? []) {
    if (x < start + span.width) {
      return span.fg.toInts().slice(0, 3);
    }

    start += span.width;
  }

  return undefined;
};

const invertedAt = (created: TestRendererSetup): string[] => {
  const inverted: string[] = [];

  for (const [row, line] of created.captureSpans().lines.entries()) {
    let column = 0;

    for (const span of line.spans) {
      if ((span.attributes & TextAttributes.INVERSE) !== 0) {
        inverted.push(`${row}:${column}`);
      }

      column += span.width;
    }
  }

  return inverted;
};

const topLines = (layer: { lines: () => string[] }, count: number): string[] =>
  layer
    .lines()
    .slice(0, count)
    .map((line) => line.trimEnd());

const twoRunning = [pane(1, 'running'), pane(2, 'running')];

it('draws the pane frames of a split and follows layout and focus changes', async () => {
  const split = snapshotOf(rightSplit, twoRunning, 1);
  const layer = await startLayer(split, new Map([[firstPane, cacheWith(screenOf(['a']))]]));

  const topLine = (): string => layer.lines()[0] ?? '';

  expect(topLine()).toStartWith('┌');
  expect(topLine().trimEnd()).toEndWith('┐');
  expect(topLine().match(/┌/g)).toHaveLength(2);

  const accent = colorAt(layer.created, 0, 0);
  const secondCorner = topLine().indexOf('┌', 1);

  expect(colorAt(layer.created, secondCorner, 0)).not.toEqual(accent);

  await layer.show(focusing(split, 2));

  expect(colorAt(layer.created, 0, 0)).not.toEqual(accent);
  expect(colorAt(layer.created, secondCorner, 0)).toEqual(accent);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 3));

  expect(layer.lines().join('')).not.toMatch(/[┌┐└┘│─]/);
});

it('shows the error of a pane that failed and no cells of a terminal', async () => {
  const layer = await startLayer(
    snapshotOf(rightSplit, [pane(1, 'failed'), pane(2, 'running')], 1),
    new Map([[firstPane, cacheWith(screenOf(['terminal text']))]]),
  );

  expect(layer.lines()[1]?.slice(1, 13)).toBe('Cannot start');
  expect(layer.lines().join('')).not.toContain('terminal text');

  await layer.emitFetched(firstPane);

  expect(layer.lines()[1]?.slice(1, 13)).toBe('Cannot start');
});

it('moves and resizes the error of a failed pane with the layout', async () => {
  const failed = [pane(1, 'running'), pane(2, 'failed')];
  const layer = await startLayer(snapshotOf(rightSplit, failed, 1), new Map());

  const errorAt = (): [number, string][] =>
    layer
      .lines()
      .flatMap((line, index) => {
        const column = line.search(/Cannot|start/);

        return column === -1 ? [] : [[index, line.slice(column).trimEnd()] as [number, string]];
      })
      .filter(([, text]) => text !== '');

  const errorColumn = (layer.lines()[1] ?? '').indexOf('Cannot');
  const before = layer.box.getChildren();

  expect(layer.lines()[1]).toContain('Cannot start');

  const narrow: Layout = { ...rightSplit, ratio: 0.8 };

  await layer.show(snapshotOf(narrow, failed, 2));

  const found = errorAt();

  expect(found.map(([row]) => row)).toEqual([1, 2]);
  expect((layer.lines()[1] ?? '').indexOf('Cannot')).toBeGreaterThan(errorColumn);
  expect(layer.box.getChildren()).toEqual(before);
  expect(found[0]?.[1]).toStartWith('Cannot');
  expect(found[1]?.[1]).toStartWith('start');
});

it('acknowledges the newest sequence once the rows are drawn', async () => {
  const cache = cacheWith(screenOf(['first']));
  const layer = await startLayer(snapshotOf(single, [pane(1, 'running')], 1), new Map());

  expect(layer.acknowledged).toEqual([]);

  layer.caches.set(firstPane, cache);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  expect(layer.lines()[0]).toStartWith('first');
  expect(layer.acknowledged).toEqual([[firstPane, 1]]);

  await layer.emitRows(firstPane, screenOf(['second'], { sequence: 9 }));

  expect(layer.lines()[0]).toStartWith('second');

  expect(layer.acknowledged).toEqual([
    [firstPane, 1],
    [firstPane, 9],
  ]);
});

it('moves and resizes a mounted pane with the layout and keeps its renderable', async () => {
  const cache = cacheWith(screenOf(['abcdefghijklmnopqrstuvwxyz0123']));
  const layer = await startLayer(snapshotOf(single, [pane(1, 'running')], 1), new Map());

  layer.caches.set(firstPane, cache);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  const before = layer.box.getChildren();

  expect(layer.lines()[0]).toStartWith('abcdefghijklmnopqrstuvwxyz0123');
  expect(before).toHaveLength(2);

  await layer.show(snapshotOf(rightSplit, twoRunning, 3));

  expect(layer.lines()[1]?.slice(1, 5)).toBe('abcd');
  expect(layer.lines()[1]).not.toContain('uvwxyz');
  expect(layer.lines()[0]).not.toContain('abcd');
  expect(layer.box.getChildren()).toEqual(before);
});

it('acknowledges a sequence again only when the pane draws it again', async () => {
  const running = snapshotOf(single, [pane(1, 'running')], 1);
  const layer = await startLayer(running, new Map([[firstPane, cacheWith(screenOf(['a']))]]));

  expect(layer.acknowledged).toEqual([[firstPane, 1]]);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  expect(layer.acknowledged).toEqual([[firstPane, 1]]);
});

it('shows the scroll cursor after a state change', async () => {
  const running = snapshotOf(single, [pane(1, 'running')], 1);

  const layer = await startLayer(
    running,
    new Map([[firstPane, cacheWith(screenOf(['abc', 'def']))]]),
  );

  layer.scroll.cursor = { pane: firstPane, row: 1, col: 2 };
  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  expect(invertedAt(layer.created)).toEqual(['1:2']);
});

it('swaps the error of a pane for its terminal and back', async () => {
  const cache = cacheWith(screenOf(['terminal text']));
  const failed = snapshotOf(single, [pane(1, 'failed')], 1);
  const layer = await startLayer(failed, new Map([[firstPane, cache]]));
  const error = layer.box.getChildren()[1];

  expect(layer.lines()[0]).toStartWith('Cannot start');

  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  expect(error?.isDestroyed).toBe(true);
  expect(layer.lines()[0]).toStartWith('terminal text');
  expect(layer.box.getChildren()).toHaveLength(2);

  const terminal = layer.box.getChildren()[1];

  await layer.show(snapshotOf(single, [pane(1, 'failed')], 3));

  expect(terminal?.isDestroyed).toBe(true);
  expect(layer.lines()[0]).toStartWith('Cannot start');
  expect(layer.lines().join('')).not.toContain('terminal text');
  expect(layer.box.getChildren()).toHaveLength(2);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 4));

  expect(layer.lines()[0]).toStartWith('terminal text');
});

it.each([
  ['width', 30, layerHeight],
  ['height', layerWidth, layerHeight + 3],
])('redraws every row of a pane when only its %s changed', async (_name, width, height) => {
  const cache = cacheWith(screenOf(['row0', 'row1', 'row2']));
  const layer = await startLayer(snapshotOf(single, [pane(1, 'running')], 1), new Map());

  layer.caches.set(firstPane, cache);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  layer.created.resize(width, height);
  await layer.show(snapshotOf(single, [pane(1, 'running')], 3));

  expect(topLines(layer, 3)).toEqual(['row0', 'row1', 'row2']);
});

it('holds only real row ranges for a view that follows the bottom', async () => {
  const layer = await startLayer(
    snapshotOf(single, [pane(1, 'running')], 1),
    new Map([[firstPane, cacheWith(screenOf(['a']))]]),
  );

  expect(layer.held.get(firstPane)).toBeUndefined();
  expect(layer.held.has(firstPane)).toBe(true);

  layer.scroll.reach = { from: 5, to: 9 };
  await layer.emitScroll();

  expect(layer.held.get(firstPane)).toEqual([{ from: 5, to: 9 }]);
});

const history = (lines: string[]): RowUpdate => screenOf(lines, { activeTop: 10, first: 8 });

it('shows the rows from the view scroll top after a state change', async () => {
  const running = snapshotOf(single, [pane(1, 'running')], 1);

  const layer = await startLayer(
    running,
    new Map([[firstPane, cacheWith(history(['a', 'b', 'c', 'd', 'e']))]]),
  );

  expect(layer.lines()[0]).toStartWith('c');

  await layer.show(scrolledTo(running, 8));

  expect(topLines(layer, 3)).toEqual(['a', 'b', 'c']);
});

it('shows the rows from the view scroll top after a row update', async () => {
  const running = snapshotOf(single, [pane(1, 'running')], 1);
  const cache = cacheWith(history(['a', 'b', 'c', 'd', 'e']));
  const layer = await startLayer(running, new Map([[firstPane, cache]]));

  layer.switchSnapshot(scrolledTo(running, 8));

  await layer.emitRows(firstPane, {
    ...screenOf(['z'], { sequence: 2, activeTop: 10, first: 10 }),
    first: 8,
  });

  expect(topLines(layer, 3)).toEqual(['a', 'b', 'z']);
});

it('draws the changed rows of a row update', async () => {
  const layer = await startLayer(
    snapshotOf(single, [pane(1, 'running')], 1),
    new Map([[firstPane, cacheWith(screenOf(['a', 'b', 'c']))]]),
  );

  await layer.emitRows(firstPane, screenOf(['x'], { sequence: 2, first: 1, activeTop: 0 }));

  expect(topLines(layer, 3)).toEqual(['a', 'x', 'c']);
});

it('mounts a pane when its first rows arrive', async () => {
  const layer = await startLayer(snapshotOf(single, [pane(1, 'running')], 1), new Map());

  expect(layer.box.getChildren()).toHaveLength(1);

  layer.caches.set(firstPane, createRowCache({ rowLimit: 10 }));
  await layer.emitRows(firstPane, screenOf(['late']));

  expect(layer.lines()[0]).toStartWith('late');
  expect(layer.box.getChildren()).toHaveLength(2);
});

it('redraws a pane when fetched rows arrive for it', async () => {
  const cache = createRowCache({ rowLimit: 10 });

  const layer = await startLayer(
    snapshotOf(single, [pane(1, 'running')], 1),
    new Map([[firstPane, cache]]),
  );

  cache.apply(screenOf(['fetched']));
  await layer.emitFetched(firstPane);

  expect(layer.lines()[0]).toStartWith('fetched');
});

it('updates the shown rows, the scroll cursor, and the held ranges when scroll mode changes', async () => {
  const running = snapshotOf(single, [pane(1, 'running')], 1);

  const layer = await startLayer(
    running,
    new Map([[firstPane, cacheWith(history(['a', 'b', 'c', 'd', 'e']))]]),
  );

  layer.switchSnapshot(scrolledTo(running, 8));
  layer.scroll.cursor = { pane: firstPane, row: 9, col: 2 };
  layer.scroll.reach = { from: 100, to: 120 };
  await layer.emitScroll();

  expect(layer.lines()[0]).toStartWith('a');
  expect(invertedAt(layer.created)).toEqual(['1:2']);

  expect(layer.held.get(firstPane)).toEqual([
    { from: 8, to: 13 },
    { from: 100, to: 120 },
  ]);
});

it('removes a pane that leaves the tab and draws it again when it comes back', async () => {
  const split = snapshotOf(rightSplit, twoRunning, 1);

  const layer = await startLayer(
    split,
    new Map([
      [firstPane, cacheWith(screenOf(['one']))],
      [secondPane, cacheWith(screenOf(['two']))],
    ]),
  );

  const before = layer.box.getChildren();

  expect(before).toHaveLength(3);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  const departed = before.filter((child) => child.isDestroyed);

  expect(departed).toHaveLength(1);
  expect(layer.box.getChildren()).toHaveLength(2);
  expect(layer.lines().join('')).not.toContain('two');

  await layer.show(snapshotOf(rightSplit, twoRunning, 3));

  expect(layer.box.getChildren()).toHaveLength(3);
  expect(layer.lines().join('')).toContain('two');
  expect(layer.box.getChildren().every((child) => !child.isDestroyed)).toBe(true);
});

it('removes the error of a failed pane that leaves the tab and shows it again when it returns', async () => {
  const failed = [pane(1, 'running'), pane(2, 'failed')];
  const layer = await startLayer(snapshotOf(rightSplit, failed, 1), new Map());
  const before = layer.box.getChildren();

  expect(before).toHaveLength(2);

  await layer.show(snapshotOf(single, [pane(1, 'running')], 2));

  expect(before.filter((child) => child.isDestroyed)).toHaveLength(1);
  expect(layer.lines().join('')).not.toContain('Cannot');

  await layer.show(snapshotOf(rightSplit, failed, 3));

  expect(layer.lines().join('')).toContain('Cannot start');
  expect(layer.box.getChildren().every((child) => !child.isDestroyed)).toBe(true);
});

it('destroys the terminal of a pane that became failed and ignores later rows for it', async () => {
  const running = snapshotOf(rightSplit, twoRunning, 1);
  const layer = await startLayer(running, new Map([[firstPane, cacheWith(screenOf(['one']))]]));
  const before = layer.box.getChildren();

  await layer.show(snapshotOf(rightSplit, [pane(1, 'failed'), pane(2, 'running')], 2));

  expect(before.filter((child) => child.isDestroyed)).toHaveLength(1);

  await layer.emitFetched(firstPane);
  layer.scroll.reach = { from: 1, to: 2 };
  await layer.emitScroll();

  expect(layer.lines()[1]).toContain('Cannot start');
  expect(layer.lines().join('')).not.toContain('one');
});

it('removes its renderables and stops listening when unmounted', async () => {
  const split = snapshotOf(rightSplit, [pane(1, 'running'), pane(2, 'failed')], 1);
  const layer = await startLayer(split, new Map([[firstPane, cacheWith(screenOf(['one']))]]));
  const before = layer.box.getChildren();

  expect(before).toHaveLength(3);
  expect(layer.listenerCount()).toBe(4);

  layer.unmount();

  expect(layer.listenerCount()).toBe(0);
  expect(layer.box.getChildren()).toHaveLength(0);
  expect(before.every((child) => child.isDestroyed)).toBe(true);
});

const cursorScreen = (): RowUpdate => ({
  ...screenOf(['ab']),
  cursor: { x: 0, y: 0, visible: true, shape: CursorShape.default, blinking: false },
});

const nativeCursor = (created: TestRendererSetup) => {
  const { visible, x, y } = created.renderer.getCursorState();

  return { visible, x, y };
};

const bothCursors = (): Map<PaneId, RowCache> =>
  new Map([
    [firstPane, cacheWith(cursorScreen())],
    [secondPane, cacheWith({ ...cursorScreen(), pane: 2 })],
  ]);

it('gives the native cursor to the focused pane only and draws an inverse cell in the other', async () => {
  const split = snapshotOf(rightSplit, twoRunning, 1);
  const layer = await startLayer(split, bothCursors());

  const firstInverted = invertedAt(layer.created);
  const firstCursor = nativeCursor(layer.created);

  await layer.show(focusing(split, 2));

  const secondInverted = invertedAt(layer.created);
  const secondCursor = nativeCursor(layer.created);

  expect(firstInverted).toHaveLength(1);
  expect(secondInverted).toHaveLength(1);
  expect(firstInverted).not.toEqual(secondInverted);
  expect(firstCursor.visible).toBe(true);
  expect(secondCursor.visible).toBe(true);

  const [firstRow, firstColumn] = secondInverted[0]?.split(':').map(Number) ?? [];
  const [secondRow, secondColumn] = firstInverted[0]?.split(':').map(Number) ?? [];

  expect(firstCursor).toEqual({ visible: true, x: (firstColumn ?? 0) + 1, y: (firstRow ?? 0) + 1 });

  expect(secondCursor).toEqual({
    visible: true,
    x: (secondColumn ?? 0) + 1,
    y: (secondRow ?? 0) + 1,
  });
});

it('hides the native cursor as soon as focus moves to a failed pane', async () => {
  const split = snapshotOf(rightSplit, [pane(1, 'running'), pane(2, 'failed')], 1);
  const layer = await startLayer(split, new Map([[firstPane, cacheWith(cursorScreen())]]));

  expect(nativeCursor(layer.created).visible).toBe(true);

  layer.notify(focusing(split, 2));

  expect(nativeCursor(layer.created).visible).toBe(false);

  await layer.created.renderOnce();

  expect(nativeCursor(layer.created).visible).toBe(false);
});

it('keeps the native cursor of the focused pane when the layer syncs without a frame', async () => {
  const split = snapshotOf(rightSplit, twoRunning, 1);
  const layer = await startLayer(split, bothCursors());

  layer.notify({ ...split, revision: 2 });

  expect(nativeCursor(layer.created).visible).toBe(true);
});

it('hides the native cursor when unmounted', async () => {
  const layer = await startLayer(
    snapshotOf(single, [pane(1, 'running')], 1),
    new Map([[firstPane, cacheWith(cursorScreen())]]),
  );

  expect(nativeCursor(layer.created).visible).toBe(true);

  layer.unmount();

  expect(nativeCursor(layer.created).visible).toBe(false);
});
