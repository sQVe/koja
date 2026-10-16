import { expect, it } from 'bun:test';

import { paneId } from './ids.ts';
import {
  canSplit,
  firstPaneId,
  layoutPanes,
  paneSize,
  removePane,
  resizeLayout,
  shownLayout,
  sideListColumns,
  sideListWidth,
  splitLayout,
} from './layout.ts';
import type { Layout, PaneRectangle, TerminalSize } from './layout.ts';

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

it('leaves one gap column between the frames of a right split', () => {
  const placed = layoutPanes(split('right', leaf(1), leaf(2)), { columns: 81, rows: 24 });

  expect(placed).toEqual([
    rectangle(1, [0, 0, 40, 24], [1, 1, 38, 22]),
    rectangle(2, [41, 0, 40, 24], [42, 1, 38, 22]),
  ]);
});

it('leaves no gap row between the frames of a below split', () => {
  const placed = layoutPanes(split('below', leaf(1), leaf(2)), { columns: 80, rows: 24 });

  expect(placed).toEqual([
    rectangle(1, [0, 0, 80, 12], [1, 1, 78, 10]),
    rectangle(2, [0, 12, 80, 12], [1, 13, 78, 10]),
  ]);
});

it('leaves a gap column but no gap row in a nested split', () => {
  const nested = split('right', leaf(1), split('below', leaf(2), leaf(3)));
  const placed = layoutPanes(nested, { columns: 81, rows: 24 });

  expect(placed).toEqual([
    rectangle(1, [0, 0, 40, 24], [1, 1, 38, 22]),
    rectangle(2, [41, 0, 40, 12], [42, 1, 38, 10]),
    rectangle(3, [41, 12, 40, 12], [42, 13, 38, 10]),
  ]);
});

it('keeps every terminal at least 1x1 when the area is too small to split', () => {
  const placed = layoutPanes(split('right', leaf(1), leaf(2)), { columns: 4, rows: 1 });

  expect(placed.map((pane) => pane.terminal)).toEqual([
    { x: 1, y: 1, columns: 1, rows: 1 },
    { x: 5, y: 1, columns: 1, rows: 1 },
  ]);
});

const ratioSplit = (
  direction: 'below' | 'right',
  ratio: number,
  first: Layout,
  second: Layout,
): Layout => ({ kind: 'split', direction, ratio, first, second });

it('keeps the second pane at its minimum when the ratio would take its cells', () => {
  const placed = layoutPanes(ratioSplit('right', 0.99, leaf(1), leaf(2)), {
    columns: 81,
    rows: 24,
  });

  expect(placed.map((pane) => pane.columns)).toEqual([77, 3]);
});

