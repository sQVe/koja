import type { BoxRenderable, CliRenderer } from '@opentui/core';

import { activeTabIdOf, shownView } from '../client/client.ts';
import type { AttachSession, StoreSnapshot } from '../client/client.ts';
import type { PaneId } from '../ids.ts';
import { layoutPanes, paneSize, shownLayout } from '../layout.ts';
import type { PaneRectangle, TerminalSize } from '../layout.ts';
import { FailedPaneRenderable } from './failedPane.ts';
import { BorderRenderable, borderCells } from './paneBorders.ts';
import { PaneRenderable } from './paneRenderable.ts';

interface Placement {
  rectangles: PaneRectangle[];
  size: TerminalSize;
  focusedPaneId: PaneId | undefined;
}

// Keeps one renderable per pane of the focused tab at its layout rectangle, with the borders
// beneath them. Each pane draws and acknowledges its own row updates.
export type PaneLayerSession = Pick<
  AttachSession,
  'getState' | 'rowCache' | 'newestSequence' | 'acknowledge' | 'subscribe' | 'subscribeRows'
>;

const placementOf = (snapshot: StoreSnapshot, terminal: TerminalSize): Placement => {
  const view = shownView(snapshot);
  const activeId = activeTabIdOf(view, view.focusedWorkspaceId);
  const tab = snapshot.tabs.find((known) => known.id === activeId);
  const client = snapshot.clients.find((known) => known.id === snapshot.attachedClientId);
  const size = paneSize(client?.size ?? terminal);

  return {
    rectangles:
      tab === undefined ? [] : layoutPanes(shownLayout(tab.layout, tab.zoomedPaneId), size),
    size,
    focusedPaneId: tab?.focusedPaneId,
  };
};

export const mountPanes = (
  session: PaneLayerSession,
  renderer: CliRenderer,
  box: BoxRenderable,
): (() => void) => {
  const panes = new Map<PaneId, PaneRenderable>();
  const failedPanes = new Map<PaneId, FailedPaneRenderable>();
  const borders = new BorderRenderable(renderer, paneSize(undefined));
  let drawnBorders = '';

  box.add(borders);

  const drawAll = (pane: PaneRenderable, id: PaneId, rows: number): void => {
    pane.draw(
      Array.from({ length: rows }, (_, index) => index),
      session.newestSequence(id),
    );
  };

  const removeTerminal = (id: PaneId): void => {
    const terminal = panes.get(id);

    if (terminal !== undefined) {
      box.remove(terminal);
      terminal.destroy();
      panes.delete(id);
    }
  };

  const removeFailed = (id: PaneId): void => {
    const failed = failedPanes.get(id);

    if (failed !== undefined) {
      box.remove(failed);
      failed.destroy();
      failedPanes.delete(id);
    }
  };

  const placeFailed = (rectangle: PaneRectangle, message: string): void => {
    const { paneId: id, terminal } = rectangle;
    const { x, y, columns, rows } = terminal;
    const existing = failedPanes.get(id);

    if (existing === undefined) {
      const created = new FailedPaneRenderable(renderer, {
        message,
        width: columns,
        height: rows,
        left: x,
        top: y,
      });

      failedPanes.set(id, created);
      box.add(created);

      return;
    }

    existing.move(x, y);
    existing.resize(columns, rows);
  };

  const place = (rectangle: PaneRectangle): void => {
    const { paneId: id, terminal } = rectangle;
    const { x, y, columns, rows } = terminal;
    const known = session.getState().snapshot.panes.find((pane) => pane.id === id);

    if (known?.lifecycle === 'failed') {
      removeTerminal(id);
      placeFailed(rectangle, known.error ?? '');

      return;
    }

    removeFailed(id);

    const existing = panes.get(id);
    const cache = session.rowCache(id);

    if (existing === undefined && cache !== undefined) {
      const created = new PaneRenderable(renderer, {
        cache,
        width: columns,
        height: rows,
        left: x,
        top: y,
        onDrawn: (sequence) => {
          session.acknowledge(id, sequence);
        },
      });

      panes.set(id, created);
      box.add(created);
      drawAll(created, id, rows);

      return;
    }

    if (existing === undefined) {
      return;
    }

    const resized = existing.width !== columns || existing.height !== rows;

    existing.move(x, y);
    existing.resize(columns, rows);

    if (resized) {
      drawAll(existing, id, rows);
    }
  };

  const removeDeparted = (rectangles: readonly PaneRectangle[]): void => {
    const present = new Set(rectangles.map((rectangle) => rectangle.paneId));

    for (const [id, pane] of panes) {
      if (!present.has(id)) {
        box.remove(pane);
        pane.destroy();
        panes.delete(id);
      }
    }

    for (const [id, pane] of failedPanes) {
      if (!present.has(id)) {
        box.remove(pane);
        pane.destroy();
        failedPanes.delete(id);
      }
    }
  };

  const sync = (): void => {
    const terminal = { columns: renderer.terminalWidth, rows: renderer.terminalHeight };
    const { rectangles, size, focusedPaneId } = placementOf(session.getState().snapshot, terminal);

    removeDeparted(rectangles);

    for (const rectangle of rectangles) {
      place(rectangle);
    }

    const signature = JSON.stringify([rectangles, size, focusedPaneId]);

    if (signature !== drawnBorders) {
      drawnBorders = signature;
      borders.update(size, borderCells(rectangles, focusedPaneId));
    }
  };

  const unsubscribeRows = session.subscribeRows(({ pane, rows, sequence }) => {
    const renderable = panes.get(pane);

    if (renderable === undefined) {
      sync();
    } else {
      renderable.draw(rows, sequence);
    }
  });

  const unsubscribeState = session.subscribe(sync);

  sync();

  return () => {
    unsubscribeRows();
    unsubscribeState();

    for (const pane of panes.values()) {
      box.remove(pane);
      pane.destroy();
    }

    for (const pane of failedPanes.values()) {
      box.remove(pane);
      pane.destroy();
    }

    panes.clear();
    failedPanes.clear();
    box.remove(borders);
    borders.destroy();
  };
};
