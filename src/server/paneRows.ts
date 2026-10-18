import { invariant } from '../invariant.ts';
import type { TerminalSize } from '../layout.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { graphemeWordsPerRow, paneRowsBytes, PaneRowsSource, rowsToLines } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import type { StableRows, Terminal } from '../vt/vt.ts';

export type PaneReadSelection = Extract<ControlMessage, { type: 'paneRead' }>['selection'];

type PaneReadFailure = Extract<ControlMessage, { type: 'paneReadFailed' }>['failure'];

// The rows of a reply, before the pane and request they answer are known.
export type SelectedRows = Omit<PaneRows, 'pane' | 'requestId' | 'remaining'>;

export type SelectRowsResult =
  | { ok: true; rows: SelectedRows }
  | { ok: false; failure: PaneReadFailure };

interface Span {
  first: number;
  count: number;
}

// The most rows a read with a line count selects, as herdr clamps --lines.
export const maxReplyRows = 1000;

// The most bytes one encoded reply holds. The connection queue holds 1 MiB of unread bytes, so a
// reply of half that leaves room for updates already queued. A snapshot larger than this goes out
// in parts of whole rows, each asked for by the client.
export const maxReplyBytes = 0x08_00_00;

// The most bytes of encoded rows one snapshot holds. A larger selection fails with its bounds, and
// the caller reads it as several snapshots by range.
export const maxSnapshotBytes = 0x1_00_00_00;

const defaultRecentRows = 80;

const sourceOf = (selection: PaneReadSelection): PaneRowsSource => {
  if (selection.source === 'visible') {
    return PaneRowsSource.visible;
  }

  if (selection.source === 'recent') {
    return PaneRowsSource.recent;
  }

  return selection.source === 'recentUnwrapped'
    ? PaneRowsSource.recentUnwrapped
    : PaneRowsSource.range;
};

// Unicode whitespace counts as blank, like Rust's trim_end.
const hasText = (line: string): boolean => /\S/u.test(line);

// The index in the active screen of its last row with text, or -1 when it has none.
const lastTextRow = (terminal: Terminal, stable: StableRows, size: TerminalSize): number => {
  const read = terminal.readRows(stable.epoch, stable.activeTop, size.rows);

  invariant(read.ok, 'The active screen must remain available during a synchronous read.');

  const lines = rowsToLines(read.rows, size.columns, false);

  return lines.findLastIndex(hasText);
};

const emptyAfter = (last: number): Span => ({ first: last + 1, count: 0 });

const spanEndingAt = (end: number, count: number, oldest: number): Span => {
  const first = Math.max(oldest, end + 1 - count);

  return { first, count: end + 1 - first };
};

const recentSpan = (
  terminal: Terminal,
  stable: StableRows,
  size: TerminalSize,
  requested: number,
): Span => {
  const count = Math.min(requested, maxReplyRows);
  const screenBottom = stable.activeTop + size.rows - 1;

  if (count === 0) {
    return emptyAfter(screenBottom);
  }

  if (stable.alternate) {
    return spanEndingAt(screenBottom, count, stable.activeTop);
  }

  const lastText = lastTextRow(terminal, stable, size);

  if (lastText === -1) {
    return spanEndingAt(screenBottom, count, stable.first);
  }

  const end = stable.activeTop + Math.max(lastText, terminal.cursorRow());

  return spanEndingAt(end, count, stable.first);
};

const visibleSpan = (
  terminal: Terminal,
  stable: StableRows,
  size: TerminalSize,
  lines: number | undefined,
): Span => {
  const screenBottom = stable.activeTop + size.rows - 1;

  if (lines === undefined) {
    return spanEndingAt(screenBottom, size.rows, stable.activeTop);
  }

  const lastText = lastTextRow(terminal, stable, size);
  const count = Math.min(lines, maxReplyRows);

  if (lastText === -1 || count === 0) {
    return emptyAfter(screenBottom);
  }

  return spanEndingAt(stable.activeTop + lastText, count, stable.activeTop);
};

const rangeFailure = (
  selection: Extract<PaneReadSelection, { source: 'range' }>,
  stable: StableRows,
): PaneReadFailure | undefined => {
  if (selection.epoch !== undefined && selection.epoch !== stable.epoch) {
    return { reason: 'staleEpoch', epoch: stable.epoch };
  }

  if (selection.screen !== undefined && selection.screen !== stable.screen) {
    return { reason: 'screenChanged', screen: stable.screen };
  }

  if (selection.from < stable.first) {
    return { reason: 'pruned', oldest: stable.first };
  }

  return undefined;
};

