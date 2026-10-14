import { expect, it } from 'bun:test';

import {
  CellFlag,
  CellWidth,
  cellWords,
  decodePaneInput,
  decodeRowUpdate,
  encodePaneInput,
  encodeRowUpdate,
  ModeFlag,
  RowFlag,
  rowHeaderWords,
  rowsToLines,
  rowUpdateBytes,
  rowWords,
} from './rows.ts';
import type { RowUpdate } from './rows.ts';

const columns = 80;

// One row of text in the frame layout, starting with its offset from the active top. The text
// holds no characters outside the Basic Multilingual Plane.
const textRow = (offset: number, text: string) => {
  const row = new Uint32Array(rowWords(columns));

  row[0] = offset >>> 0;

  for (let column = 0; column < text.length; column++) {
    row[rowHeaderWords + column * cellWords] = text.charCodeAt(column);
  }

  return row;
};

const joinRows = (rows: Uint32Array[]) => {
  const cells = new Uint32Array(rows.length * rowWords(columns));

  rows.forEach((row, index) => {
    cells.set(row, index * rowWords(columns));
  });

  return cells;
};

const rowUpdate = (overrides: Partial<RowUpdate> = {}): RowUpdate => ({
  pane: 3,
  sequence: 41,
  size: { columns, rows: 24 },
  cursor: { x: 5, y: 0, visible: true },
  modes: ModeFlag.bracketedPaste | ModeFlag.sgrMouse,
  epoch: 2,
  first: 0,
  activeTop: 0,
  rowCount: 1,
  cells: textRow(0, 'hello'),
  graphemes: new Uint32Array(),
  colors: new Uint32Array(),
  ...overrides,
});

it('reads rows as text with clusters and wide spacers, preserving leading and interior spaces', () => {
  const cells = textRow(0, ' 中 e  x   ');

  cells[rowHeaderWords + cellWords + 3] = CellWidth.wide;
  cells[rowHeaderWords + 2 * cellWords + 3] = CellWidth.spacerTail;
  cells[rowHeaderWords + 3 * cellWords + 3] = CellFlag.grapheme;
  cells[rowHeaderWords + 9 * cellWords + 3] = CellWidth.spacerHead;

  const range = {
    rowCount: 2,
    cells: joinRows([cells, textRow(1, '')]),
    graphemes: Uint32Array.of(rowHeaderWords + 3 * cellWords, 2, 0x65, 0x3_01),
  };

  expect(rowsToLines(range, columns, false)).toEqual([' 中é  x', '']);
});

const roundTrip = (update: RowUpdate) => decodeRowUpdate(encodeRowUpdate(update));

const wrappedRow = (offset: number, text: string, wrapped = true) => {
  const row = textRow(offset, text);

  row[1] = wrapped ? RowFlag.wrapped : 0;

  return row;
};

it('returns one line per row without unwrap', () => {
  const range = {
    rowCount: 3,
    cells: joinRows([wrappedRow(0, 'abc'), wrappedRow(1, 'def', false), textRow(2, 'g')]),
    graphemes: new Uint32Array(),
  };

  expect(rowsToLines(range, columns, false)).toEqual(['abc', 'def', 'g']);
});

it('joins soft-wrapped rows with unwrap and keeps a wrapped row trailing spaces', () => {
  const range = {
    rowCount: 3,
    cells: joinRows([
      wrappedRow(0, 'ab  '),
      wrappedRow(1, 'cd', false),
      wrappedRow(2, 'e   ', false),
    ]),
    graphemes: new Uint32Array(),
  };

  const padded = 'ab  '.padEnd(columns, ' ');

  expect(rowsToLines(range, columns, true)).toEqual([`${padded}cd`, 'e']);
});

