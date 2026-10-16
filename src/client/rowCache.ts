import { cellWords, ModeFlag, RowFlag, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { PaneRows, RowUpdate } from '../rows/rows.ts';

interface CachedRow {
  // Whether the row soft-wraps into the next row.
  wrapped: boolean;
  // cellWords words per column. Each column's first word is its base code point.
  cells: Uint32Array;
  // The text of each cluster longer than one code point, by the column of its cell.
  clusters: ReadonlyMap<number, string>;
}

export interface RowCache {
  // Stores the update's rows. Returns the indexes, from the active screen's top, of the rows that
  // changed: active screen rows, and negative indexes for changed rows that left the screen.
  apply: (update: RowUpdate) => number[];
  // One row of the active screen, or undefined while the cache has not received it.
  row: (index: number) => CachedRow | undefined;
  // One row by its stable number, or undefined while the cache does not hold it.
  rowAt: (rowNumber: number) => CachedRow | undefined;
  // The stable numbers of the oldest history row and the active screen's top row.
  bounds: () => { oldest: number; activeTop: number; epoch: number } | undefined;
  // Where a view scrolled to the stable row starts, moved inside the history. Undefined when the
  // view follows the bottom: no scroll row, a row at or below the active top, or the alternate
  // screen, which keeps no history.
  viewTop: (scroll: number | undefined) => number | undefined;
  // Keeps the rows from the first to the last stable number of each range when the cache drops
  // rows. Undefined releases them.
  pin: (ranges: readonly RowRange[] | undefined) => void;
  // The span from the first to the last row of the range the cache does not hold.
  missing: (range: RowRange) => RowRange | undefined;
  // Stores rows a range read returned. Returns false for rows of another epoch or while the
  // alternate screen shows, which have no place among the rows held.
  storeRange: (rows: PaneRows) => boolean;
  size: () => { columns: number; rows: number } | undefined;
  cursor: () => { x: number; y: number; visible: boolean } | undefined;
  // The ModeFlag bits that are on.
  modes: () => number;
  // The colors the program set, by slot. Each color is 0x1000000 plus the 0xRRGGBB value.
  colors: () => ReadonlyMap<number, number>;
  heldRowCount: () => number;
}

export interface RowRange {
  from: number;
  to: number;
}

interface RowCacheOptions {
  rowLimit: number;
}

const colorsOf = (words: Uint32Array): Map<number, number> => {
  const colors = new Map<number, number>();

  for (let index = 0; index < words.length; index += 2) {
    colors.set(words[index] ?? 0, words[index + 1] ?? 0);
  }

  return colors;
};

const sameColors = (left: ReadonlyMap<number, number>, right: ReadonlyMap<number, number>) => {
  if (left.size !== right.size) {
    return false;
  }

  for (const [slot, color] of left) {
    if (right.get(slot) !== color) {
      return false;
    }
  }

  return true;
};

const clustersOf = (graphemes: Uint32Array, rowStart: number, stride: number) => {
  const clusters = new Map<number, string>();

  for (let index = 0; index < graphemes.length;) {
    const cellIndex = graphemes[index] ?? 0;
    const length = graphemes[index + 1] ?? 0;

    if (cellIndex >= rowStart && cellIndex < rowStart + stride) {
      const column = (cellIndex - rowStart - rowHeaderWords) / cellWords;
      const codePoints = graphemes.subarray(index + 2, index + 2 + length);

      clusters.set(column, String.fromCodePoint(...codePoints));
    }

    index += 2 + length;
  }

  return clusters;
};

export const createRowCache = ({ rowLimit }: RowCacheOptions): RowCache => {
  const rows = new Map<number, CachedRow>();
  let epoch: number | undefined;
  let oldest = 0;
  let activeTop = 0;
  let pinned: readonly RowRange[] | undefined;
  let size: { columns: number; rows: number } | undefined;
  let cursor: { x: number; y: number; visible: boolean } | undefined;
  let modes = 0;
  let colors: ReadonlyMap<number, number> = new Map();

  const isPinned = (rowNumber: number): boolean =>
    pinned?.some((range) => rowNumber >= range.from && rowNumber <= range.to) === true;

  const dropOldest = (): void => {
    if (rows.size <= rowLimit) {
      return;
    }

    const unpinned = [...rows.keys()].filter((rowNumber) => !isPinned(rowNumber));
    const ascending = unpinned.toSorted((left, right) => left - right);

    for (const rowNumber of ascending.slice(0, rows.size - rowLimit)) {
      rows.delete(rowNumber);
    }
  };

  const changedScreen = (update: RowUpdate): boolean => {
    const bit = ModeFlag.alternateScreen;

    return epoch !== update.epoch || (modes & bit) !== (update.modes & bit);
  };

  const storeRows = (update: RowUpdate): Set<number> => {
    const stride = rowWords(update.size.columns);
    const stored = new Set<number>();

    for (let index = 0; index < update.rowCount; index++) {
      const start = index * stride;
      const offset = (update.cells[start] ?? 0) | 0;
      const rowNumber = update.activeTop + offset;

      rows.set(rowNumber, {
        wrapped: ((update.cells[start + 1] ?? 0) & RowFlag.wrapped) !== 0,
        cells: update.cells.slice(start + rowHeaderWords, start + stride),
        clusters: clustersOf(update.graphemes, start, stride),
      });

      stored.add(rowNumber);
    }

    return stored;
  };

  const storeRange = (read: PaneRows): boolean => {
    const alternate = (modes & ModeFlag.alternateScreen) !== 0;

    if (read.epoch !== epoch || alternate) {
      return false;
    }

    const stride = rowWords(read.columns);

    for (let index = 0; index < read.rowCount; index++) {
      const start = index * stride;

      rows.set(read.first + index, {
        wrapped: ((read.cells[start + 1] ?? 0) & RowFlag.wrapped) !== 0,
        cells: read.cells.slice(start + rowHeaderWords, start + stride),
        clusters: clustersOf(read.graphemes, start, stride),
      });
    }

    dropOldest();

    return true;
  };

  const missing = (range: RowRange): RowRange | undefined => {
    let from: number | undefined;
    let to: number | undefined;

    for (let rowNumber = range.from; rowNumber <= range.to; rowNumber++) {
      if (!rows.has(rowNumber)) {
        from ??= rowNumber;
        to = rowNumber;
      }
    }

    return from === undefined || to === undefined ? undefined : { from, to };
  };

  const viewTop = (scroll: number | undefined): number | undefined => {
    const alternate = (modes & ModeFlag.alternateScreen) !== 0;

    if (scroll === undefined || epoch === undefined || alternate) {
      return undefined;
    }

    const top = Math.max(scroll, oldest);

    return top >= activeTop ? undefined : top;
  };

  const apply = (update: RowUpdate): number[] => {
    if (changedScreen(update)) {
      rows.clear();
    }

    const updatedColors = colorsOf(update.colors);
    const repaintAll = activeTop !== update.activeTop || !sameColors(colors, updatedColors);

    epoch = update.epoch;
    oldest = update.first;
    activeTop = update.activeTop;
    size = update.size;
    cursor = update.cursor;
    modes = update.modes;
    colors = sameColors(colors, updatedColors) ? colors : updatedColors;

    const stored = storeRows(update);

    dropOldest();

    const changed: number[] = [];

    for (const rowNumber of [...stored].toSorted((left, right) => left - right)) {
      if (rowNumber < activeTop && rows.has(rowNumber)) {
        changed.push(rowNumber - activeTop);
      }
    }

    for (let index = 0; index < update.size.rows; index++) {
      const reported = repaintAll || stored.has(activeTop + index);

      if (reported && rows.has(activeTop + index)) {
        changed.push(index);
      }
    }

    return changed;
  };

  return {
    apply,
    row: (index) => rows.get(activeTop + index),
    rowAt: (rowNumber) => rows.get(rowNumber),
    bounds: () => (epoch === undefined ? undefined : { oldest, activeTop, epoch }),
    pin: (ranges) => {
      pinned = ranges;
    },
    missing,
    viewTop,
    storeRange,
    size: () => size,
    cursor: () => cursor,
    modes: () => modes,
    colors: () => colors,
    heldRowCount: () => rows.size,
  };
};
