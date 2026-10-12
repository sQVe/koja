import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { layoutPanes } from '../layout.ts';
import type { Layout } from '../layout.ts';
import { borderCells, frameColor } from './paneBorders.ts';

const leaf = (id: number): Layout => ({ kind: 'pane', paneId: paneId(id) });

const split = (direction: 'below' | 'right', first: Layout, second: Layout): Layout => ({
  kind: 'split',
  direction,
  ratio: 0.5,
  first,
  second,
});

const rightSplit = split('right', leaf(1), leaf(2));
const size = { columns: 8, rows: 4 };

const rowsOf = (layout: Layout, focused: number): string[] => {
  const grid = Array.from({ length: size.rows }, () =>
    Array.from({ length: size.columns }, () => ' '),
  );

  for (const cell of borderCells(layoutPanes(layout, size), paneId(focused))) {
    const row = grid[cell.y];

    if (row !== undefined) {
      row[cell.x] = cell.glyph;
    }
  }

  return grid.map((row) => row.join(''));
};

it('draws a full frame around a lone pane', () => {
  expect(rowsOf(leaf(1), 1)).toEqual(['┌──────┐', '│      │', '│      │', '└──────┘']);
});

it('draws two touching frames for a right split', () => {
  expect(rowsOf(rightSplit, 1)).toEqual(['┌──┐┌──┐', '│  ││  │', '│  ││  │', '└──┘└──┘']);
});

it('draws a frame per pane for a nested split without junction glyphs', () => {
  const nested = split('right', leaf(1), split('below', leaf(2), leaf(3)));

  const cells = borderCells(layoutPanes(nested, { columns: 8, rows: 6 }), paneId(2));
  const glyphs = cells.map((cell) => cell.glyph);

  expect(glyphs.filter((glyph) => glyph === '┌')).toHaveLength(3);
  expect(glyphs.filter((glyph) => glyph === '┘')).toHaveLength(3);
  expect(glyphs.every((glyph) => '┌┐└┘│─'.includes(glyph))).toBe(true);
});

it('colors the focused frame with the accent and the others dim', () => {
  const cells = borderCells(layoutPanes(rightSplit, size), paneId(2));
  const focusedCells = cells.filter((cell) => cell.x >= 4);
  const otherCells = cells.filter((cell) => cell.x < 4);
  const accent = frameColor(focusedCells[0]!);
  const dim = frameColor(otherCells[0]!);

  expect(accent.equals(dim)).toBe(false);
  expect(focusedCells.every((cell) => frameColor(cell).equals(accent))).toBe(true);
  expect(otherCells.every((cell) => frameColor(cell).equals(dim))).toBe(true);
});

it('dims every frame when no pane is focused', () => {
  const cells = borderCells(layoutPanes(rightSplit, size), undefined);

  expect(cells.every((cell) => !cell.focused)).toBe(true);
});