it('skips wide-character spacer cells when joining wrapped rows', () => {
  const first = wrappedRow(0, '中 a');
  const second = textRow(1, 'b');

  first[rowHeaderWords + 3] = CellWidth.wide;
  first[rowHeaderWords + cellWords + 3] = CellWidth.spacerTail;
  first[rowHeaderWords + (columns - 1) * cellWords + 3] = CellWidth.spacerHead;

  const range = { rowCount: 2, cells: joinRows([first, second]), graphemes: new Uint32Array() };

  expect(rowsToLines(range, columns, true)).toEqual([`中a${' '.repeat(columns - 4)}b`]);
});

it('round-trips the wrapped flag of a row', () => {
  const cells = joinRows([wrappedRow(0, 'abc'), wrappedRow(1, 'def', false)]);
  const decoded = roundTrip(rowUpdate({ rowCount: 2, cells }));

  expect(decoded.ok && decoded.update.cells).toEqual(cells);
});

it('round-trips a row update with one row, a cursor, and modes', () => {
  const update = rowUpdate();

  expect(roundTrip(update)).toEqual({ ok: true, update });
});

it('round-trips a row update with changed colors', () => {
  const update = rowUpdate({ colors: Uint32Array.of(1, 0x1_12_34_56, 257, 0x1_00_00_00) });

  expect(roundTrip(update)).toEqual({ ok: true, update });
});

it('round-trips colors beside rows and clusters', () => {
  const update = rowUpdate({
    colors: Uint32Array.of(255, 0x1_ff_ff_ff),
    graphemes: Uint32Array.of(rowHeaderWords, 2, 0x65, 0x3_01),
  });

  expect(roundTrip(update)).toEqual({ ok: true, update });
});

it('counts the colors in the byte size of an encoded update', () => {
  const update = rowUpdate({ colors: Uint32Array.of(1, 0x1_12_34_56, 257, 0x1_00_00_00) });

  expect(rowUpdateBytes(update)).toBe(encodeRowUpdate(update).length);
});

it.each([
  ['an odd number of words', Uint32Array.of(1, 0x1_00_00_00, 2)],
  ['a slot past the default background', Uint32Array.of(258, 0x1_00_00_00)],
  ['a color without the marker bit', Uint32Array.of(1, 0x12_34_56)],
  ['a color with bits above the marker', Uint32Array.of(1, 0x3_00_00_00)],
])('refuses to encode colors with %s', (_name, colors) => {
  expect(() => encodeRowUpdate(rowUpdate({ colors }))).toThrow();
});

it('round-trips a departed row, a wide character, a cluster, and row numbers above 2^32', () => {
  const departed = textRow(-3, 'gone');
  const onScreen = textRow(0, '中 e');
  const family = [0x1_f4_68, 0x20_0d, 0x1_f4_69];

  onScreen[rowHeaderWords + 3] = CellWidth.wide;
  onScreen[rowHeaderWords + cellWords + 3] = CellWidth.spacerTail;
  onScreen[rowHeaderWords + 3 * cellWords] = family[0] ?? 0;

  const clusterCell = rowWords(columns) + rowHeaderWords + 3 * cellWords;

  const update = rowUpdate({
    first: 2 ** 32 + 7,
    activeTop: 2 ** 52 + 5,
    rowCount: 2,
    cells: joinRows([departed, onScreen]),
    graphemes: Uint32Array.of(clusterCell, family.length, ...family),
  });

  const result = roundTrip(update);

  expect(result).toEqual({ ok: true, update });
  expect(result.ok && (result.update.cells[0] ?? 0) | 0).toBe(-3);
});

it('keeps a decoded update when the caller reuses its buffer', () => {
  const bytes = encodeRowUpdate(rowUpdate());
  const result = decodeRowUpdate(bytes);

  bytes.fill(0xff);

  expect(result).toEqual({ ok: true, update: rowUpdate() });
});

// Encodes a valid update, then changes its words the way a broken peer would.
const corrupted = (update: RowUpdate, change: (words: Uint32Array) => Uint32Array) => {
  const encoded = encodeRowUpdate(update);
  const words = new Uint32Array(encoded.buffer.slice(0));

  return new Uint8Array(change(words).slice().buffer);
};

