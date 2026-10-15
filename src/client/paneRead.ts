import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { concatRows, rowsToLines } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';

export type PaneReadSource = 'visible' | 'recent' | 'recentUnwrapped';

// With a range, the source says whether the rows are joined into logical lines.
export interface PaneReadCommand {
  action: 'read';
  pane: PaneId;
  source: PaneReadSource;
  lines: number | undefined;
  range: { from: number; to: number } | undefined;
}

export interface PaneReadOutput {
  epoch: number;
  oldest: number;
  // The stable numbers of the first and last row read, absent when no row was read.
  from: number | undefined;
  to: number | undefined;
  lines: string[];
}

type Selection = Extract<ControlMessage, { type: 'paneRead' }>['selection'];

export type PaneReadFailure = Extract<ControlMessage, { type: 'paneReadFailed' }>['failure'];

export type ReadStep =
  | { kind: 'send'; selection: Selection }
  | { kind: 'next' }
  | { kind: 'done'; output: PaneReadOutput }
  | { kind: 'failed'; failure: PaneReadFailure };

export interface PaneReader {
  start: () => ReadStep;
  takeRows: (rows: PaneRows) => ReadStep;
  takeFailure: (failure: PaneReadFailure) => ReadStep;
}

// A range is first asked for whole. A size failure names the rows it covers, and pages halve it.
const wholeRange = Number.MAX_SAFE_INTEGER;

// rowsToLines already trimmed the whitespace each source counts as blank, so a blank line is empty.
const withoutTrailingBlanks = (lines: string[]): string[] => {
  const lastText = lines.findLastIndex((line) => line !== '');

  return lines.slice(0, lastText + 1);
};

// Reads what the command asks for. The server takes one snapshot of the selected rows and sends it
// in parts, so the reader asks for parts until none remain. When the selection is larger than one
// snapshot, the failure names the rows it selected, and the reader reads them as pages of a range,
// each a snapshot, pinned to one epoch and screen so the rows come from one numbering or the read
// fails.
// A source read drops its trailing blank lines. A range keeps every row.
export const createPaneReader = (command: PaneReadCommand): PaneReader => {
  const unwrap = command.source === 'recentUnwrapped';
  const pages: PaneRows[] = [];
  let pageRows = wholeRange;
  let pageStart = command.range?.from ?? 0;
  let received = 0;
  let next = command.range?.from ?? 0;
  let last = command.range?.to ?? 0;
  let epoch: number | undefined;
  let screen: number | undefined;
  let paging = command.range !== undefined;

  const finish = (latest: PaneRows): ReadStep => {
    const first = pages[0];
    const lastPage = pages.at(-1);

    const joined = rowsToLines(concatRows(pages), latest.columns, unwrap, !unwrap);
    const lines = command.range === undefined ? withoutTrailingBlanks(joined) : joined;

    return {
      kind: 'done',
      output: {
        epoch: latest.epoch,
        oldest: latest.oldest,
        from: first?.first,
        to: lastPage === undefined ? undefined : lastPage.first + lastPage.rowCount - 1,
        lines,
      },
    };
  };

  const nextPage = (): ReadStep => {
    pageStart = next;
    received = 0;

    return {
      kind: 'send',
      selection: {
        source: 'range',
        from: next,
        to: Math.min(last, next + pageRows - 1),
        epoch,
        screen,
      },
    };
  };

  const takePage = (page: PaneRows): ReadStep => {
    epoch = page.epoch;
    screen = page.screen;
    received += page.rowCount;

    if (page.rowCount > 0) {
      pages.push(page);
    }

    if (page.remaining > 0) {
      return { kind: 'next' };
    }

    const requested = Math.min(last, pageStart + pageRows - 1) - pageStart + 1;

    next = pageStart + received;

    const complete = received < requested || next > last;

    return complete ? finish(page) : nextPage();
  };

  const pinFrom = (failure: { epoch: number; screen: number }): void => {
    epoch ??= failure.epoch;
    screen ??= failure.screen;
  };

  const failPaging = (failure: PaneReadFailure): ReadStep => {
    if (failure.reason !== 'tooManyBytes') {
      return { kind: 'failed', failure };
    }

    pinFrom(failure);

    const halved = Math.floor(Math.min(pageRows, failure.count) / 2);

    if (halved < 1) {
      return { kind: 'failed', failure };
    }

    pageRows = halved;

    return nextPage();
  };

  return {
    start: () => {
      if (command.range !== undefined) {
        return nextPage();
      }

      return { kind: 'send', selection: { source: command.source, lines: command.lines } };
    },
    takeRows: (rows) => {
      if (!paging) {
        if (rows.rowCount > 0) {
          pages.push(rows);
        }

        return rows.remaining > 0 ? { kind: 'next' } : finish(rows);
      }

      return takePage(rows);
    },
    takeFailure: (failure) => {
      if (paging) {
        return failPaging(failure);
      }

      if (failure.reason !== 'tooManyBytes') {
        return { kind: 'failed', failure };
      }

      next = failure.first;
      last = failure.first + failure.count - 1;
      epoch = failure.epoch;
      screen = failure.screen;
      paging = true;

      return nextPage();
    },
  };
};
