import type { PaneId } from './ids.ts';

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

export type SplitDirection = 'below' | 'right';

export type Layout =
  | { kind: 'pane'; paneId: PaneId }
  | {
      kind: 'split';
      direction: SplitDirection;
      ratio: number;
      first: Layout;
      second: Layout;
    };

export interface PaneRectangle extends TerminalSize {
  paneId: PaneId;
  x: number;
  y: number;
}

interface Area extends TerminalSize {
  x: number;
  y: number;
}

export interface PaneRemoval {
  layout: Layout;
  sibling: Layout;
}

const detachedSize: TerminalSize = { columns: 80, rows: 24 };
const statusBarRows = 1;

export const sideListColumns = 20;

// A narrow client hides the side list so the pane keeps the width the server gives it.
export const sideListWidth = (clientColumns: number): number =>
  clientColumns > sideListColumns * 2 ? sideListColumns : 0;

export const paneSize = (client: TerminalSize | undefined): TerminalSize => {
  if (client === undefined) {
    return detachedSize;
  }

  return {
    columns: Math.max(1, client.columns - sideListWidth(client.columns)),
    rows: Math.max(1, client.rows - statusBarRows),
  };
};

// The first child gets its share of the cells left after the one-cell border, and each child keeps
// at least one cell.
const firstExtent = (available: number, ratio: number): number =>
  Math.min(Math.max(1, Math.round(available * ratio)), Math.max(1, available - 1));

const placeLayout = (layout: Layout, area: Area, placed: PaneRectangle[]): void => {
  if (layout.kind === 'pane') {
    placed.push({ paneId: layout.paneId, ...area });

    return;
  }

  if (layout.direction === 'right') {
    const available = area.columns - 1;
    const columns = firstExtent(available, layout.ratio);

    placeLayout(layout.first, { ...area, columns }, placed);

    placeLayout(
      layout.second,
      { ...area, x: area.x + columns + 1, columns: Math.max(1, available - columns) },
      placed,
    );

    return;
  }

  const available = area.rows - 1;
  const rows = firstExtent(available, layout.ratio);

  placeLayout(layout.first, { ...area, rows }, placed);

  placeLayout(
    layout.second,
    { ...area, y: area.y + rows + 1, rows: Math.max(1, available - rows) },
    placed,
  );
};

// Panes in tree order. A pane never gets less than 1x1, so an area that is too small overflows.
export const layoutPanes = (layout: Layout, size: TerminalSize): PaneRectangle[] => {
  const placed: PaneRectangle[] = [];

  placeLayout(layout, { x: 0, y: 0, ...size }, placed);

  return placed;
};

const splitCells = 3;

// A split needs one cell for each pane and one for the border.
export const canSplit = (size: TerminalSize, direction: SplitDirection): boolean =>
  (direction === 'right' ? size.columns : size.rows) >= splitCells;

export const firstPaneId = (layout: Layout): PaneId =>
  layout.kind === 'pane' ? layout.paneId : firstPaneId(layout.first);

export const splitLayout = (
  layout: Layout,
  target: PaneId,
  direction: SplitDirection,
  added: PaneId,
): Layout => {
  if (layout.kind === 'pane') {
    if (layout.paneId !== target) {
      return layout;
    }

    const second: Layout = { kind: 'pane', paneId: added };

    return { kind: 'split', direction, ratio: 0.5, first: layout, second };
  }

  return {
    ...layout,
    first: splitLayout(layout.first, target, direction, added),
    second: splitLayout(layout.second, target, direction, added),
  };
};

// The sibling subtree replaces the split that held the pane. Nothing remains of a lone pane.
export const removePane = (layout: Layout, target: PaneId): PaneRemoval | undefined => {
  if (layout.kind === 'pane') {
    return undefined;
  }

  if (layout.first.kind === 'pane' && layout.first.paneId === target) {
    return { layout: layout.second, sibling: layout.second };
  }

  if (layout.second.kind === 'pane' && layout.second.paneId === target) {
    return { layout: layout.first, sibling: layout.first };
  }

  const inFirst = removePane(layout.first, target);

  if (inFirst !== undefined) {
    return { layout: { ...layout, first: inFirst.layout }, sibling: inFirst.sibling };
  }

  const inSecond = removePane(layout.second, target);

  if (inSecond !== undefined) {
    return { layout: { ...layout, second: inSecond.layout }, sibling: inSecond.sibling };
  }

  return undefined;
};
