import { expect, it } from 'bun:test';

import { PaneRowsSource, rowWords } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import { createRowPager } from './rowPaging.ts';

const columns = 2;

const pageOf = (first: number, rowCount: number): PaneRows => ({
  pane: 1,
  requestId: 1,
  source: PaneRowsSource.range,
  columns,
  epoch: 3,
  screen: 0,
  remaining: 0,
  oldest: 10,
  first,
  rowCount,
  cells: new Uint32Array(rowCount * rowWords(columns)),
  graphemes: new Uint32Array(),
});

it('pages a refused range as halved selections and reports the rows read without lines', () => {
  const pager = createRowPager({ source: 'recent', lines: undefined, range: { from: 0, to: 3 } });

  expect(pager.start()).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 0, to: 3, epoch: undefined, screen: undefined },
  });

  const failure = {
    reason: 'tooManyBytes',
    limitBytes: 100,
    epoch: 3,
    screen: 0,
    first: 0,
    count: 4,
  } as const;

  expect(pager.takeFailure(failure)).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 0, to: 1, epoch: 3, screen: 0 },
  });

  expect(pager.takeRows(pageOf(0, 2))).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 2, to: 3, epoch: 3, screen: 0 },
  });

  const done = pager.takeRows(pageOf(2, 2));

  expect(done).toEqual({ kind: 'done', output: { epoch: 3, oldest: 10, from: 0, to: 3 } });
  expect(done.kind === 'done' && 'lines' in done.output).toBe(false);
});
