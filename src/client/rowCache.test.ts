import { expect, it } from 'bun:test';

import {
  cellWords,
  CursorShape,
  decodeRowUpdate,
  encodeRowUpdate,
  ModeFlag,
  PaneRowsSource,
  RowFlag,
  rowHeaderWords,
  rowWords,
} from '../rows/rows.ts';
import type { PaneRows, RowUpdate } from '../rows/rows.ts';
import { createRowCache } from './rowCache.ts';

const columns = 4;

const stride = rowWords(columns);

// Each row is an offset from the active top and the text of its cells.
const rowUpdate = (rows: [number, string][], overrides: Partial<RowUpdate> = {}): RowUpdate => {
  const cells = new Uint32Array(rows.length * stride);

  for (const [index, [offset, text]] of rows.entries()) {
    cells[index * stride] = offset >>> 0;

    for (const [column, character] of text.split('').entries()) {
      cells[index * stride + rowHeaderWords + column * cellWords] = character.codePointAt(0) ?? 0;
    }
  }

  return {
    pane: 1,
    sequence: 1,
    size: { columns, rows: 3 },
    cursor: { x: 0, y: 0, visible: true, shape: CursorShape.default, blinking: false },
    modes: 0,
    epoch: 1,
    first: 0,
    activeTop: 100,
    rowCount: rows.length,
    cells,
    graphemes: new Uint32Array(),
    colors: new Uint32Array(),
    ...overrides,
  };
};

const firstWord = (cache: ReturnType<typeof createRowCache>, index: number) =>
  cache.row(index)?.cells[0];

it('stores rows at their stable numbers and reports the changed screen rows', () => {
  const cache = createRowCache({ rowLimit: 50 });

  expect(
    cache.apply(
      rowUpdate([
        [0, 'a'],
        [2, 'c'],
        [-1, 'z'],
      ]),
    ),
  ).toEqual([-1, 0, 2]);

  expect(firstWord(cache, 0)).toBe(97);
  expect(firstWord(cache, 1)).toBeUndefined();
  expect(firstWord(cache, 2)).toBe(99);
  expect(cache.heldRowCount()).toBe(3);

  const scrolled = rowUpdate([[1, 'd']], { activeTop: 101, sequence: 2 });

  expect(cache.apply(scrolled)).toEqual([1]);
  expect(firstWord(cache, 0)).toBeUndefined();
  expect(firstWord(cache, 1)).toBe(100);
  expect(firstWord(cache, -1)).toBe(97);
});

it('reports every held active row when the active top moves', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(
    rowUpdate([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ]),
  );

  const changed = cache.apply(rowUpdate([[2, 'd']], { activeTop: 101, sequence: 2 }));

  expect(changed).toEqual([0, 1, 2]);
});

it('reports every held active row when only the colors change', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(
    rowUpdate([
      [0, 'a'],
      [1, 'b'],
    ]),
  );

  const colors = Uint32Array.of(1, 0x1_12_34_56);

  expect(cache.apply(rowUpdate([], { colors, sequence: 2 }))).toEqual([0, 1]);
  expect(cache.colors()).toEqual(new Map([[1, 0x1_12_34_56]]));
  expect(cache.apply(rowUpdate([], { colors, sequence: 3 }))).toEqual([]);
});

it('keeps the latest size, cursor, and modes', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(rowUpdate([[0, 'a']]));

  const next = rowUpdate([], {
    size: { columns, rows: 5 },
    cursor: { x: 2, y: 1, visible: false, shape: CursorShape.default, blinking: false },
    modes: ModeFlag.bracketedPaste,
  });

  cache.apply(next);

  expect(cache.size()).toEqual({ columns, rows: 5 });
  expect(cache.cursor()).toMatchObject({ x: 2, y: 1, visible: false });
  expect(cache.modes()).toBe(ModeFlag.bracketedPaste);
  expect(firstWord(cache, 0)).toBe(97);
});

