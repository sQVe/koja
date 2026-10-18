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

const frameCellsOf = (rectangle: PaneRectangle, focused: boolean): BorderCell[] => {
  const { x, y, columns, rows } = rectangle;
  const right = x + columns - 1;
  const bottom = y + rows - 1;
  const cells: BorderCell[] = [];

  const put = (cellX: number, cellY: number, glyph: string): void => {
    cells.push({ x: cellX, y: cellY, glyph, focused });
  };

  // Stryker disable next-line EqualityOperator: The corner is drawn after the edge.
  for (let cellX = x + 1; cellX < right; cellX++) {
    put(cellX, y, '─');
    put(cellX, bottom, '─');
  }

  // Stryker disable next-line EqualityOperator: The corner is drawn after the edge.
  for (let cellY = y + 1; cellY < bottom; cellY++) {
    put(x, cellY, '│');
    put(right, cellY, '│');
  }

  put(x, y, '┌');
  put(right, y, '┐');
  put(x, bottom, '└');
  put(right, bottom, '┘');

  return cells;
};

// Every pane of a split tab gets a frame on the outer ring of its rectangle. Only the focused frame
// is marked. A lone pane has none.
export const borderCells = (
  rectangles: readonly PaneRectangle[],
  focusedPaneId: PaneId | undefined,
): BorderCell[] => {
  if (rectangles.length < 2) {
    return [];
  }

  return rectangles.flatMap((rectangle) =>
    frameCellsOf(rectangle, rectangle.paneId === focusedPaneId),
  );
};

const dimColor = RGBA.fromHex('#666666');

const accentColor = RGBA.fromHex('#5fafff');

export const frameColor = (cell: BorderCell): RGBA => (cell.focused ? accentColor : dimColor);

// Draws the borders between panes under them, over the whole pane area.
export class BorderRenderable extends FrameBufferRenderable {
  private size: TerminalSize;
  // Stryker disable next-line ArrayDeclaration: Initial value.
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
        frameColor(cell),
        RGBA.defaultBackground(),
      );
    }

    super.renderSelf(buffer);
  }
}
