import type { PaneId } from './ids.ts';
import { invariant } from './invariant.ts';

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

export type SplitDirection = 'below' | 'right';

export type ResizeDirection = 'left' | 'right' | 'up' | 'down';

export type Layout =
  | { kind: 'pane'; paneId: PaneId }
  | {
      kind: 'split';
      direction: SplitDirection;
      ratio: number;
      first: Layout;
      second: Layout;
    };

export type LayoutChoice = 'legacy' | 'master';

export interface Arrangement {
  choice: LayoutChoice;
  order: readonly PaneId[];
}

interface TabShape {
  layout: Layout;
  arrangement: Arrangement;
  zoomedPaneId: PaneId | undefined;
}

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

type MasterPanesResult =
  | { ok: true; panes: PaneRectangle[] }
  | { ok: false; reason: 'insufficientSpace'; required: TerminalSize };

const detachedSize: TerminalSize = { columns: 80, rows: 24 };

export const statusBarRows = 1;

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

// The areas of a split's two children. The second child never gets less than its minimum.
const childAreas = (layout: Layout & { kind: 'split' }, area: Area): readonly [Area, Area] => {
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

    return [
      { ...area, columns },
      {
        ...area,
        x: area.x + columns + gapOf(axis),
        columns: Math.max(secondMinimum, area.columns - columns - gapOf(axis)),
      },
    ];
  }

  const rows = firstExtent(area.rows, layout.ratio, firstMinimum, secondMinimum);

  return [
    { ...area, rows },
    {
      ...area,
      y: area.y + rows,
      rows: Math.max(secondMinimum, area.rows - rows),
    },
  ];
};

