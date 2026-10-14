import { expect, it } from 'bun:test';

import { PaneRowsSource, rowsToLines } from '../rows/rows.ts';
import { createTerminal } from '../vt/vt.ts';
import { maxReplyBytes, maxReplyRows, selectPaneRows } from './paneRows.ts';
import type { PaneReadSelection } from './paneRows.ts';

const encoder = new TextEncoder();

const defaultScrollbackBytes = 10_000_000;

const openTerminal = (columns = 80, rows = 24, scrollbackBytes = defaultScrollbackBytes) => {
  const created = createTerminal(columns, rows, scrollbackBytes);

  if (!created.ok) {
    throw new Error(created.reason);
  }

  return created.terminal;
};

type Terminal = ReturnType<typeof openTerminal>;

// The server tracks the screen top after every write, so a test does too.
const feed = (terminal: Terminal, text: string): void => {
  terminal.write(encoder.encode(text));
  terminal.stableRows();
};

const numbered = (from: number, to: number): string =>
  Array.from({ length: to - from + 1 }, (_, index) => `l${from + index}`).join('\r\n');

const recent = (lines?: number): PaneReadSelection => ({ source: 'recent', lines });

const read = (terminal: Terminal, rows: number, selection: PaneReadSelection, columns = 80) => {
  const result = selectPaneRows(terminal, { columns, rows }, selection);

  if (!result.ok) {
    throw new Error(`The read failed: ${result.failure.reason}.`);
  }

  return result.rows;
};

const linesOf = (rows: ReturnType<typeof read>, unwrap = false): string[] =>
  rowsToLines(rows, rows.columns, unwrap);

it('reads the last rows that hold text, with the cursor row when it is lower', () => {
  using terminal = openTerminal();

  feed(terminal, numbered(1, 100));

  expect(linesOf(read(terminal, 24, recent(5)))).toEqual(['l96', 'l97', 'l98', 'l99', 'l100']);

  feed(terminal, '\r\n');

  expect(linesOf(read(terminal, 24, recent(5)))).toEqual(['l97', 'l98', 'l99', 'l100', '']);
});

it('reads 80 rows by default and clamps a count to the rows one reply holds', () => {
  using terminal = openTerminal(10, 24);

  feed(terminal, numbered(1, 1500));

  expect(read(terminal, 24, recent(), 10).rowCount).toBe(80);
  expect(read(terminal, 24, recent(5000), 10).rowCount).toBe(maxReplyRows);
});

it('refuses a recent or visible read whose reply would be over the byte budget', () => {
  using terminal = openTerminal();

  feed(terminal, numbered(1, 1500));

  const size = { columns: 80, rows: 24 };

  const stable = terminal.stableRows();

  expect(selectPaneRows(terminal, size, recent(1000))).toEqual({
    ok: false,
    failure: {
      reason: 'tooManyBytes',
      limitBytes: maxReplyBytes,
      epoch: stable.epoch,
      alternate: false,
      first: stable.activeTop + 24 - 1000,
      count: 1000,
    },
  });

  expect(read(terminal, 24, recent(400)).rowCount).toBe(400);
});

it('refuses a wide range over the byte budget without throwing', () => {
  using terminal = openTerminal(1100, 5);

  feed(terminal, numbered(1, 1200));

  const { first } = terminal.stableRows();

  const result = selectPaneRows(
    terminal,
    { columns: 1100, rows: 5 },
    { source: 'range', from: first, to: first + 999, epoch: undefined, alternate: undefined },
  );

  expect(result).toMatchObject({
    ok: false,
    failure: { reason: 'tooManyBytes', limitBytes: maxReplyBytes, first, count: 990 },
  });
});

it('does not end a recent read at a row that holds only Unicode whitespace', () => {
  using terminal = openTerminal(80, 6);

  feed(terminal, 'one\r\ntwo\r\n\u00A0\u2003\u001B[2;1H');

  expect(linesOf(read(terminal, 6, recent(2)))).toEqual(['one', 'two']);
  expect(linesOf(read(terminal, 6, { source: 'visible', lines: 2 }))).toEqual(['one', 'two']);
});

