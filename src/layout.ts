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

interface Area extends TerminalSize {
  x: number;
  y: number;
}

// The rectangle is the pane's frame. The terminal is the rectangle inset by the one-cell frame,
// except for a lone pane, which has no frame.
export interface PaneRectangle extends Area {
  paneId: PaneId;
  terminal: Area;
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

const frameCells = 2;

const minimumExtent = frameCells + 1;

// Only side-by-side frames get a blank column. A cell is about twice as tall as it is wide, so
// stacked frames that touch already look one row apart.
const gapOf = (axis: SplitDirection): number => (axis === 'right' ? 1 : 0);

const terminalOf = (area: Area): Area => ({
  x: area.x + 1,
  y: area.y + 1,
  columns: Math.max(1, area.columns - frameCells),
  rows: Math.max(1, area.rows - frameCells),
});

// The fewest cells a subtree needs on an axis for every pane to keep a framed 1x1 terminal.
const minimumOf = (layout: Layout, axis: SplitDirection): number => {
  if (layout.kind === 'pane') {
    return minimumExtent;
  }

  const first = minimumOf(layout.first, axis);
  const second = minimumOf(layout.second, axis);

  return layout.direction === axis ? first + gapOf(axis) + second : Math.max(first, second);
};

// The first child gets its share of the cells. Each child keeps at least the minimum of its subtree
// while the area has room for both.
const firstExtent = (
  available: number,
  ratio: number,
  firstMinimum: number,
  secondMinimum: number,
) =>
  Math.min(
    Math.max(firstMinimum, Math.round(available * ratio)),
    Math.max(firstMinimum, available - secondMinimum),
  );

const placeLayout = (layout: Layout, area: Area, placed: PaneRectangle[]): void => {
  if (layout.kind === 'pane') {
    placed.push({ paneId: layout.paneId, ...area, terminal: terminalOf(area) });

    return;
  }

  const axis = layout.direction;
  const firstMinimum = minimumOf(layout.first, axis);
  const secondMinimum = minimumOf(layout.second, axis);

  if (axis === 'right') {
    const columns = firstExtent(
      area.columns - gapOf(axis),
      layout.ratio,
      firstMinimum,
      secondMinimum,
    );

    const secondX = area.x + columns + gapOf(axis);

    placeLayout(layout.first, { ...area, columns }, placed);

    placeLayout(
      layout.second,
      {
        ...area,
        x: secondX,
        columns: Math.max(secondMinimum, area.columns - columns - gapOf(axis)),
      },
      placed,
    );

    return;
  }

  const rows = firstExtent(area.rows - gapOf(axis), layout.ratio, firstMinimum, secondMinimum);
  const secondY = area.y + rows + gapOf(axis);

  placeLayout(layout.first, { ...area, rows }, placed);

  placeLayout(
    layout.second,
    {
      ...area,
      y: secondY,
      rows: Math.max(secondMinimum, area.rows - rows - gapOf(axis)),
    },
    placed,
  );
};

// Panes in tree order. Only a tab with a split frames its panes. A pane never gets less than a
// framed 1x1, so an area that is too small overflows.
export const layoutPanes = (layout: Layout, size: TerminalSize): PaneRectangle[] => {
  const placed: PaneRectangle[] = [];
  const area = { x: 0, y: 0, ...size };

  if (layout.kind === 'pane') {
    return [{ paneId: layout.paneId, ...area, terminal: area }];
  }

  placeLayout(layout, area, placed);

  return placed;
};

// A split needs room for two framed panes, and a gap column for a right split.
export const canSplit = (size: TerminalSize, direction: SplitDirection): boolean =>
  (direction === 'right' ? size.columns : size.rows) >= 2 * minimumExtent + gapOf(direction);

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
    return {
      layout: { ...layout, first: inFirst.layout },
      sibling: inFirst.sibling,
    };
  }

  const inSecond = removePane(layout.second, target);

  if (inSecond !== undefined) {
    return {
      layout: { ...layout, second: inSecond.layout },
      sibling: inSecond.sibling,
    };
  }

  return undefined;
};