it('reads a grapheme cluster by the column of its cell', () => {
  const cache = createRowCache({ rowLimit: 50 });
  const family = [0x1_f4_68, 0x20_0d, 0x1_f4_69];
  const second = stride + rowHeaderWords + 2 * cellWords;

  const update = rowUpdate(
    [
      [0, 'ab'],
      [1, 'cdef'],
    ],
    {
      graphemes: Uint32Array.of(second, family.length, ...family),
    },
  );

  cache.apply(update);

  expect(cache.row(0)?.clusters.size).toBe(0);
  expect([...(cache.row(1)?.clusters ?? [])]).toEqual([[2, String.fromCodePoint(...family)]]);
});

it('clears the cache when the epoch changes', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(
    rowUpdate([
      [0, 'a'],
      [1, 'b'],
    ]),
  );

  cache.apply(rowUpdate([[2, 'c']], { epoch: 2 }));

  expect(firstWord(cache, 0)).toBeUndefined();
  expect(firstWord(cache, 1)).toBeUndefined();
  expect(firstWord(cache, 2)).toBe(99);
  expect(cache.heldRowCount()).toBe(1);
});

it('clears the cache when the alternate screen turns on or off', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(rowUpdate([[0, 'a']]));
  cache.apply(rowUpdate([[1, 'b']], { modes: ModeFlag.alternateScreen }));

  expect(firstWord(cache, 0)).toBeUndefined();
  expect(cache.heldRowCount()).toBe(1);

  cache.apply(rowUpdate([[2, 'c']], { modes: ModeFlag.alternateScreen | ModeFlag.bracketedPaste }));

  expect(firstWord(cache, 1)).toBe(98);
  expect(cache.heldRowCount()).toBe(2);

  cache.apply(rowUpdate([[0, 'd']]));

  expect(cache.heldRowCount()).toBe(1);
});

it('never holds more than rowLimit rows and drops the lowest row numbers first', () => {
  const cache = createRowCache({ rowLimit: 3 });

  cache.apply(
    rowUpdate([
      [-4, 'a'],
      [-3, 'b'],
      [-2, 'c'],
      [-1, 'd'],
      [0, 'e'],
    ]),
  );

  expect(cache.heldRowCount()).toBe(3);
  expect(firstWord(cache, -2)).toBe(99);
  expect(firstWord(cache, -3)).toBeUndefined();
  expect(firstWord(cache, 0)).toBe(101);

  cache.apply(rowUpdate([[1, 'f']], { sequence: 2 }));

  expect(cache.heldRowCount()).toBe(3);
  expect(firstWord(cache, -2)).toBeUndefined();
  expect(firstWord(cache, 1)).toBe(102);
});

it('does not report an active row that the limit dropped', () => {
  const cache = createRowCache({ rowLimit: 1 });

  expect(
    cache.apply(
      rowUpdate([
        [0, 'a'],
        [1, 'b'],
      ]),
    ),
  ).toEqual([1]);
});

it('keeps the wrapped flag of a row that went through the row update encoding', () => {
  const cache = createRowCache({ rowLimit: 50 });

  const update = rowUpdate([
    [0, 'ab'],
    [1, 'cd'],
  ]);

  update.cells[1] = RowFlag.wrapped;

  const decoded = decodeRowUpdate(encodeRowUpdate(update));

  expect(decoded.ok).toBe(true);

  if (decoded.ok) {
    cache.apply(decoded.update);
  }

  expect(cache.row(0)?.wrapped).toBe(true);
  expect(cache.row(1)?.wrapped).toBe(false);
  expect(firstWord(cache, 0)).toBe(97);
});

it('keeps pinned rows when new rows exceed the row limit', () => {
  const cache = createRowCache({ rowLimit: 3 });

  cache.apply(
    rowUpdate([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ]),
  );

  cache.pin([{ from: 100, to: 101 }]);

  cache.apply(
    rowUpdate(
      [
        [0, 'd'],
        [1, 'e'],
        [2, 'f'],
      ],
      { activeTop: 103, sequence: 2 },
    ),
  );

  expect(cache.rowAt(100)?.cells[0]).toBe(97);
  expect(cache.rowAt(101)?.cells[0]).toBe(98);
  expect(cache.rowAt(102)).toBeUndefined();
  expect(cache.heldRowCount()).toBe(3);
});

