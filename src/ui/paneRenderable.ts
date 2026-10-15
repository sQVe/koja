import { FrameBufferRenderable, RGBA, TextAttributes } from '@opentui/core';
import type { OptimizedBuffer, RenderContext } from '@opentui/core';

import type { RowCache } from '../client/client.ts';
import {
  CellFlag,
  CellWidth,
  cellWidthMask,
  cellWords,
  defaultBackgroundSlot,
  defaultForegroundSlot,
} from '../rows/rows.ts';

interface PaneRenderableOptions {
  cache: RowCache;
  width: number;
  height: number;
  left?: number;
  top?: number;
  // Called once per render with the newest sequence passed to draw since the last render.
  onDrawn?: (sequence: number) => void;
}

interface Cursor {
  x: number;
  y: number;
  visible: boolean;
}

const rgbColorBase = 0x1_00_00_00;

const paletteLimit = 256;

const byteMask = 0xff;

const redShift = 16;

const greenShift = 8;

const blankCodePoint = 0x20;

const spacerWidths = new Set<number>([CellWidth.spacerTail, CellWidth.spacerHead]);

const flagAttributes: [CellFlag, number][] = [
  [CellFlag.bold, TextAttributes.BOLD],
  [CellFlag.faint, TextAttributes.DIM],
  [CellFlag.italic, TextAttributes.ITALIC],
  [CellFlag.underline, TextAttributes.UNDERLINE],
  [CellFlag.inverse, TextAttributes.INVERSE],
];

const rgbaOf = (word: number): RGBA => {
  const rgb = word - rgbColorBase;

  return RGBA.fromInts(
    (rgb >> redShift) & byteMask,
    (rgb >> greenShift) & byteMask,
    rgb & byteMask,
  );
};

const colorOf = (
  word: number,
  fallback: RGBA,
  programColors: ReadonlyMap<number, number>,
): RGBA => {
  if (word > paletteLimit) {
    return rgbaOf(word);
  }

  const programColor = programColors.get(word - 1);

  if (word !== 0 && programColor !== undefined) {
    return rgbaOf(programColor);
  }

  return word === 0 ? fallback : RGBA.fromIndex(word - 1);
};

const attributesOf = (flags: number): number => {
  let attributes: number = TextAttributes.NONE;

  for (const [flag, attribute] of flagAttributes) {
    if ((flags & flag) !== 0) {
      attributes += attribute;
    }
  }

  return attributes;
};

const isSpacer = (flags: number): boolean => spacerWidths.has(flags & cellWidthMask);

const sameCursor = (left: Cursor | undefined, right: Cursor | undefined): boolean =>
  left?.x === right?.x && left?.y === right?.y && left?.visible === right?.visible;

// Draws the rows of one pane from its row cache. The frame buffer keeps the rows that did not
// change, so each frame draws only the rows named by draw.
export class PaneRenderable extends FrameBufferRenderable {
  private readonly cache: RowCache;
  private readonly pending = new Set<number>();
  private readonly onDrawn: ((sequence: number) => void) | undefined;
  private drawnCursor: Cursor | undefined;
  private drawnColors: ReadonlyMap<number, number> | undefined;
  private viewTop: number | undefined;
  private pendingSequence: number | undefined;

  public constructor(
    context: RenderContext,
    { cache, width, height, left = 0, top = 0, onDrawn }: PaneRenderableOptions,
  ) {
    super(context, { width, height, position: 'absolute', left, top });
    this.cache = cache;
    this.onDrawn = onDrawn;
  }

  // Marks cache rows, counted from the active screen's top, for drawing on the next frame. The
  // sequence is the row update that changed them, if any.
  public draw(rows: readonly number[], sequence?: number): void {
    if (sequence !== undefined) {
      this.pendingSequence = sequence;
    }

    for (const row of rows) {
      const index = this.viewIndexOf(row);

      if (index !== undefined) {
        this.pending.add(index);
      }
    }

    this.requestRender();
  }

