import { describe, expect, it } from 'bun:test';

import { moveScroll } from './scrollMotions.ts';
import type { ScrollMotion, ScrollPosition, ScrollResult, ScrollRows } from './scrollMotions.ts';

interface Options {
  height?: number;
  columns?: number;
  oldest?: number;
  // Stable rows the cache lacks.
  missing?: readonly number[];
  // Lines whose row soft-wraps into the next.
  wrapped?: readonly number[];
}

// Line `index` of `lines` is stable row `oldest + index`. The last `height` lines are the active
// screen.
const rowsOf = (lines: readonly string[], options: Options = {}): ScrollRows => {
  const { height = 4, columns = 12, oldest = 0, missing = [], wrapped = [] } = options;

  return {
    height,
    columns,
    oldest,
    activeTop: oldest + lines.length - height,
    epoch: 1,
    row: (row) => {
      const line = lines[row - oldest];

      if (line === undefined || missing.includes(row)) {
        return undefined;
      }

      return {
        cells: Array.from(line.padEnd(columns)),
        wrapped: wrapped.includes(row),
      };
    },
  };
};

const resultOf = (
  lines: readonly string[],
  from: Partial<ScrollPosition> & { row: number },
  motion: ScrollMotion,
  options: Options = {},
): ScrollResult => {
  const rows = rowsOf(lines, options);
  const position = { col: 0, top: rows.activeTop, ...from };

  return moveScroll(rows, position, motion);
};

const move = (
  lines: readonly string[],
  from: Partial<ScrollPosition> & { row: number },
  motion: ScrollMotion,
  options: Options = {},
): ScrollPosition => {
  const result = resultOf(lines, from, motion, options);

  if (result.kind === 'missing') {
    throw new Error(`row ${result.row} is missing`);
  }

  return result.position;
};

// Supplies each row a motion asks for, one at a time, as the controller does once a fetch lands.
const settled = (
  lines: readonly string[],
  from: Partial<ScrollPosition> & { row: number },
  motion: ScrollMotion,
  options: Options,
): ScrollPosition => {
  const missing = new Set(options.missing);

  for (;;) {
    const result = resultOf(lines, from, motion, { ...options, missing: [...missing] });

    if (result.kind === 'moved') {
      return result.position;
    }

    missing.delete(result.row);
  }
};

const text = ['foo bar.baz', '  qux', '', 'x', 'one two', 'three', '', 'end'];

describe('cell motions', () => {
  it('moves left and right and stops at the row edges', () => {
    expect(move(text, { row: 7, col: 3 }, 'left').col).toBe(2);
    expect(move(text, { row: 7, col: 0 }, 'left').col).toBe(0);
    expect(move(text, { row: 7, col: 3 }, 'right').col).toBe(4);
    expect(move(text, { row: 7, col: 11 }, 'right').col).toBe(11);
  });

  it('moves up and down and stops at the oldest and newest rows', () => {
    expect(move(text, { row: 5 }, 'up').row).toBe(4);
    expect(move(text, { row: 0 }, 'up').row).toBe(0);
    expect(move(text, { row: 5 }, 'down').row).toBe(6);
    expect(move(text, { row: 7 }, 'down').row).toBe(7);
  });

  it('scrolls the view only when the cursor leaves it', () => {
    expect(move(text, { row: 6, top: 4 }, 'up')).toMatchObject({ row: 5, top: 4 });
    expect(move(text, { row: 4, top: 4 }, 'up')).toMatchObject({ row: 3, top: 3 });
    expect(move(text, { row: 7, top: 4 }, 'down')).toMatchObject({ row: 7, top: 4 });
    expect(move(text, { row: 3, top: 0 }, 'down')).toMatchObject({ row: 4, top: 1 });
  });

  it('stops at the oldest row a trimmed history keeps', () => {
    const position = move(text, { row: 102, col: 2, top: 100 }, 'up', { oldest: 100 });

    expect(position).toMatchObject({ row: 101, top: 100 });
    expect(move(text, { row: 100, top: 100 }, 'up', { oldest: 100 }).row).toBe(100);
  });
});

