import { FrameBufferRenderable, RGBA } from '@opentui/core';
import type { OptimizedBuffer, RenderContext } from '@opentui/core';

import type { PaneId } from '../ids.ts';
import type { PaneRectangle, TerminalSize } from '../layout.ts';

export interface BorderCell {
  x: number;
  y: number;
  glyph: string;
  focused: boolean;
}

interface Neighbors {
  above: PaneId | undefined;
  below: PaneId | undefined;
  left: PaneId | undefined;
  right: PaneId | undefined;
}

// A border cell between two panes points at the focused pane with a heavy arm.
const horizontalGlyph = (neighbors: Neighbors, focused: PaneId | undefined): string => {
  if (neighbors.above !== undefined && neighbors.above === focused) {
    return '┸';
  }

  if (neighbors.below !== undefined && neighbors.below === focused) {
    return '┰';
  }

  return '─';
};

const verticalGlyph = (neighbors: Neighbors, focused: PaneId | undefined): string => {
  if (neighbors.left !== undefined && neighbors.left === focused) {
    return '┥';
  }

  if (neighbors.right !== undefined && neighbors.right === focused) {
    return '┝';
  }

  return '│';
};

const plainGlyphs = new Set(['─', '│']);

const ownersOf = (
  rectangles: readonly PaneRectangle[],
  size: TerminalSize,
): ((x: number, y: number) => PaneId | undefined) => {
  const owners = new Map<number, PaneId>();

  for (const rectangle of rectangles) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.rows; y++) {
      for (let x = rectangle.x; x < rectangle.x + rectangle.columns; x++) {
        owners.set(y * size.columns + x, rectangle.paneId);
      }
    }
  }

  const outside = (x: number, y: number): boolean => {
    const beforeStart = x < 0 || y < 0;
    const pastEnd = x >= size.columns || y >= size.rows;

    return beforeStart || pastEnd;
  };

  return (x, y) => (outside(x, y) ? undefined : owners.get(y * size.columns + x));
};

// Every cell of the area that no pane covers is a border cell.
export const borderCells = (
  rectangles: readonly PaneRectangle[],
  size: TerminalSize,
  focusedPaneId: PaneId | undefined,
): BorderCell[] => {
  const ownerAt = ownersOf(rectangles, size);
  const cells: BorderCell[] = [];

  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.columns; x++) {
      if (ownerAt(x, y) !== undefined) {
        continue;
      }

      const neighbors = {
        above: ownerAt(x, y - 1),
        below: ownerAt(x, y + 1),
        left: ownerAt(x - 1, y),
        right: ownerAt(x + 1, y),
      };

      const betweenRows = neighbors.above !== undefined || neighbors.below !== undefined;

      const glyph = betweenRows
        ? horizontalGlyph(neighbors, focusedPaneId)
        : verticalGlyph(neighbors, focusedPaneId);

      cells.push({ x, y, glyph, focused: !plainGlyphs.has(glyph) });
    }
  }

  return cells;
};

const plainColor = RGBA.fromHex('#666666');

const focusedColor = RGBA.fromHex('#5fafff');

// Draws the borders between panes under them, over the whole pane area.
export class BorderRenderable extends FrameBufferRenderable {
  private size: TerminalSize;
  private cells: readonly BorderCell[] = [];

  public constructor(context: RenderContext, size: TerminalSize) {
    super(context, {
      width: size.columns,
      height: size.rows,
      position: 'absolute',
      left: 0,
      top: 0,
    });

    this.size = size;
  }

  public update(size: TerminalSize, cells: readonly BorderCell[]): void {
    this.width = size.columns;
    this.height = size.rows;
    this.size = size;
    this.cells = cells;
    this.requestRender();
  }

  // The frame buffer is resized during layout, which clears it, so the cells are drawn on render.
  protected override renderSelf(buffer: OptimizedBuffer): void {
    this.frameBuffer.fillRect(0, 0, this.size.columns, this.size.rows, RGBA.defaultBackground());

    for (const cell of this.cells) {
      this.frameBuffer.drawText(
        cell.glyph,
        cell.x,
        cell.y,
        cell.focused ? focusedColor : plainColor,
        RGBA.defaultBackground(),
      );
    }

    super.renderSelf(buffer);
  }
}
