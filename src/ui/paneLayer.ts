import type { BoxRenderable, CliRenderer } from '@opentui/core';

import { scrollTopOf, shownView } from '../client/client.ts';
import type { AttachSession } from '../client/client.ts';
import type { PaneId } from '../ids.ts';
import { paneSize } from '../layout.ts';
import type { PaneRectangle, TerminalSize } from '../layout.ts';
import { BorderRenderable, borderCells } from './paneBorders.ts';
import { FailedPaneRenderable } from './paneFailure.ts';
import { PaneRenderable } from './paneRenderable.ts';
import { placementOf } from './screenTargets.ts';
import type { ScrollMode } from './scrollMode.ts';

export type PaneLayerSession = Pick<
  AttachSession,
  | 'getState'
  | 'rowCache'
  | 'holdRows'
  | 'newestSequence'
  | 'acknowledge'
  | 'subscribe'
  | 'subscribeRows'
  | 'subscribeFetched'
>;

// Keeps one renderable per pane of the focused tab at its layout rectangle, with the borders
// beneath them. Each pane draws and acknowledges its own row updates.
export const mountPanes = (
  session: PaneLayerSession,
  renderer: CliRenderer,
  box: BoxRenderable,
  scrollMode: Pick<ScrollMode, 'cursor' | 'reach' | 'subscribe'>,
): (() => void) => {
  const panes = new Map<PaneId, PaneRenderable>();
  const paneFailures = new Map<PaneId, FailedPaneRenderable>();
  const borders = new BorderRenderable(renderer, paneSize(undefined));
  let drawnBorders = '';
  let warning: FailedPaneRenderable | undefined;
  let warningMessage: string | undefined;

  box.add(borders);

  const drawAll = (pane: PaneRenderable, id: PaneId): void => {
    pane.drawAll(session.newestSequence(id));
  };

  // Shows the pane from its view's scroll row, kept inside the history the cache knows, and holds
  // the rows it shows so they stay in the cache.
  const showScroll = (pane: PaneRenderable, id: PaneId, rows: number): void => {
    const view = shownView(session.getState().snapshot);
    const top = session.rowCache(id)?.viewTop(scrollTopOf(view, id));

    const shown = top === undefined ? undefined : { from: top, to: top + rows - 1 };
    const reach = scrollMode.reach(id);
    const held = [shown, reach].filter((range) => range !== undefined);

    pane.setTop(top);
    session.holdRows(id, held.length === 0 ? undefined : held);
  };

  const showScrollCursor = (pane: PaneRenderable, id: PaneId): void => {
    const cursor = scrollMode.cursor();

    pane.setScrollCursor(cursor?.pane === id ? { row: cursor.row, col: cursor.col } : undefined);
  };

  const removeTerminal = (id: PaneId): void => {
    const terminal = panes.get(id);

    if (terminal !== undefined) {
      terminal.destroy();
      panes.delete(id);
    }
  };

  const removeFailed = (id: PaneId): void => {
    const failed = paneFailures.get(id);

    if (failed !== undefined) {
      failed.destroy();
      paneFailures.delete(id);
    }
  };

  const placeFailed = (rectangle: PaneRectangle, message: string): void => {
    const { paneId: id, terminal } = rectangle;
    const { x, y, columns, rows } = terminal;
    const existing = paneFailures.get(id);

    if (existing === undefined) {
      const created = new FailedPaneRenderable(renderer, {
        message,
        width: columns,
        height: rows,
        left: x,
        top: y,
      });

      paneFailures.set(id, created);
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
      showScroll(created, id, rows);
      showScrollCursor(created, id);
      drawAll(created, id);

      return;
    }

    if (existing === undefined) {
      return;
    }

    const resized = existing.width !== columns || existing.height !== rows;

    existing.move(x, y);
    existing.resize(columns, rows);

    showScroll(existing, id, rows);
    showScrollCursor(existing, id);

    if (resized) {
      drawAll(existing, id);
    }
  };

  const removeDeparted = (rectangles: readonly PaneRectangle[]): void => {
    const present = new Set(rectangles.map((rectangle) => rectangle.paneId));

    for (const [id, pane] of panes) {
      if (!present.has(id)) {
        pane.destroy();
        panes.delete(id);
      }
    }

    for (const [id, pane] of paneFailures) {
      if (!present.has(id)) {
        pane.destroy();
        paneFailures.delete(id);
      }
    }
  };

  const removeWarning = (): void => {
    warning?.destroy();
    warning = undefined;
    warningMessage = undefined;
  };

  // Shows the size a tab needs in place of its panes. Its processes keep running, so no pane fails.
  const placeWarning = (size: TerminalSize, required: TerminalSize | undefined): void => {
    if (required === undefined) {
      removeWarning();

      return;
    }

    const message = `Pane area too small: layout needs at least ${required.columns} columns x ${required.rows} rows`;

    if (message !== warningMessage) {
      removeWarning();

      warning = new FailedPaneRenderable(renderer, {
        message,
        width: size.columns,
        height: size.rows,
        left: 0,
        top: 0,
      });

      warningMessage = message;
      box.add(warning);

      return;
    }

    warning?.resize(size.columns, size.rows);
  };

  // Only the focused pane draws its cursor with the terminal's native cursor. Without a focused
  // pane renderable, such as on a failed pane, nothing shows it.
  const focusPane = (focusedPaneId: PaneId | undefined): void => {
    for (const [id, pane] of panes) {
      pane.setFocused(id === focusedPaneId);
    }

    const focused = focusedPaneId === undefined ? undefined : panes.get(focusedPaneId);

    if (focused === undefined) {
      renderer.setCursorPosition(0, 0, false);
    }
  };

  const sync = (): void => {
    const terminal = { columns: renderer.terminalWidth, rows: renderer.terminalHeight };

    const { rectangles, size, focusedPaneId, requiredSize } = placementOf(
      session.getState().snapshot,
      terminal,
    );

    removeDeparted(rectangles);

    for (const rectangle of rectangles) {
      place(rectangle);
    }

    focusPane(focusedPaneId);

    placeWarning(size, requiredSize);

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
      showScroll(renderable, pane, renderable.height);
      showScrollCursor(renderable, pane);
      renderable.draw(rows, sequence);
    }
  });

  const unsubscribeFetched = session.subscribeFetched((pane) => {
    panes.get(pane)?.drawAll();
  });

  const unsubscribeState = session.subscribe(sync);

  const unsubscribeScroll = scrollMode.subscribe(() => {
    for (const [id, pane] of panes) {
      showScroll(pane, id, pane.height);
      showScrollCursor(pane, id);
    }
  });

  sync();

  return () => {
    unsubscribeRows();
    unsubscribeFetched();
    unsubscribeState();
    unsubscribeScroll();

    for (const pane of panes.values()) {
      pane.destroy();
    }

    for (const pane of paneFailures.values()) {
      pane.destroy();
    }

    removeWarning();
    renderer.setCursorPosition(0, 0, false);
    borders.destroy();
  };
};