const placeLayout = (layout: Layout, area: Area, placed: PaneRectangle[]): void => {
  if (layout.kind === 'pane') {
    placed.push({ paneId: layout.paneId, ...area, terminal: terminalOf(area) });

    return;
  }

  const [firstArea, secondArea] = childAreas(layout, area);

  placeLayout(layout.first, firstArea, placed);
  placeLayout(layout.second, secondArea, placed);
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

const framed = (paneId: PaneId, area: Area): PaneRectangle => ({
  paneId,
  ...area,
  terminal: terminalOf(area),
});

const stackingLimit = 3;

const isStacked = (rightCount: number): boolean => rightCount <= stackingLimit;

const rightRowCount = (rightCount: number): number =>
  isStacked(rightCount) ? rightCount : Math.ceil(rightCount / 2);

const rightColumnsNeeded = (rightCount: number): number =>
  isStacked(rightCount) ? minimumExtent : 2 * minimumExtent + gapOf('right');

const masterRequiredSize = (rightCount: number): TerminalSize => ({
  columns: 2 * rightColumnsNeeded(rightCount) + gapOf('right'),
  rows: rightRowCount(rightCount) * minimumExtent,
});

const rowBand = (area: Area, rowCount: number, row: number): Area => {
  const base = Math.floor(area.rows / rowCount);
  const leftover = area.rows % rowCount;
  const extra = row < leftover ? 1 : 0;

  return { ...area, y: area.y + row * base + Math.min(row, leftover), rows: base + extra };
};

const leftPairColumns = (width: number): number => Math.ceil((width - gapOf('right')) / 2);

const rightPaneArea = (index: number, rightCount: number, right: Area): Area => {
  const row = isStacked(rightCount) ? index : Math.floor(index / 2);
  const band = rowBand(right, rightRowCount(rightCount), row);

  const isLastOddRow = rightCount % 2 === 1 && row === rightRowCount(rightCount) - 1;

  if (isStacked(rightCount) || isLastOddRow) {
    return band;
  }

  const leftColumns = leftPairColumns(right.columns);
  const isLeft = index % 2 === 0;
  const x = isLeft ? right.x : right.x + leftColumns + gapOf('right');
  const columns = isLeft ? leftColumns : right.columns - leftColumns - gapOf('right');

  return { ...band, x, columns };
};

const isPositiveWhole = (extent: number): boolean => Number.isInteger(extent) && extent > 0;

const hasUniqueIds = (order: readonly PaneId[]): boolean => new Set(order).size === order.length;

export const masterPanes = (order: readonly PaneId[], size: TerminalSize): MasterPanesResult => {
  invariant(isPositiveWhole(size.columns), `Cannot place panes in ${size.columns} columns.`);
  invariant(isPositiveWhole(size.rows), `Cannot place panes in ${size.rows} rows.`);
  invariant(hasUniqueIds(order), 'Cannot place the same pane twice.');

  const [masterId, ...rightIds] = order;

  if (masterId === undefined) {
    return { ok: true, panes: [] };
  }

  if (rightIds.length === 0) {
    return { ok: true, panes: layoutPanes({ kind: 'pane', paneId: masterId }, size) };
  }

  const required = masterRequiredSize(rightIds.length);
  const isTooSmall = size.columns < required.columns || size.rows < required.rows;

  if (isTooSmall) {
    return { ok: false, reason: 'insufficientSpace', required };
  }

  const available = size.columns - gapOf('right');
  const masterColumns = Math.round(available / 2);
  const rightX = masterColumns + gapOf('right');
  const master = { x: 0, y: 0, columns: masterColumns, rows: size.rows };
  const right = { x: rightX, y: 0, columns: size.columns - rightX, rows: size.rows };

  const rightPanes = rightIds.map((paneId, index) =>
    framed(paneId, rightPaneArea(index, rightIds.length, right)),
  );

  return { ok: true, panes: [framed(masterId, master), ...rightPanes] };
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

const containsPane = (layout: Layout, target: PaneId): boolean =>
  layout.kind === 'pane'
    ? layout.paneId === target
    : containsPane(layout.first, target) || containsPane(layout.second, target);

export const layoutPaneIds = (layout: Layout): PaneId[] =>
  layout.kind === 'pane'
    ? [layout.paneId]
    : [...layoutPaneIds(layout.first), ...layoutPaneIds(layout.second)];

export const legacyArrangement = (layout: Layout): Arrangement => ({
  choice: 'legacy',
  order: layoutPaneIds(layout),
});

export const masterArrangement = (layout: Layout): Arrangement => ({
  choice: 'master',
  order: layoutPaneIds(layout),
});

export const orderForLayout = (order: readonly PaneId[], layout: Layout): PaneId[] => {
  invariant(hasUniqueIds(order), 'Cannot order the same pane twice.');

  const leaves = layoutPaneIds(layout);
  const repaired = order.filter((id) => leaves.includes(id));

  let at = 0;

  for (const id of leaves) {
    if (!repaired.includes(id)) {
      repaired.splice(at, 0, id);
    }

    at = repaired.indexOf(id) + 1;
  }

  return repaired;
};

export const arrangementForLayout = (arrangement: Arrangement, layout: Layout): Arrangement => ({
  choice: arrangement.choice,
  order: orderForLayout(arrangement.order, layout),
});

const withPane = (
  layout: Layout | undefined,
  previous: PaneId | undefined,
  added: PaneId,
): Layout => {
  const pane: Layout = { kind: 'pane', paneId: added };

  if (layout === undefined) {
    return pane;
  }

  if (previous === undefined) {
    return { kind: 'split', direction: 'right', ratio: 0.5, first: pane, second: layout };
  }

  return splitLayout(layout, previous, 'right', added);
};

const keptLayout = (layout: Layout, order: readonly PaneId[]): Layout | undefined => {
  if (layout.kind === 'pane') {
    return order.includes(layout.paneId) ? layout : undefined;
  }

  const first = keptLayout(layout.first, order);
  const second = keptLayout(layout.second, order);

  if (first === undefined || second === undefined) {
    return first ?? second;
  }

  const isUnchanged = first === layout.first && second === layout.second;

  return isUnchanged ? layout : { ...layout, first, second };
};

export const layoutForOrder = (layout: Layout, order: readonly PaneId[]): Layout | undefined => {
  invariant(hasUniqueIds(order), 'Cannot place the same pane twice.');

  let repaired = keptLayout(layout, order);

  let previous: PaneId | undefined;

  for (const id of order) {
    if (repaired === undefined || !containsPane(repaired, id)) {
      repaired = withPane(repaired, previous, id);
    }

    previous = id;
  }

  return repaired;
};

export const shownLayout = (layout: Layout, zoomedPaneId: PaneId | undefined): Layout =>
  zoomedPaneId === undefined ? layout : { kind: 'pane', paneId: zoomedPaneId };

export const tabPanes = (tab: TabShape, size: TerminalSize): MasterPanesResult => {
  const isMaster = tab.arrangement.choice === 'master' && tab.zoomedPaneId === undefined;

  return isMaster
    ? masterPanes(tab.arrangement.order, size)
    : { ok: true, panes: layoutPanes(shownLayout(tab.layout, tab.zoomedPaneId), size) };
};

// Moves the first child's edge by whole cells, within what both subtrees need. Gives the same
// layout when nothing moves.
const moveEdge = (layout: Layout & { kind: 'split' }, area: Area, movement: number): Layout => {
  const axis = layout.direction;
  const available = (axis === 'right' ? area.columns : area.rows) - gapOf(axis);
  const firstMinimum = minimumOf(layout.first, axis);
  const secondMinimum = minimumOf(layout.second, axis);

  if (available < firstMinimum + secondMinimum) {
    return layout;
  }

  const [firstArea] = childAreas(layout, area);
  const current = axis === 'right' ? firstArea.columns : firstArea.rows;
  const moved = Math.min(Math.max(firstMinimum, current + movement), available - secondMinimum);

  return moved === current ? layout : { ...layout, ratio: moved / available };
};

// Moves the edge of the nearest split around the pane on the direction's axis: `right` and `down`
// toward the end of the area, `left` and `up` toward the start. Gives undefined when the pane has
// no split on that axis.
export const resizeLayout = (
  layout: Layout,
  target: PaneId,
  direction: ResizeDirection,
  cells: number,
  size: TerminalSize,
): Layout | undefined => {
  invariant(Number.isInteger(cells) && cells >= 0, `Cannot resize by ${cells} cells.`);

  const axis: SplitDirection = direction === 'left' || direction === 'right' ? 'right' : 'below';
  const movement = direction === 'right' || direction === 'down' ? cells : -cells;

  const resizeIn = (current: Layout, area: Area): Layout | undefined => {
    if (current.kind === 'pane') {
      return undefined;
    }

    const [firstArea, secondArea] = childAreas(current, area);
    const inFirst = containsPane(current.first, target);

    const inner = inFirst
      ? resizeIn(current.first, firstArea)
      : resizeIn(current.second, secondArea);

    if (inner === (inFirst ? current.first : current.second)) {
      return current;
    }

    if (inner !== undefined) {
      return inFirst ? { ...current, first: inner } : { ...current, second: inner };
    }

    if (current.direction !== axis || !containsPane(current, target)) {
      return undefined;
    }

    return moveEdge(current, area, movement);
  };

  return resizeIn(layout, { x: 0, y: 0, ...size });
};
