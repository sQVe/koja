import { activeTabIdOf, shownView } from '../client/client.ts';
import type { StoreSnapshot } from '../client/client.ts';
import type { PaneId } from '../ids.ts';
import { layoutPanes, paneSize, shownLayout, sideListWidth } from '../layout.ts';
import type { PaneRectangle, TerminalSize } from '../layout.ts';

export interface Placement {
  rectangles: PaneRectangle[];
  size: TerminalSize;
  focusedPaneId: PaneId | undefined;
  // The columns the side list takes before the first pane column.
  offset: number;
}

// A cell inside a pane, counted from the pane's own top left cell.
export interface PaneTarget {
  paneId: PaneId;
  column: number;
  row: number;
}

export const placementOf = (snapshot: StoreSnapshot, terminal: TerminalSize): Placement => {
  const view = shownView(snapshot);
  const activeId = activeTabIdOf(view, view.focusedWorkspaceId);
  const tab = snapshot.tabs.find((known) => known.id === activeId);
  const client = snapshot.clients.find((known) => known.id === snapshot.attachedClientId);
  const screen = client?.size ?? terminal;
  const size = paneSize(screen);

  return {
    rectangles:
      tab === undefined ? [] : layoutPanes(shownLayout(tab.layout, tab.zoomedPaneId), size),
    size,
    focusedPaneId: tab?.focusedPaneId,
    offset: sideListWidth(screen.columns),
  };
};

const contains = (area: PaneRectangle['terminal'], column: number, row: number): boolean => {
  const insideColumns = column >= area.x && column < area.x + area.columns;
  const insideRows = row >= area.y && row < area.y + area.rows;

  return insideColumns && insideRows;
};

const clamp = (value: number, size: number): number => Math.min(Math.max(value, 0), size - 1);

// The pane whose terminal holds the outer cell (x, y). Borders and empty cells hit nothing.
export const targetAt = (placement: Placement, x: number, y: number): PaneTarget | undefined => {
  const column = x - placement.offset;

  for (const { paneId, terminal } of placement.rectangles) {
    if (contains(terminal, column, y)) {
      return { paneId, column: column - terminal.x, row: y - terminal.y };
    }
  }

  return undefined;
};

// The cell of a given pane nearest the outer cell (x, y), for a drag that leaves the pane.
export const targetNear = (
  placement: Placement,
  paneId: PaneId,
  x: number,
  y: number,
): PaneTarget | undefined => {
  const found = placement.rectangles.find((rectangle) => rectangle.paneId === paneId);

  if (found === undefined) {
    return undefined;
  }

  const { terminal } = found;

  return {
    paneId,
    column: clamp(x - placement.offset - terminal.x, terminal.columns),
    row: clamp(y - terminal.y, terminal.rows),
  };
};