describe('line motions', () => {
  it('moves to the first column with 0', () => {
    expect(move(text, { row: 0, col: 5 }, 'lineStart').col).toBe(0);
  });

  it('moves to the first non-blank column with ^, or to column 0 on a blank row', () => {
    expect(move(text, { row: 1, col: 5 }, 'firstNonBlank').col).toBe(2);
    expect(move(text, { row: 2, col: 5 }, 'firstNonBlank').col).toBe(0);
  });

  it('moves to the last character with $, ignoring trailing blanks, or to column 0 on a blank row', () => {
    expect(move(text, { row: 1 }, 'lineEnd').col).toBe(4);
    expect(move(text, { row: 0 }, 'lineEnd').col).toBe(10);
    expect(move(text, { row: 2, col: 5 }, 'lineEnd').col).toBe(0);
  });

  it('asks for the row when the cache lacks it', () => {
    const missing = { missing: [1] };

    expect(resultOf(text, { row: 1, col: 5 }, 'lineEnd', missing)).toEqual({
      kind: 'missing',
      row: 1,
    });

    expect(resultOf(text, { row: 1, col: 5 }, 'firstNonBlank', missing)).toEqual({
      kind: 'missing',
      row: 1,
    });
  });
});

describe('word motions', () => {
  it('moves w to the next word start, treating punctuation as its own word', () => {
    expect(move(text, { row: 0, col: 0 }, 'wordStart').col).toBe(4);
    expect(move(text, { row: 0, col: 4 }, 'wordStart').col).toBe(7);
    expect(move(text, { row: 0, col: 7 }, 'wordStart').col).toBe(8);
  });

  it('moves w from a blank cell to the next word', () => {
    expect(move(text, { row: 0, col: 3 }, 'wordStart').col).toBe(4);
  });

  it('moves w across rows and over blank rows', () => {
    expect(move(text, { row: 0, col: 8 }, 'wordStart')).toMatchObject({ row: 1, col: 2 });
    expect(move(text, { row: 1, col: 2 }, 'wordStart')).toMatchObject({ row: 3, col: 0 });
  });

  it('stays at the last word when w finds no next word', () => {
    expect(move(text, { row: 7, col: 0 }, 'wordStart')).toMatchObject({ row: 7, col: 0 });
  });

  it('moves b to the start of the current or previous word', () => {
    expect(move(text, { row: 0, col: 9 }, 'wordStartPrevious').col).toBe(8);
    expect(move(text, { row: 0, col: 8 }, 'wordStartPrevious').col).toBe(7);
    expect(move(text, { row: 0, col: 7 }, 'wordStartPrevious').col).toBe(4);
    expect(move(text, { row: 1, col: 2 }, 'wordStartPrevious')).toMatchObject({ row: 0, col: 8 });
  });

  it('stays when b finds no previous word', () => {
    expect(move(text, { row: 0, col: 2 }, 'wordStartPrevious')).toMatchObject({ row: 0, col: 0 });
    expect(move(text, { row: 0, col: 0 }, 'wordStartPrevious')).toMatchObject({ row: 0, col: 0 });
  });

  it('moves e to the end of the current or next word', () => {
    expect(move(text, { row: 0, col: 0 }, 'wordEnd').col).toBe(2);
    expect(move(text, { row: 0, col: 2 }, 'wordEnd').col).toBe(6);
    expect(move(text, { row: 0, col: 6 }, 'wordEnd').col).toBe(7);
    expect(move(text, { row: 0, col: 10 }, 'wordEnd')).toMatchObject({ row: 1, col: 4 });
  });

  it('stays when e finds no later word', () => {
    expect(move(text, { row: 7, col: 2 }, 'wordEnd')).toMatchObject({ row: 7, col: 2 });
  });

  it('moves W, B, and E over words of any non-blank characters', () => {
    expect(move(text, { row: 0, col: 0 }, 'bigWordStart').col).toBe(4);
    expect(move(text, { row: 0, col: 4 }, 'bigWordStart')).toMatchObject({ row: 1, col: 2 });
    expect(move(text, { row: 0, col: 9 }, 'bigWordStartPrevious').col).toBe(4);
    expect(move(text, { row: 0, col: 4 }, 'bigWordEnd').col).toBe(10);
    expect(move(text, { row: 0, col: 0 }, 'bigWordEnd').col).toBe(2);
  });

  it('treats a soft-wrapped row end as no break, and a hard row end as a break', () => {
    const lines = ['abcdefghijkl', 'mnop qrs', 'tuvwxyzabcde', 'fgh'];
    const wrap = { wrapped: [0] };

    expect(move(lines, { row: 0, col: 3 }, 'wordEnd', wrap)).toMatchObject({ row: 1, col: 3 });
    expect(move(lines, { row: 0, col: 3 }, 'wordEnd')).toMatchObject({ row: 0, col: 11 });
    expect(move(lines, { row: 2, col: 3 }, 'bigWordStart')).toMatchObject({ row: 3, col: 0 });

    expect(move(lines, { row: 2, col: 3 }, 'bigWordStart', { wrapped: [2] })).toMatchObject({
      row: 2,
      col: 3,
    });
  });

  it('searches past a long run of blank rows', () => {
    const lines = ['alpha', ...Array.from({ length: 400 }, () => ''), 'beta'];

    const position = move(lines, { row: 0, col: 0 }, 'wordStart');

    expect(position).toMatchObject({ row: 401, col: 0 });
    expect(position.top).toBe(401 - 3);
  });

  it('asks for the row a scan reaches when the cache lacks it, and not for rows it never reads', () => {
    const lines = ['one two', 'three'];

    expect(resultOf(lines, { row: 0, col: 4 }, 'wordStart', { missing: [1] })).toMatchObject({
      kind: 'missing',
      row: 1,
    });

    expect(resultOf(lines, { row: 0, col: 0 }, 'wordStart', { missing: [1] })).toMatchObject({
      kind: 'moved',
      position: { row: 0, col: 4 },
    });

    expect(resultOf(lines, { row: 0, col: 0 }, 'wordStart', { missing: [0] })).toMatchObject({
      kind: 'missing',
      row: 0,
    });
  });

  it('reaches the same target with rows missing as with a full cache', () => {
    const lines = [
      'alpha beta',
      'gamma',
      '',
      ...Array.from({ length: 200 }, () => ''),
      'delta eps',
    ];

    const missing = [0, 1, 2, 3, 50, 100, 150, 202, 203];

    const motions: ScrollMotion[] = [
      'wordStart',
      'wordStartPrevious',
      'wordEnd',
      'bigWordStart',
      'bigWordStartPrevious',
      'bigWordEnd',
    ];

    for (const motion of motions) {
      for (const from of [
        { row: 0, col: 8 },
        { row: 1, col: 4 },
        { row: 203, col: 2 },
      ]) {
        const full = move(lines, from, motion);

        expect(
          settled(lines, from, motion, { missing: missing.filter((row) => row !== from.row) }),
        ).toEqual(full);
      }
    }
  });

  it('crosses a wrapped word longer than the scan window', () => {
    const lines = Array.from({ length: 130 }, () => 'abcdefghijkl');
    const wrapped = { wrapped: Array.from({ length: 129 }, (_, row) => row) };

    expect(move(lines, { row: 0, col: 0 }, 'wordEnd', wrapped)).toMatchObject({
      row: 129,
      col: 11,
    });

    expect(move(lines, { row: 0, col: 0 }, 'bigWordEnd', wrapped)).toMatchObject({
      row: 129,
      col: 11,
    });

    expect(move(lines, { row: 129, col: 5 }, 'wordStartPrevious', wrapped)).toMatchObject({
      row: 0,
      col: 0,
    });

    expect(move(lines, { row: 129, col: 5 }, 'bigWordStartPrevious', wrapped)).toMatchObject({
      row: 0,
      col: 0,
    });
  });

  it('scrolls the view to show the cell a word motion reaches', () => {
    expect(move(text, { row: 1, col: 2, top: 1 }, 'wordStartPrevious')).toMatchObject({
      row: 0,
      top: 0,
    });
  });
});

