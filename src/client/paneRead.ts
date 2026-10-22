import type { PaneId } from '../ids.ts';
import { concatRows, rowsToLines } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import { createRowPager } from './rowPaging.ts';
import type { PaneReadFailure, PaneReadSource, PagerStep, RowPagerOutput } from './rowPaging.ts';

export interface PaneReadCommand {
  action: 'read';
  pane: PaneId;
  source: PaneReadSource;
  lines: number | undefined;
  range: { from: number; to: number } | undefined;
}

export interface PaneReadOutput extends RowPagerOutput {
  lines: string[];
}

type Selection = Extract<PagerStep, { kind: 'send' }>['selection'];

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

// rowsToLines already trimmed the whitespace each source counts as blank, so a blank line is empty.
const withoutTrailingBlanks = (lines: string[]): string[] => {
  const lastText = lines.findLastIndex((line) => line !== '');

  return lines.slice(0, lastText + 1);
};

// Reads what the command asks for and joins the rows into lines. A source read drops its trailing
// blank lines. A range keeps every row.
export const createPaneReader = (command: PaneReadCommand): PaneReader => {
  const unwrap = command.source === 'recentUnwrapped';
  const pager = createRowPager(command);
  const pages: PaneRows[] = [];
  let columns = 0;

  const withLines = (step: PagerStep): ReadStep => {
    if (step.kind !== 'done') {
      return step;
    }

    const joined = rowsToLines(concatRows(pages), columns, unwrap, !unwrap);
    const lines = command.range === undefined ? withoutTrailingBlanks(joined) : joined;

    return { kind: 'done', output: { ...step.output, lines } };
  };

  return {
    start: () => withLines(pager.start()),
    takeRows: (rows) => {
      columns = rows.columns;

      if (rows.rowCount > 0) {
        pages.push(rows);
      }

      return withLines(pager.takeRows(rows));
    },
    takeFailure: (failure) => withLines(pager.takeFailure(failure)),
  };
};