const clusterUpdate = (cellIndex: number, length = 2) =>
  rowUpdate({ graphemes: Uint32Array.of(cellIndex, length, 0x65, 0x3_01) });

it.each([
  ['bytes that end inside a word', encodeRowUpdate(rowUpdate()).subarray(0, -1), 'wrongLength'],
  ['bytes that end inside the header', encodeRowUpdate(rowUpdate()).subarray(0, 40), 'wrongLength'],
  [
    'a row count larger than the payload',
    corrupted(rowUpdate(), (words) => words.with(13, 2)),
    'rowCountMismatch',
  ],
  ['rows cut short', corrupted(rowUpdate(), (words) => words.subarray(0, -1)), 'rowCountMismatch'],
  [
    'a row number of 2^53 or more',
    corrupted(rowUpdate(), (words) => words.with(12, 2 ** 21)),
    'rowNumberTooLarge',
  ],
  [
    'a color count larger than the payload',
    corrupted(rowUpdate(), (words) => words.with(14, 1000)),
    'colorPastEnd',
  ],
  [
    'an odd color count',
    corrupted(rowUpdate({ colors: Uint32Array.of(1, 0x1_00_00_00) }), (words) => words.with(14, 1)),
    'colorPastEnd',
  ],
  [
    'a color slot past the default background',
    corrupted(rowUpdate({ colors: Uint32Array.of(1, 0x1_00_00_00) }), (words) =>
      words.with(15, 258),
    ),
    'colorSlotInvalid',
  ],
  [
    'a color word without the marker bit',
    corrupted(rowUpdate({ colors: Uint32Array.of(1, 0x1_00_00_00) }), (words) => words.with(16, 5)),
    'colorInvalid',
  ],
  [
    'a grapheme index past the cells',
    encodeRowUpdate(clusterUpdate(rowWords(columns) + rowHeaderWords)),
    'graphemePastCells',
  ],
  ['a grapheme index on a row offset', encodeRowUpdate(clusterUpdate(0)), 'graphemeOffCell'],
  ['a grapheme index on a row flags word', encodeRowUpdate(clusterUpdate(1)), 'graphemeOffCell'],
  [
    'a cluster longer than the payload',
    encodeRowUpdate(clusterUpdate(rowHeaderWords, 3)),
    'graphemePastEnd',
  ],
  [
    'a cluster of no code points',
    encodeRowUpdate(rowUpdate({ graphemes: Uint32Array.of(rowHeaderWords, 0) })),
    'graphemeTooShort',
  ],
  [
    'a cluster of one code point',
    encodeRowUpdate(rowUpdate({ graphemes: Uint32Array.of(rowHeaderWords, 1, 0x65) })),
    'graphemeTooShort',
  ],
  [
    'a cluster without its length',
    corrupted(rowUpdate(), (words) => Uint32Array.of(...words, 1)),
    'graphemePastEnd',
  ],
] as const)('refuses %s', (_name, bytes, reason) => {
  expect(decodeRowUpdate(bytes)).toEqual({ ok: false, reason });
});

it.each([
  ['keystrokes', Uint8Array.of(0x1b, 0x5b, 0x41, 0x0d)],
  ['an empty payload', new Uint8Array()],
])('round-trips pane input with %s', (_name, bytes) => {
  const input = { pane: 7, bytes };

  expect(decodePaneInput(encodePaneInput(input))).toEqual({ ok: true, input });
});

it('keeps decoded pane input when the caller reuses its buffer', () => {
  const bytes = encodePaneInput({ pane: 7, bytes: Uint8Array.of(0x61) });
  const result = decodePaneInput(bytes);

  bytes.fill(0);

  expect(result).toEqual({ ok: true, input: { pane: 7, bytes: Uint8Array.of(0x61) } });
});

it('refuses pane input shorter than its pane number', () => {
  expect(decodePaneInput(Uint8Array.of(7, 0, 0))).toEqual({ ok: false, reason: 'wrongLength' });
});