describe('paragraph motions', () => {
  it('moves } to the next blank row and { to the previous, keeping the column', () => {
    expect(move(text, { row: 0, col: 5 }, 'paragraphNext')).toMatchObject({ row: 2, col: 5 });
    expect(move(text, { row: 4, col: 3 }, 'paragraphNext')).toMatchObject({ row: 6, col: 3 });
    expect(move(text, { row: 5, col: 3 }, 'paragraphPrevious')).toMatchObject({ row: 2, col: 3 });
  });

  it('skips blank rows next to the cursor only when the row itself is blank', () => {
    expect(move(text, { row: 2 }, 'paragraphNext').row).toBe(6);
    expect(move(text, { row: 6 }, 'paragraphPrevious').row).toBe(2);
  });

  it('stays when no blank row lies in that direction', () => {
    expect(move(text, { row: 7 }, 'paragraphNext').row).toBe(7);
    expect(move(text, { row: 1 }, 'paragraphPrevious').row).toBe(1);
  });

  it('looks at most 999 rows away', () => {
    const far = ['', ...Array.from({ length: 1500 }, () => 'x'), ''];

    expect(move(far, { row: 0 }, 'paragraphNext').row).toBe(0);
    expect(move(far, { row: 1501 }, 'paragraphPrevious').row).toBe(1501);

    const near = ['', ...Array.from({ length: 998 }, () => 'x'), ''];

    expect(move(near, { row: 0 }, 'paragraphNext').row).toBe(999);
  });

  it('asks for a row the cache lacks', () => {
    expect(resultOf(text, { row: 0 }, 'paragraphNext', { missing: [1] })).toEqual({
      kind: 'missing',
      row: 1,
    });
  });

  it('scrolls the view to the blank row', () => {
    expect(move(text, { row: 5, top: 4 }, 'paragraphPrevious')).toMatchObject({ row: 2, top: 2 });
  });
});

