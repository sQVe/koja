import { expect, it } from 'bun:test';

import { paneId } from './ids.ts';
import { canSplit, layoutPanes, paneSize, sideListColumns, sideListWidth } from './layout.ts';
import type { Layout, PaneRectangle } from './layout.ts';

const leaf = (number: number): Layout => ({ kind: 'pane', paneId: paneId(number) });

const split = (direction: 'below' | 'right', first: Layout, second: Layout): Layout => ({
  kind: 'split',
  direction,
  ratio: 0.5,
  first,
  second,
});

const rectangle = (
  id: number,
  frame: [number, number, number, number],
  terminal: [number, number, number, number],
): PaneRectangle => ({
  paneId: paneId(id),
  x: frame[0],
  y: frame[1],
  columns: frame[2],
  rows: frame[3],
  terminal: { x: terminal[0], y: terminal[1], columns: terminal[2], rows: terminal[3] },
});

it('gives a lone pane a terminal over the whole area', () => {
  expect(layoutPanes(leaf(1), { columns: 80, rows: 23 })).toEqual([
    rectangle(1, [0, 0, 80, 23], [0, 0, 80, 23]),
  ]);
});

it('frames both panes of a split', () => {
  const placed = layoutPanes(split('right', leaf(1), leaf(2)), { columns: 80, rows: 23 });

  expect(placed).toHaveLength(2);

  for (const pane of placed) {
    expect(pane.terminal).toEqual({
      x: pane.x + 1,
      y: pane.y + 1,
      columns: pane.columns - 2,
      rows: pane.rows - 2,
    });
  }
});

it('gives a right split two touching frames', () => {
  const placed = layoutPanes(split('right', leaf(1), leaf(2)), { columns: 80, rows: 24 });

  expect(placed).toEqual([
    rectangle(1, [0, 0, 40, 24], [1, 1, 38, 22]),
    rectangle(2, [40, 0, 40, 24], [41, 1, 38, 22]),
  ]);
});

it('gives a below split two touching frames', () => {
  const placed = layoutPanes(split('below', leaf(1), leaf(2)), { columns: 80, rows: 24 });

  expect(placed).toEqual([
    rectangle(1, [0, 0, 80, 12], [1, 1, 78, 10]),
    rectangle(2, [0, 12, 80, 12], [1, 13, 78, 10]),
  ]);
});

it('places a nested split inside the area of its parent child', () => {
  const nested = split('right', leaf(1), split('below', leaf(2), leaf(3)));
  const placed = layoutPanes(nested, { columns: 80, rows: 24 });

  expect(placed).toEqual([
    rectangle(1, [0, 0, 40, 24], [1, 1, 38, 22]),
    rectangle(2, [40, 0, 40, 12], [41, 1, 38, 10]),
    rectangle(3, [40, 12, 40, 12], [41, 13, 38, 10]),
  ]);
});

it('keeps every terminal at least 1x1 when the area is too small to split', () => {
  const placed = layoutPanes(split('right', leaf(1), leaf(2)), { columns: 4, rows: 1 });

  expect(placed.map((pane) => pane.terminal)).toEqual([
    { x: 1, y: 1, columns: 1, rows: 1 },
    { x: 4, y: 1, columns: 1, rows: 1 },
  ]);
});

const frameCellPositions = (placed: PaneRectangle[]): string[] =>
  placed.flatMap(({ x, y, columns, rows }) =>
    Array.from({ length: columns * rows }, (_, index) => ({
      x: x + (index % columns),
      y: y + Math.floor(index / columns),
    }))
      .filter((cell) => {
        const onColumnEdge = cell.x === x || cell.x === x + columns - 1;
        const onRowEdge = cell.y === y || cell.y === y + rows - 1;

        return onColumnEdge || onRowEdge;
      })
      .map((cell) => `${cell.x},${cell.y}`),
  );

it.each([
  ['right', 10, 6],
  ['right', 9, 6],
  ['right', 11, 7],
  ['below', 6, 10],
  ['below', 6, 9],
  ['below', 7, 11],
] as const)(
  'keeps frames apart for nested %s splits resized to %ix%i',
  (direction, columns, rows) => {
    const nested = split(direction, split(direction, leaf(1), leaf(2)), leaf(3));
    const mirrored = split(direction, leaf(1), split(direction, leaf(2), leaf(3)));

    for (const layout of [nested, mirrored]) {
      const placed = layoutPanes(layout, { columns, rows });
      const positions = frameCellPositions(placed);

      expect(new Set(positions).size).toBe(positions.length);
    }
  },
);

it('allows a split only when both panes fit a framed 1x1 terminal', () => {
  expect(canSplit({ columns: 6, rows: 3 }, 'right')).toBe(true);
  expect(canSplit({ columns: 5, rows: 3 }, 'right')).toBe(false);
  expect(canSplit({ columns: 3, rows: 6 }, 'below')).toBe(true);
  expect(canSplit({ columns: 3, rows: 5 }, 'below')).toBe(false);
});

it('gives the pane 80x24 without a client', () => {
  expect(paneSize(undefined)).toEqual({ columns: 80, rows: 24 });
});

it('leaves the side list columns and one client row for the status bar', () => {
  expect(paneSize({ columns: 120, rows: 40 })).toEqual({
    columns: 120 - sideListColumns,
    rows: 39,
  });
});

it('keeps the pane at least 1x1', () => {
  expect(paneSize({ columns: 1, rows: 1 })).toEqual({ columns: 1, rows: 1 });
  expect(paneSize({ columns: 0, rows: 0 })).toEqual({ columns: 1, rows: 1 });
});

it('shows the side list only when the client is wider than 40 columns', () => {
  expect(sideListWidth(41)).toBe(sideListColumns);
  expect(sideListWidth(40)).toBe(0);
  expect(paneSize({ columns: 41, rows: 10 }).columns).toBe(21);
  expect(paneSize({ columns: 40, rows: 10 }).columns).toBe(40);
});
