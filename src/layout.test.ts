import { expect, it } from 'bun:test';

import { paneId } from './ids.ts';
import { layoutPanes, paneSize, sideListColumns, sideListWidth } from './layout.ts';
import type { Layout } from './layout.ts';

const leaf = (number: number): Layout => ({ kind: 'pane', paneId: paneId(number) });

const split = (direction: 'below' | 'right', first: Layout, second: Layout): Layout => ({
  kind: 'split',
  direction,
  ratio: 0.5,
  first,
  second,
});

it('gives a right split two panes with a border column between them', () => {
  const placed = layoutPanes(split('right', leaf(1), leaf(2)), { columns: 81, rows: 24 });

  expect(placed).toEqual([
    { paneId: paneId(1), x: 0, y: 0, columns: 40, rows: 24 },
    { paneId: paneId(2), x: 41, y: 0, columns: 40, rows: 24 },
  ]);
});

it('gives a below split two panes with a border row between them', () => {
  const placed = layoutPanes(split('below', leaf(1), leaf(2)), { columns: 80, rows: 25 });

  expect(placed).toEqual([
    { paneId: paneId(1), x: 0, y: 0, columns: 80, rows: 12 },
    { paneId: paneId(2), x: 0, y: 13, columns: 80, rows: 12 },
  ]);
});

it('places a nested split inside the area of its parent child', () => {
  const nested = split('right', leaf(1), split('below', leaf(2), leaf(3)));
  const placed = layoutPanes(nested, { columns: 81, rows: 25 });

  expect(placed).toEqual([
    { paneId: paneId(1), x: 0, y: 0, columns: 40, rows: 25 },
    { paneId: paneId(2), x: 41, y: 0, columns: 40, rows: 12 },
    { paneId: paneId(3), x: 41, y: 13, columns: 40, rows: 12 },
  ]);
});

it('keeps every pane at least 1x1 when the area is too small for the border', () => {
  const placed = layoutPanes(split('right', leaf(1), leaf(2)), { columns: 2, rows: 1 });

  expect(placed.map(({ columns, rows }) => ({ columns, rows }))).toEqual([
    { columns: 1, rows: 1 },
    { columns: 1, rows: 1 },
  ]);
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
