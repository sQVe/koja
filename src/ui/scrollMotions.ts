export interface ScrollRow {
  // One string per column: the cell's text with a blank cell as a space, and an empty string for the
  // spacer after a wide character.
  cells: readonly string[];
  // Whether the row soft-wraps into the next row.
  wrapped: boolean;
}

// The rows a motion may read, by stable row number. The rows from `oldest` to the last row of the
// active screen exist; the cache holds only some of them.
export interface ScrollRows {
  height: number;
  columns: number;
  oldest: number;
  activeTop: number;
  // Changes when a resize or reflow renumbers the rows.
  epoch: number;
  row: (row: number) => ScrollRow | undefined;
}

export interface ScrollPosition {
  row: number;
  col: number;
  // The stable row at the top of the view. The active top is the bottom of the history.
  top: number;
}

// A motion either reaches a position or needs a row the cache lacks. The caller fetches the row and
// runs the motion again.
export type ScrollResult =
  | { kind: 'moved'; position: ScrollPosition }
  // `resume` continues a scan from where it stopped once the row is in the cache, so the scan
  // never needs rows it already passed. Without it the motion runs again from the start.
  | { kind: 'missing'; row: number; resume?: (rows: ScrollRows, top: number) => ScrollResult };

export type ScrollMotion =
  | 'left'
  | 'down'
  | 'up'
  | 'right'
  | 'wordStart'
  | 'wordStartPrevious'
  | 'wordEnd'
  | 'bigWordStart'
  | 'bigWordStartPrevious'
  | 'bigWordEnd'
  | 'lineStart'
  | 'firstNonBlank'
  | 'lineEnd'
  | 'paragraphPrevious'
  | 'paragraphNext'
  | 'pageUp'
  | 'pageDown'
  | 'halfPageUp'
  | 'halfPageDown'
  | 'historyTop'
  | 'historyBottom';

type TextClass = 'whitespace' | 'separator' | 'word';

// A cell, or the end of a row that does not wrap, which has no cell.
interface Atom {
  row: number | undefined;
  col: number;
  endCol: number;
  textClass: TextClass;
}

type RunTest = (start: TextClass, candidate: TextClass) => boolean;

type WordMotion = 'start' | 'startPrevious' | 'end';

type Move = (rows: ScrollRows, position: ScrollPosition) => ScrollResult;

// A place among the atoms of the rows: `index` may run past either end of the row, which the scan
// folds into the next or previous row.
interface Pointer {
  row: number;
  index: number;
  // Set after stepping back into a row, whose last atom is then the target.
  fromEnd: boolean;
}

type Scan = Generator<number, Atom | undefined>;

const wordSeparators = new Set(Array.from('!"#$%&\'()*+,-./:;<=>?@[\\]^`{|}~'));

const paragraphScanLimit = 1000;

const classOf = (text: string): TextClass => {
  if (text.trim() === '') {
    return 'whitespace';
  }

  return wordSeparators.has(text) ? 'separator' : 'word';
};

// The lines a page motion moves: the pane height less two, or half of it.
const pageLines = (height: number, half: boolean): number => {
  if (height <= 2) {
    return 1;
  }

  return half ? Math.floor(height / 2) : height - 2;
};

const moved = (position: ScrollPosition): ScrollResult => ({ kind: 'moved', position });

const missing = (row: number): ScrollResult => ({ kind: 'missing', row });

const lastRowOf = (rows: ScrollRows): number => rows.activeTop + rows.height - 1;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

// Moves the view the least that shows the row.
const revealed = (rows: ScrollRows, position: ScrollPosition): ScrollPosition => {
  const bottom = position.top + rows.height - 1;

  // Stryker disable next-line EqualityOperator: Boundary: moving to the same row changes nothing.
  if (position.row < position.top) {
    return { ...position, top: position.row };
  }

  // Stryker disable next-line EqualityOperator: Boundary: moving to the same row changes nothing.
  return position.row > bottom ? { ...position, top: position.row - (rows.height - 1) } : position;
};

const isBlank = (row: ScrollRow): boolean => row.cells.every((cell) => cell.trim() === '');

const lineEndOf = (row: ScrollRow): number => {
  const index = row.cells.findLastIndex((cell) => cell.trim() !== '');

  return Math.max(index, 0);
};

const firstNonBlankOf = (row: ScrollRow): number => {
  const index = row.cells.findIndex((cell) => cell.trim() !== '');

  return Math.max(index, 0);
};

const atomsOfRow = (row: ScrollRow, number: number): Atom[] => {
  const atoms: Atom[] = [];

  row.cells.forEach((text, col) => {
    if (text === '') {
      return;
    }

    const wide = row.cells[col + 1] === '';

    atoms.push({ row: number, col, endCol: wide ? col + 1 : col, textClass: classOf(text) });
  });

  if (!row.wrapped) {
    atoms.push({ row: undefined, col: 0, endCol: 0, textClass: 'whitespace' });
  }

  return atoms;
};