// Rows past the last row of the active screen are left out.
const rangeSpan = (
  selection: Extract<PaneReadSelection, { source: 'range' }>,
  stable: StableRows,
  size: TerminalSize,
): Span => {
  const last = stable.activeTop + size.rows - 1;
  const count = Math.min(selection.to, last) - selection.from + 1;

  return { first: selection.from, count: Math.max(0, count) };
};

const spanOf = (
  terminal: Terminal,
  stable: StableRows,
  size: TerminalSize,
  selection: PaneReadSelection,
): Span => {
  if (selection.source === 'range') {
    return rangeSpan(selection, stable, size);
  }

  if (selection.source === 'visible') {
    return visibleSpan(terminal, stable, size, selection.lines);
  }

  return recentSpan(terminal, stable, size, selection.lines ?? defaultRecentRows);
};

const selected = (stable: StableRows, span: Span) => ({
  epoch: stable.epoch,
  screen: stable.screen,
  first: span.first,
  count: span.count,
});

// Selects the rows a client asked for by the rules of herdr's pane read, and reads them with their
// wrap flags. The reader turns them into text.
export const selectPaneRows = (
  terminal: Terminal,
  size: TerminalSize,
  selection: PaneReadSelection,
): SelectRowsResult => {
  const stable = terminal.stableRows();

  // Stryker disable next-line ConditionalExpression: The check narrows the selection to a range.
  if (selection.source === 'range') {
    const failure = rangeFailure(selection, stable);

    if (failure !== undefined) {
      return { ok: false, failure };
    }
  }

  const span = spanOf(terminal, stable, size, selection);

  if (paneRowsBytes(1, size.columns, 0) > maxReplyBytes) {
    return {
      ok: false,
      failure: { reason: 'tooManyBytes', limitBytes: maxReplyBytes, ...selected(stable, span) },
    };
  }

  const cellBytes = paneRowsBytes(span.count, size.columns, 0);

  // Stryker disable next-line BlockStatement,ConditionalExpression,EqualityOperator: Stops a read of an oversized span early.
  if (cellBytes > maxSnapshotBytes) {
    return {
      ok: false,
      failure: { reason: 'tooManyBytes', limitBytes: maxSnapshotBytes, ...selected(stable, span) },
    };
  }

  const read = terminal.readRows(stable.epoch, span.first, span.count);

  // Stryker disable next-line BlockStatement,BooleanLiteral,ConditionalExpression,EqualityOperator,LogicalOperator,StringLiteral: `readRows` runs right after `stableRows`.
  if (!read.ok && read.reason === 'staleEpoch') {
    // Stryker disable next-line BooleanLiteral,ObjectLiteral,StringLiteral: `readRows` runs right after `stableRows`.
    return { ok: false, failure: { reason: 'staleEpoch', epoch: stable.epoch } };
  }

  // Stryker disable next-line BlockStatement,ConditionalExpression: `readRows` runs right after `stableRows`.
  if (!read.ok) {
    // Stryker disable next-line BooleanLiteral,ObjectLiteral,StringLiteral: `readRows` runs right after `stableRows`.
    return { ok: false, failure: { reason: 'pruned', oldest: stable.first } };
  }

  if (
    paneRowsBytes(read.rows.rowCount, size.columns, read.rows.graphemes.length) > maxSnapshotBytes
  ) {
    return {
      ok: false,
      failure: { reason: 'tooManyBytes', limitBytes: maxSnapshotBytes, ...selected(stable, span) },
    };
  }

  const widestRow = Math.max(0, ...graphemeWordsPerRow(read.rows, size.columns));

  if (paneRowsBytes(1, size.columns, widestRow) > maxReplyBytes) {
    return {
      ok: false,
      failure: { reason: 'tooManyBytes', limitBytes: maxReplyBytes, ...selected(stable, span) },
    };
  }

  return {
    ok: true,
    rows: {
      source: sourceOf(selection),
      columns: size.columns,
      epoch: stable.epoch,
      screen: stable.screen,
      oldest: stable.first,
      first: span.first,
      rowCount: read.rows.rowCount,
      cells: read.rows.cells,
      graphemes: read.rows.graphemes,
    },
  };
};