it('reads no rows for a count of 0 and no row above the oldest', () => {
  using terminal = openTerminal();

  feed(terminal, numbered(1, 3));

  expect(read(terminal, 24, recent(0)).rowCount).toBe(0);

  const rows = read(terminal, 24, recent(80));

  expect(linesOf(rows)).toEqual(['l1', 'l2', 'l3']);
  expect(rows.first).toBe(rows.oldest);
});

it('reads the screen rows from the bottom of an empty screen', () => {
  using terminal = openTerminal(80, 5);

  const rows = read(terminal, 5, recent(3));

  expect(rows.rowCount).toBe(3);
  expect(linesOf(rows)).toEqual(['', '', '']);
});

it('keeps the soft wrap of a row so the reader can join it', () => {
  using terminal = openTerminal(10, 5);

  feed(terminal, 'abcdefghijklmnopqrstuvwxyz\r\nnext');

  const wrapped = read(terminal, 5, { source: 'recentUnwrapped', lines: 10 }, 10);

  expect(wrapped.source).toBe(PaneRowsSource.recentUnwrapped);
  expect(linesOf(wrapped)).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz', 'next']);
  expect(linesOf(wrapped, true)).toEqual(['abcdefghijklmnopqrstuvwxyz', 'next']);
});

it('reads the screen rows for visible and keeps the last rows that hold text for a count', () => {
  using terminal = openTerminal(80, 5);

  feed(terminal, numbered(1, 12));
  feed(terminal, '\u001B[H\u001B[2Jone\r\ntwo\r\nthree');

  expect(linesOf(read(terminal, 5, { source: 'visible', lines: undefined }))).toEqual([
    'one',
    'two',
    'three',
    '',
    '',
  ]);

  expect(linesOf(read(terminal, 5, { source: 'visible', lines: 2 }))).toEqual(['two', 'three']);
  expect(read(terminal, 5, { source: 'visible', lines: 0 }).rowCount).toBe(0);
});

it('reads the last rows of the alternate screen even when they are blank', () => {
  using terminal = openTerminal(80, 6);

  feed(terminal, `${numbered(1, 20)}\u001B[?1049h\u001B[Halternate`);

  const rows = read(terminal, 6, recent(3));

  expect(linesOf(rows)).toEqual(['', '', '']);
  expect(rows.first).toBe(terminal.stableRows().activeTop + 3);
});

it('reads a range of stable row numbers, inclusive', () => {
  using terminal = openTerminal(80, 5);

  feed(terminal, numbered(1, 100));

  const { first } = terminal.stableRows();

  const rows = read(terminal, 5, {
    source: 'range',
    from: first + 3,
    to: first + 5,
    epoch: undefined,
    alternate: undefined,
  });

  expect(linesOf(rows)).toEqual(['l4', 'l5', 'l6']);
  expect(rows.first).toBe(first + 3);
  expect(rows.source).toBe(PaneRowsSource.range);
});

it('leaves out the rows past the last row', () => {
  using terminal = openTerminal(80, 5);

  feed(terminal, numbered(1, 100));

  const { activeTop, epoch } = terminal.stableRows();

  const rows = read(terminal, 5, {
    source: 'range',
    from: activeTop + 3,
    to: activeTop + 500,
    epoch,
    alternate: undefined,
  });

  const past = read(terminal, 5, {
    source: 'range',
    from: activeTop + 5,
    to: activeTop + 9,
    epoch,
    alternate: undefined,
  });

  expect(rows.rowCount).toBe(2);
  expect(past.rowCount).toBe(0);
});