const sameClass: RunTest = (start, candidate) => start === candidate;

const notWhitespace: RunTest = (_start, candidate) => candidate !== 'whitespace';

const isBlankAtom = (atom: Atom): boolean => atom.textClass === 'whitespace';

// Finds the cell a word motion reaches, reading rows as it goes and yielding the number of a row
// the cache lacks. It keeps at most two rows of atoms, so it needs nothing it has passed.
const wordScan = function* (
  rowsNow: () => ScrollRows,
  position: ScrollPosition,
  motion: WordMotion,
  inRun: RunTest,
): Scan {
  const held = new Map<number, Atom[]>();

  const atomsOf = function* (row: number): Generator<number, Atom[] | undefined> {
    for (;;) {
      const rows = rowsNow();

      if (row < rows.oldest || row > lastRowOf(rows)) {
        return undefined;
      }

      const known = held.get(row);

      if (known !== undefined) {
        return known;
      }

      const found = rows.row(row);

      if (found === undefined) {
        yield row;

        continue;
      }

      const atoms = atomsOfRow(found, row);

      // Stryker disable next-line BlockStatement,ConditionalExpression,EqualityOperator: Bounds the memory of two rows.
      if (held.size >= 2) {
        // Stryker disable next-line CallExpression: Bounds the memory of two rows.
        held.clear();
      }

      held.set(row, atoms);

      return atoms;
    }
  };

  const atomAt = function* (at: Pointer): Generator<number, Atom | undefined> {
    for (;;) {
      const atoms = yield* atomsOf(at.row);

      if (atoms === undefined) {
        return undefined;
      }

      if (at.fromEnd) {
        at.index = atoms.length - 1;
        at.fromEnd = false;
      }

      if (at.index >= atoms.length) {
        at.row += 1;
        at.index = 0;
      } else if (at.index < 0) {
        at.row -= 1;
        at.fromEnd = true;
      } else {
        return atoms[at.index];
      }
    }
  };

  const here = yield* atomsOf(position.row);

  const index =
    // Stryker disable next-line OptionalChaining: `scrollMode` clamps the row and column, and every column of a row has an atom.
    here?.findIndex(
      // Stryker disable next-line ConditionalExpression: `scrollMode` clamps the row and column, and every column of a row has an atom.
      (atom) => position.col >= atom.col && position.col <= atom.endCol && atom.row !== undefined,
    ) ??
    /* Stryker disable next-line UnaryOperator: `scrollMode` clamps the row and column, and every column of a row has an atom. */ -1;

  // Stryker disable next-line BlockStatement,ConditionalExpression,LogicalOperator: `scrollMode` clamps the row and column, and every column of a row has an atom.
  if (here === undefined || index === -1) {
    return undefined;
  }

  const at: Pointer = { row: position.row, index, fromEnd: false };
  // Stryker disable next-line OptionalChaining,StringLiteral: The check is needed for the type of `here[index]`.
  const start = here[index]?.textClass ?? 'word';

  // Moves on while the atom at the pointer passes the test, and returns the first one that fails.
  const advance = function* (step: 1 | -1, passes: (atom: Atom) => boolean): Scan {
    for (;;) {
      const atom = yield* atomAt(at);

      if (atom === undefined || !passes(atom)) {
        return atom;
      }

      at.index += step;
    }
  };

  // The last atom of a run that starts at the pointer, walking in a direction.
  const runFrom = function* (step: 1 | -1): Scan {
    const first = yield* atomAt(at);
    const runClass = first?.textClass ?? 'whitespace';
    let last = first;

    for (;;) {
      at.index += step;

      const atom = yield* atomAt(at);

      if (atom === undefined || !inRun(runClass, atom.textClass)) {
        return last;
      }

      last = atom;
    }
  };

  if (motion === 'start') {
    at.index += 1;

    if (start !== 'whitespace') {
      yield* advance(1, (atom) => inRun(start, atom.textClass));
    }

    return yield* advance(1, isBlankAtom);
  }

  if (motion === 'startPrevious') {
    at.index -= 1;

    yield* advance(-1, isBlankAtom);

    return yield* runFrom(-1);
  }

  at.index += 1;

  yield* advance(1, isBlankAtom);

  return yield* runFrom(1);
};

const driveWord = (
  holder: { rows: ScrollRows; top: number },
  scan: Scan,
  position: ScrollPosition,
): ScrollResult => {
  const step = scan.next();

  if (step.done !== true) {
    return {
      kind: 'missing',
      row: step.value,
      resume: (rows, top) => {
        holder.rows = rows;
        holder.top = top;

        return driveWord(holder, scan, position);
      },
    };
  }

  const target = step.value;

  if (target?.row === undefined) {
    return moved(revealed(holder.rows, { ...position, top: holder.top }));
  }

  return moved(
    revealed(holder.rows, { ...position, top: holder.top, row: target.row, col: target.col }),
  );
};