it('gives a subtree the larger minimum of its children on the other axis', () => {
  const stacked = split('below', leaf(2), split('right', leaf(3), leaf(4)));
  const placed = layoutPanes(ratioSplit('right', 0.9, leaf(1), stacked), { columns: 40, rows: 24 });

  expect(placed.map((pane) => pane.columns)).toEqual([32, 7, 3, 3]);
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
  ['right', 12, 6],
  ['right', 11, 6],
  ['right', 13, 7],
  ['below', 6, 11],
  ['below', 6, 10],
  ['below', 7, 12],
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

it('allows a split only when both panes fit, and a right split also fits its gap column', () => {
  expect(canSplit({ columns: 7, rows: 3 }, 'right')).toBe(true);
  expect(canSplit({ columns: 6, rows: 3 }, 'right')).toBe(false);
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

const frameOf = (layout: Layout, size: TerminalSize, number: number): PaneRectangle => {
  const found = layoutPanes(layout, size).find((placed) => placed.paneId === paneId(number));

  if (found === undefined) {
    throw new Error(`No pane ${number}`);
  }

  return found;
};

const area = { columns: 81, rows: 25 };

const nested = split('right', split('below', leaf(1), leaf(2)), leaf(3));

it('shows the zoomed pane alone, or the whole layout', () => {
  expect(shownLayout(nested, paneId(2))).toEqual(leaf(2));
  expect(shownLayout(nested, undefined)).toBe(nested);
});

it('grows the left pane of a right split by one column per cell with right', () => {
  const resized = resizeLayout(nested, paneId(1), 'right', 2, area) as Layout;

  expect(frameOf(resized, area, 1).columns).toBe(42);
  expect(frameOf(resized, area, 3).columns).toBe(38);
});

it('shrinks the right pane of a right split with right, from either side', () => {
  const resized = resizeLayout(nested, paneId(3), 'right', 3, area) as Layout;

  expect(frameOf(resized, area, 1).columns).toBe(43);
  expect(frameOf(resized, area, 3).columns).toBe(37);
});

it('moves the edge left with left', () => {
  const fromLeft = resizeLayout(nested, paneId(2), 'left', 4, area) as Layout;
  const fromRight = resizeLayout(nested, paneId(3), 'left', 4, area) as Layout;

  expect(frameOf(fromLeft, area, 1).columns).toBe(36);
  expect(frameOf(fromRight, area, 3).columns).toBe(44);
});

it('moves a below split edge down and up by rows', () => {
  const down = resizeLayout(nested, paneId(1), 'down', 2, area) as Layout;
  const up = resizeLayout(nested, paneId(2), 'up', 3, area) as Layout;

  expect(frameOf(down, area, 1).rows).toBe(15);
  expect(frameOf(down, area, 2).rows).toBe(10);
  expect(frameOf(up, area, 1).rows).toBe(10);
  expect(frameOf(up, area, 2).rows).toBe(15);
});

it('resizes the nearest split on the axis', () => {
  const columns = split('right', leaf(1), split('right', leaf(2), leaf(3)));
  const resized = resizeLayout(columns, paneId(3), 'left', 2, area) as Layout;
  const before = layoutPanes(columns, area);
  const after = layoutPanes(resized, area);

  expect(after[0]).toEqual(before[0]);
  expect(after[1]?.columns).toBe((before[1]?.columns ?? 0) - 2);
  expect(after[2]?.columns).toBe((before[2]?.columns ?? 0) + 2);
});

it('stops at a framed 1x1 terminal', () => {
  const pair = split('right', leaf(1), leaf(2));
  const right = resizeLayout(pair, paneId(1), 'right', 500, area) as Layout;
  const left = resizeLayout(pair, paneId(1), 'left', 500, area) as Layout;

  expect(frameOf(right, area, 2).terminal.columns).toBe(1);
  expect(frameOf(left, area, 1).terminal.columns).toBe(1);
});

it('gives the same layout when the edge cannot move', () => {
  const pair = split('right', leaf(1), leaf(2));
  const clamped = resizeLayout(pair, paneId(1), 'left', 500, area) as Layout;

  expect(resizeLayout(clamped, paneId(1), 'left', 1, area)).toBe(clamped);
});

it('gives nothing when the pane has no split on the axis', () => {
  expect(resizeLayout(leaf(1), paneId(1), 'left', 1, area)).toBeUndefined();
  expect(resizeLayout(split('right', leaf(1), leaf(2)), paneId(1), 'up', 1, area)).toBeUndefined();
  expect(resizeLayout(nested, paneId(3), 'down', 1, area)).toBeUndefined();
});

it('gives nothing to move when the area cannot hold both subtrees', () => {
  const pair = split('right', leaf(1), leaf(2));

  expect(resizeLayout(pair, paneId(1), 'right', 1, { columns: 6, rows: 25 })).toBe(pair);
});

it('keeps the far end clear for the second subtree when the edge moves past it', () => {
  const pair = split('right', leaf(1), leaf(2));
  const moved = resizeLayout(pair, paneId(1), 'right', 500, area) as Layout;
  const wider = layoutPanes(moved, { columns: 161, rows: 25 });

  expect(wider.map((pane) => pane.columns)).toEqual([154, 6]);
});

it('gives the same layout when a nested edge cannot move', () => {
  const inner = split('right', leaf(1), leaf(2));
  const outer = split('below', inner, leaf(3));
  const clamped = resizeLayout(outer, paneId(1), 'left', 500, area) as Layout;

  expect(resizeLayout(clamped, paneId(1), 'left', 1, area)).toBe(clamped);
});

it('gives the same layout when resizing by no cells', () => {
  const pair = split('right', leaf(1), leaf(2));

  expect(resizeLayout(pair, paneId(1), 'right', 0, area)).toBe(pair);
});

it('finds the first pane of a layout', () => {
  expect(firstPaneId(leaf(4))).toBe(paneId(4));
  expect(firstPaneId(split('right', split('below', leaf(2), leaf(3)), leaf(1)))).toBe(paneId(2));
});

it('splits only the target pane in half and puts the new pane second', () => {
  const layout = split('right', leaf(1), leaf(2));
  const result = splitLayout(layout, paneId(2), 'below', paneId(3));

  expect(result).toEqual(split('right', leaf(1), split('below', leaf(2), leaf(3))));
});

it('splits a lone pane', () => {
  expect(splitLayout(leaf(1), paneId(1), 'right', paneId(2))).toEqual(
    split('right', leaf(1), leaf(2)),
  );
});

it('keeps the ratio of the splits around the target when it splits', () => {
  const layout = ratioSplit('right', 0.3, leaf(1), leaf(2));
  const result = splitLayout(layout, paneId(1), 'below', paneId(3));

  expect(result).toEqual(ratioSplit('right', 0.3, split('below', leaf(1), leaf(3)), leaf(2)));
});

it('gives nothing to remove from a lone pane', () => {
  expect(removePane(leaf(1), paneId(1))).toBeUndefined();
});

it('gives the second child back when the first child is removed', () => {
  const layout = split('right', leaf(1), split('below', leaf(2), leaf(3)));
  const second = split('below', leaf(2), leaf(3));

  expect(removePane(layout, paneId(1))).toEqual({ layout: second, sibling: second });
});

it('gives the first child back when the second child is removed', () => {
  const layout = split('right', split('below', leaf(1), leaf(2)), leaf(3));
  const first = split('below', leaf(1), leaf(2));

  expect(removePane(layout, paneId(3))).toEqual({ layout: first, sibling: first });
});

it('removes a pane from the first subtree and keeps the rest', () => {
  const layout = ratioSplit('right', 0.3, split('below', leaf(1), leaf(2)), leaf(3));

  expect(removePane(layout, paneId(2))).toEqual({
    layout: ratioSplit('right', 0.3, leaf(1), leaf(3)),
    sibling: leaf(1),
  });
});

it('removes a pane from the second subtree and keeps the rest', () => {
  const layout = ratioSplit('right', 0.3, leaf(1), split('below', leaf(2), leaf(3)));

  expect(removePane(layout, paneId(3))).toEqual({
    layout: ratioSplit('right', 0.3, leaf(1), leaf(2)),
    sibling: leaf(2),
  });
});

it('removes a pane from a split of two splits', () => {
  const layout = split('right', split('below', leaf(1), leaf(2)), split('below', leaf(3), leaf(4)));

  expect(removePane(layout, paneId(4))).toEqual({
    layout: split('right', split('below', leaf(1), leaf(2)), leaf(3)),
    sibling: leaf(3),
  });
});

it('gives nothing to remove when the pane is not in the layout', () => {
  const layout = split('right', split('below', leaf(1), leaf(2)), leaf(3));

  expect(removePane(layout, paneId(9))).toBeUndefined();
});