  // Scrolls the pane to start at a stable row, or back to the active screen when undefined. The
  // cursor belongs to the active screen, so it shows only there.
  public setTop(top: number | undefined): void {
    if (top === this.viewTop) {
      return;
    }

    this.viewTop = top;
    this.drawAll();
  }

  // Marks every row for drawing, such as after the cache received rows the pane showed blank.
  public drawAll(sequence?: number): void {
    if (sequence !== undefined) {
      this.pendingSequence = sequence;
    }

    for (let index = 0; index < this.height; index++) {
      this.pending.add(index);
    }

    this.requestRender();
  }

  public move(left: number, top: number): void {
    this.left = left;
    this.top = top;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    this.drawPending();
    super.renderSelf(buffer);

    const sequence = this.pendingSequence;

    this.pendingSequence = undefined;

    if (sequence !== undefined) {
      this.onDrawn?.(sequence);
    }
  }

  private viewIndexOf(activeRow: number): number | undefined {
    if (this.viewTop === undefined) {
      return activeRow >= 0 ? activeRow : undefined;
    }

    const activeTop = this.cache.bounds()?.activeTop ?? 0;
    const index = activeTop + activeRow - this.viewTop;

    return index >= 0 && index < this.height ? index : undefined;
  }

  private shownCursor(): Cursor | undefined {
    return this.viewTop === undefined ? this.cache.cursor() : undefined;
  }

  private drawPending(): void {
    const colors = this.cache.colors();

    if (colors !== this.drawnColors) {
      this.drawnColors = colors;

      for (let index = 0; index < this.height; index++) {
        this.pending.add(index);
      }
    }

    const cursor = this.shownCursor();

    if (!sameCursor(cursor, this.drawnCursor)) {
      this.pending.add(this.drawnCursor?.y ?? -1);
      this.pending.add(cursor?.y ?? -1);
      this.drawnCursor = cursor === undefined ? undefined : { ...cursor };
    }

    for (const index of this.pending) {
      this.drawRow(index);
    }

    this.pending.clear();
  }

  private defaultColor(slot: number, theme: RGBA): RGBA {
    const programColor = this.cache.colors().get(slot);

    return programColor === undefined ? theme : rgbaOf(programColor);
  }

  private drawRow(index: number): void {
    if (index >= this.frameBuffer.height) {
      return;
    }

    const fill = this.defaultColor(defaultBackgroundSlot, RGBA.defaultBackground());

    this.frameBuffer.fillRect(0, index, this.frameBuffer.width, 1, fill);

    const row =
      this.viewTop === undefined ? this.cache.row(index) : this.cache.rowAt(this.viewTop + index);

    if (row === undefined) {
      return;
    }

    const cursor = this.shownCursor();
    const cursorColumn = cursor?.visible === true && cursor.y === index ? cursor.x : undefined;
    const columns = Math.min(row.cells.length / cellWords, this.frameBuffer.width);

    for (let column = 0; column < columns; column++) {
      this.drawCell(row, column, index, column === cursorColumn);
    }
  }

  private drawCell(
    row: NonNullable<ReturnType<RowCache['row']>>,
    column: number,
    y: number,
    atCursor: boolean,
  ): void {
    const start = column * cellWords;
    const flags = row.cells[start + cellWords - 1] ?? 0;

    if (isSpacer(flags)) {
      return;
    }

    const codePoint = row.cells[start] ?? 0;

    const text =
      row.clusters.get(column) ??
      String.fromCodePoint(codePoint === 0 ? blankCodePoint : codePoint);

    const programColors = this.cache.colors();
    const defaultForeground = this.defaultColor(defaultForegroundSlot, RGBA.defaultForeground());
    const defaultBackground = this.defaultColor(defaultBackgroundSlot, RGBA.defaultBackground());
    const foreground = colorOf(row.cells[start + 1] ?? 0, defaultForeground, programColors);
    const background = colorOf(row.cells[start + 2] ?? 0, defaultBackground, programColors);
    const shownFlags = atCursor ? flags ^ CellFlag.inverse : flags;

    this.frameBuffer.drawText(text, column, y, foreground, background, attributesOf(shownFlags));
  }
}