describe('page motions', () => {
  const long = Array.from({ length: 100 }, (_, index) => `r${index}`);
  const options = { height: 10 };

  it('moves the cursor and view a page less two rows with PageUp and PageDown', () => {
    expect(move(long, { row: 60, top: 50 }, 'pageUp', options)).toMatchObject({ row: 52, top: 42 });

    expect(move(long, { row: 60, top: 50 }, 'pageDown', options)).toMatchObject({
      row: 68,
      top: 58,
    });
  });

  it('moves half the pane height with ctrl+u and ctrl+d', () => {
    expect(move(long, { row: 60, top: 50 }, 'halfPageUp', options)).toMatchObject({
      row: 55,
      top: 45,
    });

    expect(move(long, { row: 60, top: 50 }, 'halfPageDown', options)).toMatchObject({
      row: 65,
      top: 55,
    });
  });

  it('moves one row in a pane of two rows or fewer', () => {
    const small = { height: 2 };

    expect(move(long, { row: 60, top: 58 }, 'pageUp', small)).toMatchObject({ row: 59, top: 57 });

    expect(move(long, { row: 60, top: 58 }, 'halfPageDown', small)).toMatchObject({
      row: 61,
      top: 59,
    });
  });

  it('stops at the oldest and newest rows', () => {
    expect(move(long, { row: 3, top: 2 }, 'pageUp', options)).toMatchObject({ row: 0, top: 0 });

    expect(move(long, { row: 97, top: 88 }, 'pageDown', options)).toMatchObject({
      row: 99,
      top: 90,
    });
  });

  it('stops at the oldest row a trimmed history keeps', () => {
    const trimmed = { height: 10, oldest: 500 };

    expect(move(long, { row: 503, top: 502 }, 'pageUp', trimmed)).toMatchObject({
      row: 500,
      top: 500,
    });
  });
});

describe('history motions', () => {
  const long = Array.from({ length: 100 }, (_, index) => `r${index}`);

  it('moves g to the oldest row, keeping the column', () => {
    expect(move(long, { row: 60, col: 3, top: 50 }, 'historyTop', { height: 10 })).toEqual({
      row: 0,
      col: 3,
      top: 0,
    });
  });

  it('moves G to the newest row and the view to the bottom, keeping the column', () => {
    expect(move(long, { row: 10, col: 3, top: 5 }, 'historyBottom', { height: 10 })).toEqual({
      row: 99,
      col: 3,
      top: 90,
    });
  });

  it('moves g to the oldest row a trimmed history keeps', () => {
    expect(move(long, { row: 560, top: 550 }, 'historyTop', { height: 10, oldest: 500 })).toEqual({
      row: 500,
      col: 0,
      top: 500,
    });
  });
});