it('refuses a range with more rows than one reply holds and reads one with exactly that many', () => {
  using terminal = openTerminal(10, 5);

  feed(terminal, numbered(1, 1200));

  const { first } = terminal.stableRows();

  expect(
    selectPaneRows(
      terminal,
      { columns: 10, rows: 5 },
      {
        source: 'range',
        from: first,
        to: first + maxReplyRows,
        epoch: undefined,
        alternate: undefined,
      },
    ),
  ).toMatchObject({
    ok: false,
    failure: { reason: 'tooManyRows', limit: maxReplyRows, first, count: maxReplyRows + 1 },
  });

  const exact = read(
    terminal,
    5,
    {
      source: 'range',
      from: first,
      to: first + maxReplyRows - 1,
      epoch: undefined,
      alternate: undefined,
    },
    10,
  );

  expect(exact.rowCount).toBe(maxReplyRows);
});

it('refuses a range below the oldest kept row and reports that row', () => {
  using terminal = openTerminal(80, 24, 1);

  for (let line = 0; line < 20_000; line += 100) {
    feed(terminal, `${numbered(line, line + 99)}\r\n`);
  }

  const { first } = terminal.stableRows();
  const size = { columns: 80, rows: 24 };

  expect(first).toBeGreaterThan(0);

  expect(
    selectPaneRows(terminal, size, {
      source: 'range',
      from: 0,
      to: 9,
      epoch: undefined,
      alternate: undefined,
    }),
  ).toEqual({ ok: false, failure: { reason: 'pruned', oldest: first } });

  const kept = read(terminal, 24, {
    source: 'range',
    from: first,
    to: first,
    epoch: undefined,
    alternate: undefined,
  });

  expect(kept.oldest).toBe(first);
  expect(kept.rowCount).toBe(1);
});

it('refuses a range in an old epoch and names the current one', () => {
  using terminal = openTerminal(80, 5);

  feed(terminal, numbered(1, 40));

  const before = terminal.stableRows();

  terminal.resize(60, 4);

  const after = terminal.stableRows();

  expect(after.epoch).not.toBe(before.epoch);

  expect(
    selectPaneRows(
      terminal,
      { columns: 60, rows: 4 },
      {
        source: 'range',
        from: after.first,
        to: after.first,
        epoch: before.epoch,
        alternate: undefined,
      },
    ),
  ).toEqual({ ok: false, failure: { reason: 'staleEpoch', epoch: after.epoch } });
});

it('keeps dirty rows for the next frame while it looks up the cursor', () => {
  using terminal = openTerminal(80, 5);

  feed(terminal, numbered(1, 3));
  terminal.frame();
  feed(terminal, '\r\nchanged');

  read(terminal, 5, recent(3));

  expect(terminal.frame().rowCount).toBeGreaterThan(0);
});

it('selects a whole screen taller than one reply for an uncounted visible read, and clamps a count', () => {
  using terminal = openTerminal(10, 1005);

  feed(terminal, numbered(1, 1005));

  const { epoch, activeTop } = terminal.stableRows();
  const size = { columns: 10, rows: 1005 };

  expect(selectPaneRows(terminal, size, { source: 'visible', lines: undefined })).toMatchObject({
    ok: false,
    failure: { reason: 'tooManyRows', epoch, first: activeTop, count: 1005 },
  });

  const counted = read(terminal, 1005, { source: 'visible', lines: 2000 }, 10);

  expect(counted.rowCount).toBe(maxReplyRows);
  expect(counted.first).toBe(activeTop + 5);
});

it('refuses a range that names the other screen, and reads one that names the active screen', () => {
  using terminal = openTerminal(10, 5);

  feed(terminal, numbered(1, 12));

  const { activeTop, epoch } = terminal.stableRows();

  const range = (alternate: boolean) =>
    selectPaneRows(
      terminal,
      { columns: 10, rows: 5 },
      { source: 'range', from: activeTop, to: activeTop + 1, epoch, alternate },
    );

  expect(range(false).ok).toBe(true);

  expect(range(true)).toEqual({
    ok: false,
    failure: { reason: 'screenChanged', alternate: false },
  });

  feed(terminal, '\u001B[?1049h\u001B[Halt');

  expect(terminal.stableRows()).toMatchObject({ epoch, activeTop, alternate: true });
  expect(range(true).ok).toBe(true);

  expect(range(false)).toEqual({
    ok: false,
    failure: { reason: 'screenChanged', alternate: true },
  });
});
