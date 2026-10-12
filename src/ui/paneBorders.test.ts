import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { layoutPanes } from '../layout.ts';
import type { Layout } from '../layout.ts';
import { borderCells } from './paneBorders.ts';

const leaf = (id: number): Layout => ({ kind: 'pane', paneId: paneId(id) });

it('draws a vertical border toward the focused pane for a right split', () => {
  const size = { columns: 5, rows: 2 };

  const layout: Layout = {
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: leaf(1),
    second: leaf(2),
  };

  const cells = borderCells(layoutPanes(layout, size), size, paneId(1));

  expect(cells).toEqual([
    { x: 2, y: 0, glyph: '┥', focused: true },
    { x: 2, y: 1, glyph: '┥', focused: true },
  ]);
});

it('draws a horizontal border toward the focused pane for a below split', () => {
  const size = { columns: 3, rows: 3 };

  const layout: Layout = {
    kind: 'split',
    direction: 'below',
    ratio: 0.5,
    first: leaf(1),
    second: leaf(2),
  };

  const cells = borderCells(layoutPanes(layout, size), size, paneId(2));

  expect(cells.map((cell) => cell.glyph)).toEqual(['┰', '┰', '┰']);
});

it('keeps a plain border and joins nested borders without marking an unfocused pane', () => {
  const size = { columns: 7, rows: 5 };

  const layout: Layout = {
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: leaf(1),
    second: { kind: 'split', direction: 'below', ratio: 0.5, first: leaf(2), second: leaf(3) },
  };

  const cells = borderCells(layoutPanes(layout, size), size, paneId(9));

  expect(cells.every((cell) => !cell.focused)).toBe(true);
  expect(cells.filter((cell) => cell.glyph === '│')).toHaveLength(5);
  expect(cells.filter((cell) => cell.glyph === '─')).toHaveLength(3);
});
