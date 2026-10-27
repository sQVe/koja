import { activeTabIdOf, shownView } from '../client/client.ts';
import type { StoreSnapshot } from '../client/client.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import { layoutPanes, paneSize, shownLayout, sideListWidth, statusBarRows } from '../layout.ts';
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

export interface Cell {
  x: number;
  y: number;
}

export interface TabLabel {
  // The 1-based position of the tab in its workspace.
  number: number;
  text: string;
  // The column of the label's first character in the status bar.
  column: number;
}

// The size of the outer screen: this client's size once the server knows it.
const screenOf = (snapshot: StoreSnapshot, terminal: TerminalSize): TerminalSize => {
  const client = snapshot.clients.find((known) => known.id === snapshot.attachedClientId);

  return client?.size ?? terminal;
};

export const placementOf = (snapshot: StoreSnapshot, terminal: TerminalSize): Placement => {
  const view = shownView(snapshot);
  const activeId = activeTabIdOf(view, view.focusedWorkspaceId);
  const tab = snapshot.tabs.find((known) => known.id === activeId);
  const screen = screenOf(snapshot, terminal);
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

// Shows the entries that fit, scrolled only as far as needed to keep the focused one in view.
export const visibleStart = (count: number, focusedIndex: number, rows: number): number => {
  const lastStart = Math.max(0, count - rows);

  return Math.min(lastStart, Math.max(0, focusedIndex - rows + 1));
};

// The workspace whose side list row holds the outer cell. The terminal is the live size the list
// is drawn with, not the size the server last heard.
export const workspaceAt = (
  snapshot: StoreSnapshot,
  terminal: TerminalSize,
  cell: Cell,
): WorkspaceId | undefined => {
  const rows = Math.max(1, terminal.rows - statusBarRows);
  const { focusedWorkspaceId } = shownView(snapshot);
  const focusedIndex = snapshot.workspaces.findIndex((known) => known.id === focusedWorkspaceId);
  const start = visibleStart(snapshot.workspaces.length, focusedIndex, rows);
  const insideList = cell.x >= 0 && cell.x < sideListWidth(terminal.columns);
  const insideRows = cell.y >= 0 && cell.y < rows;

  if (!insideList || !insideRows) {
    return undefined;
  }

  return snapshot.workspaces[start + cell.y]?.id;
};

export const tabEntry = (number: number, label: string | undefined, active: boolean): string => {
  const name = label === undefined ? `${number}` : `${number}:${label}`;

  return active ? `[${name}]` : name;
};

export const tabLabelsOf = (snapshot: StoreSnapshot, inputMode: string): TabLabel[] => {
  const view = shownView(snapshot);
  const workspace = snapshot.workspaces.find((known) => known.id === view.focusedWorkspaceId);

  if (workspace === undefined) {
    return [];
  }

  const activeId = activeTabIdOf(view, workspace.id);
  const labels: TabLabel[] = [];
  let column = Bun.stringWidth(inputMode) + 1;

  workspace.tabIds.forEach((id, index) => {
    const number = index + 1;
    const label = snapshot.tabs.find((tab) => tab.id === id)?.label;
    const text = tabEntry(number, label, id === activeId);

    labels.push({ number, text, column });
    column += Bun.stringWidth(text) + 1;
  });

  return labels;
};

// The text of the status bar: the mode name, the tab labels at their columns, then a message after
// them, so the labels keep their columns.
export const statusBarLine = (
  inputMode: string,
  labels: readonly TabLabel[],
  message: string | undefined,
): string => {
  const parts = [inputMode.toUpperCase(), ...labels.map((label) => label.text)];

  if (message !== undefined) {
    parts.push(` ${message}`);
  }

  return parts.join(' ');
};

// The number of the tab whose label holds the outer cell, in the status bar's row.
export const tabAt = (
  snapshot: StoreSnapshot,
  inputMode: string,
  terminal: TerminalSize,
  cell: Cell,
): number | undefined => {
  if (cell.y !== terminal.rows - statusBarRows) {
    return undefined;
  }

  const labels = tabLabelsOf(snapshot, inputMode);

  const hit = labels.find(
    (label) => cell.x >= label.column && cell.x < label.column + Bun.stringWidth(label.text),
  );

  return hit?.number;
};