const moveByWord = (
  rows: ScrollRows,
  position: ScrollPosition,
  motion: WordMotion,
  inRun: RunTest,
): ScrollResult => {
  const holder = { rows, top: position.top };

  return driveWord(
    holder,
    wordScan(() => holder.rows, position, motion, inRun),
    position,
  );
};

const moveByParagraph = (
  rows: ScrollRows,
  position: ScrollPosition,
  direction: -1 | 1,
): ScrollResult => {
  const last = lastRowOf(rows);
  const limit = Math.min(last - rows.oldest + 1, paragraphScanLimit);

  for (let distance = 1; distance < limit; distance++) {
    const candidate = position.row + direction * distance;

    if (candidate < rows.oldest || candidate > last) {
      return moved(position);
    }

    const row = rows.row(candidate);

    if (row === undefined) {
      return missing(candidate);
    }

    if (isBlank(row)) {
      return moved(revealed(rows, { ...position, row: candidate }));
    }
  }

  return moved(position);
};

const moveByLine = (
  rows: ScrollRows,
  position: ScrollPosition,
  motion: 'lineEnd' | 'firstNonBlank',
): ScrollResult => {
  const row = rows.row(position.row);

  if (row === undefined) {
    return missing(position.row);
  }

  const col = motion === 'lineEnd' ? lineEndOf(row) : firstNonBlankOf(row);

  return moved({ ...position, col });
};

const moveByPage = (
  rows: ScrollRows,
  position: ScrollPosition,
  motion: 'pageUp' | 'pageDown' | 'halfPageUp' | 'halfPageDown',
): ScrollPosition => {
  const lines = pageLines(rows.height, motion.startsWith('half'));
  const last = lastRowOf(rows);

  if (motion.endsWith('Up')) {
    return {
      ...position,
      row: Math.max(position.row - lines, rows.oldest),
      top: Math.max(position.top - lines, rows.oldest),
    };
  }

  return {
    ...position,
    row: Math.min(position.row + lines, last),
    top: Math.min(position.top + lines, rows.activeTop),
  };
};

const moveByCell = (
  rows: ScrollRows,
  position: ScrollPosition,
  motion: 'left' | 'right' | 'up' | 'down',
): ScrollPosition => {
  const last = lastRowOf(rows);

  if (motion === 'left') {
    return { ...position, col: Math.max(position.col - 1, 0) };
  }

  if (motion === 'right') {
    return { ...position, col: Math.min(position.col + 1, rows.columns - 1) };
  }

  const step = motion === 'up' ? -1 : 1;
  const row = clamp(position.row + step, rows.oldest, last);

  return revealed(rows, { ...position, row });
};

const byWord =
  (motion: WordMotion, inRun: RunTest): Move =>
  (rows, position) =>
    moveByWord(rows, position, motion, inRun);

const byCell =
  (motion: 'left' | 'right' | 'up' | 'down'): Move =>
  (rows, position) =>
    moved(moveByCell(rows, position, motion));

const byLine =
  (motion: 'lineEnd' | 'firstNonBlank'): Move =>
  (rows, position) =>
    moveByLine(rows, position, motion);

const byParagraph =
  (direction: -1 | 1): Move =>
  (rows, position) =>
    moveByParagraph(rows, position, direction);

const byPage =
  (motion: 'pageUp' | 'pageDown' | 'halfPageUp' | 'halfPageDown'): Move =>
  (rows, position) =>
    moved(moveByPage(rows, position, motion));

const moves: Record<ScrollMotion, Move> = {
  left: byCell('left'),
  right: byCell('right'),
  up: byCell('up'),
  down: byCell('down'),
  wordStart: byWord('start', sameClass),
  wordStartPrevious: byWord('startPrevious', sameClass),
  wordEnd: byWord('end', sameClass),
  bigWordStart: byWord('start', notWhitespace),
  bigWordStartPrevious: byWord('startPrevious', notWhitespace),
  bigWordEnd: byWord('end', notWhitespace),
  lineStart: (_rows, position) => moved({ ...position, col: 0 }),
  firstNonBlank: byLine('firstNonBlank'),
  lineEnd: byLine('lineEnd'),
  paragraphPrevious: byParagraph(-1),
  paragraphNext: byParagraph(1),
  pageUp: byPage('pageUp'),
  pageDown: byPage('pageDown'),
  halfPageUp: byPage('halfPageUp'),
  halfPageDown: byPage('halfPageDown'),
  historyTop: (rows, position) => moved({ ...position, row: rows.oldest, top: rows.oldest }),
  historyBottom: (rows, position) =>
    moved({ ...position, row: lastRowOf(rows), top: rows.activeTop }),
};

// Moves the cursor as herdr's copy mode does, and the view with it. Rows the cache lacks are not
// read: a motion that needs one reports it.
export const moveScroll = (
  rows: ScrollRows,
  position: ScrollPosition,
  motion: ScrollMotion,
): ScrollResult => moves[motion](rows, position);
