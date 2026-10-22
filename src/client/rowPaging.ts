import type { ControlMessage } from '../protocol/protocol.ts';
import type { PaneRows } from '../rows/rows.ts';

export type PaneReadSource = 'visible' | 'recent' | 'recentUnwrapped';

// With a range, the source says whether the rows are joined into logical lines.
export interface RowPagerCommand {
  source: PaneReadSource;
  lines: number | undefined;
  range: { from: number; to: number } | undefined;
}

export interface RowPagerOutput {
  epoch: number;
  oldest: number;
  // The stable numbers of the first and last row read, absent when no row was read.
  from: number | undefined;
  to: number | undefined;
}

type Selection = Extract<ControlMessage, { type: 'paneRead' }>['selection'];

export type PaneReadFailure = Extract<ControlMessage, { type: 'paneReadFailed' }>['failure'];

export type PagerStep =
  | { kind: 'send'; selection: Selection }
  | { kind: 'next' }
  | { kind: 'done'; output: RowPagerOutput }
  | { kind: 'failed'; failure: PaneReadFailure };

export interface RowPager {
  start: () => PagerStep;
  takeRows: (rows: PaneRows) => PagerStep;
  takeFailure: (failure: PaneReadFailure) => PagerStep;
}

// A range is first asked for whole. A size failure names the rows it covers, and pages halve it.
const wholeRange = Number.MAX_SAFE_INTEGER;

// Pages a read. The server takes one snapshot of the selected rows and sends it in parts, so the
// pager asks for parts until none remain. When the selection is larger than one snapshot, the
// failure names the rows it selected, and the pager reads them as pages of a range, each a
// snapshot, pinned to one epoch and screen so the rows come from one numbering or the read fails.
export const createRowPager = (command: RowPagerCommand): RowPager => {
  let pageRows = wholeRange;
  let pageStart = 0;
  let received = 0;
  let next = command.range?.from ?? 0;
  let last = command.range?.to ?? 0;
  let epoch: number | undefined;
  let screen: number | undefined;
  let paging = command.range !== undefined;
  let firstRead: number | undefined;
  let lastRead: number | undefined;

  const finish = (latest: PaneRows): PagerStep => ({
    kind: 'done',
    output: { epoch: latest.epoch, oldest: latest.oldest, from: firstRead, to: lastRead },
  });

  const nextPage = (): PagerStep => {
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

  const takePage = (page: PaneRows): PagerStep => {
    epoch = page.epoch;
    screen = page.screen;
    received += page.rowCount;

    if (page.rowCount > 0) {
      firstRead ??= page.first;
      lastRead = page.first + page.rowCount - 1;
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

  const failPaging = (failure: PaneReadFailure): PagerStep => {
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
    takeRows: takePage,
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
