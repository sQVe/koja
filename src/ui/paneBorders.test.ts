import { afterEach, expect, it } from 'bun:test';

import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';

import { paneId } from '../ids.ts';
import { layoutPanes } from '../layout.ts';
import type { Layout } from '../layout.ts';
import { BorderRenderable, borderCells, frameColor } from './paneBorders.ts';

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

it('draws no frame cells for a lone pane', () => {
  expect(borderCells(layoutPanes(leaf(1), size), paneId(1))).toEqual([]);
});

it('draws two frames with a blank gap column for a right split', () => {
  expect(rowsOf(rightSplit, 1)).toEqual(['┌──┐ ┌─┐', '│  │ │ │', '│  │ │ │', '└──┘ └─┘']);
});

it('draws two touching frames for a below split', () => {
  const stacked = split('below', leaf(1), leaf(2));
  const grid = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => ' '));

  for (const cell of borderCells(layoutPanes(stacked, { columns: 4, rows: 6 }), paneId(1))) {
    const row = grid[cell.y];

    if (row !== undefined) {
      row[cell.x] = cell.glyph;
    }
  }

  expect(grid.map((row) => row.join(''))).toEqual(['┌──┐', '│  │', '└──┘', '┌──┐', '│  │', '└──┘']);
});

it('draws no frame cell in the gap column of a right split', () => {
  const cells = borderCells(layoutPanes(rightSplit, size), paneId(1));

  expect(cells.filter((cell) => cell.x === 4)).toEqual([]);
  expect(cells.filter((cell) => cell.x === 3)).not.toEqual([]);
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

let setup: TestRendererSetup | undefined;

afterEach(() => {
  setup?.renderer.destroy();
  setup = undefined;
});

const startBorders = async () => {
  const created = await createTestRenderer({ width: size.columns, height: size.rows });
  const borders = new BorderRenderable(created.renderer, size);

  setup = created;
  created.renderer.root.add(borders);

  const show = async (layout: Layout, focused: number): Promise<string[]> => {
    borders.update(size, borderCells(layoutPanes(layout, size), paneId(focused)));
    await created.renderOnce();

    return created
      .captureCharFrame()
      .split('\n')
      .slice(0, size.rows)
      .map((line) => line.trimEnd());
  };

  return { show, created, borders };
};

it('draws the frames on screen and replaces them when the layout changes', async () => {
  const { show } = await startBorders();

  expect(await show(rightSplit, 1)).toEqual(['┌──┐ ┌─┐', '│  │ │ │', '│  │ │ │', '└──┘ └─┘']);

  expect(await show(split('below', leaf(1), leaf(2)), 1)).toEqual([
    '┌──────┐',
    '│      │',
    '└──────┘',
    '┌──────┐',
  ]);
});

it('requests a render when the frames change', async () => {
  const { created, borders } = await startBorders();

  await created.flush();
  borders.update(size, borderCells(layoutPanes(rightSplit, size), paneId(1)));

  expect(created.renderer.getSchedulerState().hasScheduledRender).toBe(true);
});

it('draws the focused frame in the accent color', async () => {
  const { show, created } = await startBorders();

  await show(rightSplit, 2);

  const spans = created.captureSpans().lines[0]?.spans ?? [];

  const colorOf = (column: number) => {
    let start = 0;

    for (const span of spans) {
      if (column < start + span.width) {
        return span.fg.toInts().slice(0, 3);
      }

      start += span.width;
    }

    return undefined;
  };

  const cells = borderCells(layoutPanes(rightSplit, size), paneId(2));
  const focused = cells.find((cell) => cell.focused);
  const other = cells.find((cell) => !cell.focused);

  expect(colorOf(5)).toEqual(frameColor(focused!).toInts().slice(0, 3));
  expect(colorOf(0)).toEqual(frameColor(other!).toInts().slice(0, 3));
});