it('drops the oldest rows again once nothing is pinned', () => {
  const cache = createRowCache({ rowLimit: 3 });

  cache.apply(rowUpdate([[0, 'a']]));
  cache.pin([{ from: 100, to: 100 }]);

  cache.apply(
    rowUpdate(
      [
        [0, 'd'],
        [1, 'e'],
        [2, 'f'],
      ],
      { activeTop: 103, sequence: 2 },
    ),
  );

  cache.pin(undefined);

  cache.apply(
    rowUpdate(
      [
        [0, 'g'],
        [1, 'h'],
      ],
      { activeTop: 106, sequence: 3 },
    ),
  );

  expect(cache.rowAt(100)).toBeUndefined();
  expect(cache.heldRowCount()).toBe(3);
});

// Rows of a range read: columns wide, starting at the stable row number first.
const paneRows = (first: number, texts: string[], epoch = 1): PaneRows => {
  const cells = new Uint32Array(texts.length * stride);

  for (const [index, text] of texts.entries()) {
    for (const [column, character] of text.split('').entries()) {
      cells[index * stride + rowHeaderWords + column * cellWords] = character.codePointAt(0) ?? 0;
    }
  }

  return {
    pane: 1,
    requestId: 1,
    source: PaneRowsSource.range,
    columns,
    epoch,
    screen: 1,
    remaining: 0,
    oldest: 0,
    first,
    rowCount: texts.length,
    cells,
    graphemes: new Uint32Array(),
  };
};

it('stores fetched rows at their stable numbers and names the span still missing', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(rowUpdate([[0, 'a']], { first: 90 }));

  expect(cache.missing({ from: 95, to: 99 })).toEqual({ from: 95, to: 99 });
  expect(cache.storeRange(paneRows(96, ['x', 'y']))).toBe(true);
  expect(cache.rowAt(96)?.cells[0]).toBe(120);
  expect(cache.rowAt(97)?.cells[0]).toBe(121);
  expect(cache.missing({ from: 95, to: 99 })).toEqual({ from: 95, to: 99 });
  expect(cache.missing({ from: 96, to: 97 })).toBeUndefined();
  expect(cache.bounds()).toEqual({ oldest: 90, activeTop: 100, epoch: 1 });
});

it('refuses fetched rows of another epoch or while the alternate screen shows', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(rowUpdate([[0, 'a']]));

  expect(cache.storeRange(paneRows(96, ['x'], 2))).toBe(false);
  expect(cache.rowAt(96)).toBeUndefined();

  cache.apply(rowUpdate([[0, 'a']], { modes: ModeFlag.alternateScreen, sequence: 2 }));

  expect(cache.storeRange(paneRows(96, ['x']))).toBe(false);
  expect(cache.rowAt(96)).toBeUndefined();
});

it('clamps a scroll row into the history and follows the bottom at or below the active top', () => {
  const cache = createRowCache({ rowLimit: 50 });

  expect(cache.viewTop(50)).toBeUndefined();

  cache.apply(rowUpdate([[0, 'a']], { first: 90 }));

  expect(cache.viewTop(undefined)).toBeUndefined();
  expect(cache.viewTop(95)).toBe(95);
  expect(cache.viewTop(10)).toBe(90);
  expect(cache.viewTop(100)).toBeUndefined();
  expect(cache.viewTop(5000)).toBeUndefined();

  cache.apply(rowUpdate([[0, 'a']], { first: 98, activeTop: 110, sequence: 2 }));

  expect(cache.viewTop(95)).toBe(98);
});

it('follows the bottom on the alternate screen', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(rowUpdate([[0, 'a']], { first: 90, modes: ModeFlag.alternateScreen }));

  expect(cache.viewTop(95)).toBeUndefined();
});

it('reports a changed row that left the active screen as a negative index', () => {
  const cache = createRowCache({ rowLimit: 50 });

  cache.apply(
    rowUpdate([
      [0, 'a'],
      [1, 'b'],
    ]),
  );

  const changed = cache.apply(
    rowUpdate(
      [
        [-1, 'z'],
        [2, 'c'],
      ],
      { activeTop: 101, sequence: 2 },
    ),
  );

  expect(changed).toContain(-1);
  expect(cache.rowAt(100)?.cells[0]).toBe(122);
});
