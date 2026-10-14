import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { concatRows, rowsToLines } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';

export type PaneReadSource = 'visible' | 'recent' | 'recentUnwrapped';

// Without a pane id, the command targets the focused pane. With a range, the source says whether
// the rows are joined into logical lines.
export interface PaneReadCommand {
  action: 'read';
  pane: PaneId | undefined;
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
  | { kind: 'done'; output: PaneReadOutput }
  | { kind: 'failed'; failure: PaneReadFailure };

export interface PaneReader {
  start: () => ReadStep;
  takeRows: (rows: PaneRows) => ReadStep;
  takeFailure: (failure: PaneReadFailure) => ReadStep;
}

const defaultRecentRows = 80;

// The most rows a reply holds. A failure names the real limit, which can be lower.
const firstPageRows = 1000;

// Reads what the command asks for. A read that fits one reply takes one request. A larger one
// takes pages of a range in one epoch, so the rows come from one numbering or the read fails.
export const createPaneReader = (command: PaneReadCommand): PaneReader => {
  const unwrap = command.source === 'recentUnwrapped';
  const pages: PaneRows[] = [];
  let pageRows = firstPageRows;
  let next = command.range?.from ?? 0;
  let last = command.range?.to ?? 0;
  let epoch: number | undefined;
  let paging = command.range !== undefined;
  let probing = false;

  const finish = (latest: PaneRows): ReadStep => {
    const first = pages[0];
    const lastPage = pages.at(-1);

    const lines = rowsToLines(concatRows(pages), latest.columns, unwrap);

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

  const nextPage = (): ReadStep => ({
    kind: 'send',
    selection: {
      source: 'range',
      from: next,
      to: Math.min(last, next + pageRows - 1),
      epoch,
    },
  });

  const takeProbe = (probe: PaneRows): ReadStep => {
    probing = false;

    if (probe.rowCount === 0) {
      return finish(probe);
    }

    const wanted = command.lines ?? defaultRecentRows;

    last = probe.first + probe.rowCount - 1;
    next = Math.max(probe.oldest, last + 1 - wanted);
    epoch = probe.epoch;
    paging = true;

    return nextPage();
  };

  const takePage = (page: PaneRows): ReadStep => {
    const requested = Math.min(last, next + pageRows - 1) - next + 1;

    epoch = page.epoch;

    if (page.rowCount > 0) {
      pages.push(page);
    }

    next = page.first + page.rowCount;

    const complete = page.rowCount < requested || next > last;

    return complete ? finish(page) : nextPage();
  };

  const failPaging = (failure: PaneReadFailure): ReadStep => {
    if (failure.reason === 'tooManyRows' && failure.limit < pageRows) {
      pageRows = failure.limit;

      return nextPage();
    }

    if (failure.reason === 'tooManyBytes' && pageRows > 1) {
      pageRows = Math.floor(pageRows / 2);

      return nextPage();
    }

    return { kind: 'failed', failure };
  };

  const startPaging = (): ReadStep => {
    probing = true;

    return { kind: 'send', selection: { source: 'recent', lines: 1 } };
  };

  return {
    start: () => {
      if (command.range !== undefined) {
        return nextPage();
      }

      return { kind: 'send', selection: { source: command.source, lines: command.lines } };
    },
    takeRows: (rows) => {
      if (probing) {
        return takeProbe(rows);
      }

      if (!paging) {
        if (rows.rowCount > 0) {
          pages.push(rows);
        }

        return finish(rows);
      }

      return takePage(rows);
    },
    takeFailure: (failure) => {
      if (paging) {
        return failPaging(failure);
      }

      const tooLarge = failure.reason === 'tooManyBytes' || failure.reason === 'tooManyRows';

      return tooLarge && command.source !== 'visible' ? startPaging() : { kind: 'failed', failure };
    },
  };
};
