import { expect, it } from 'bun:test';

import { RowFlag, PaneRowsSource, cellWords, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import { createPaneReader } from './paneRead.ts';
import type { PaneReadCommand } from './paneRead.ts';

const columns = 4;

const command = (overrides: Partial<PaneReadCommand> = {}): PaneReadCommand => ({
  action: 'read',
  pane: undefined,
  source: 'recent',
  lines: undefined,
  range: undefined,
  ...overrides,
});

// Rows that each hold their text, with a wrap flag for a text that ends in a plus sign.
const pageOf = (first: number, texts: string[], overrides: Partial<PaneRows> = {}): PaneRows => {
  const cells = new Uint32Array(texts.length * rowWords(columns));

  texts.forEach((text, row) => {
    const start = row * rowWords(columns);
    const wrapped = text.endsWith('+');
    const content = wrapped ? text.slice(0, -1) : text;

    cells[start + 1] = wrapped ? RowFlag.wrapped : 0;

    for (let column = 0; column < columns; column += 1) {
      cells[start + rowHeaderWords + column * cellWords] = content.charCodeAt(column) || 0x20;
    }
  });

  return {
    pane: 1,
    requestId: 1,
    source: PaneRowsSource.range,
    columns,
    epoch: 3,
    oldest: 10,
    first,
    rowCount: texts.length,
    cells,
    graphemes: new Uint32Array(),
    ...overrides,
  };
};

it('finishes a read that fits one reply with that reply', () => {
  const reader = createPaneReader(command({ lines: 2 }));

  expect(reader.start()).toEqual({
    kind: 'send',
    selection: { source: 'recent', lines: 2 },
  });

  expect(reader.takeRows(pageOf(20, ['ab', 'cd']))).toEqual({
    kind: 'done',
    output: { epoch: 3, oldest: 10, from: 20, to: 21, lines: ['ab', 'cd'] },
  });
});

const tooManyBytes = (first: number, count: number) =>
  ({ reason: 'tooManyBytes', limitBytes: 100, epoch: 3, first, count }) as const;

it('reads a recent read the server refuses as pages of one epoch, oldest first', () => {
  const reader = createPaneReader(command({ lines: 5 }));

  reader.start();

  expect(reader.takeFailure(tooManyBytes(46, 5))).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 46, to: 50, epoch: 3 },
  });

  expect(reader.takeFailure(tooManyBytes(46, 5))).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 46, to: 50, epoch: 3 },
  });
});

it('halves the page after a byte failure', () => {
  const reader = createPaneReader(command({ range: { from: 0, to: 1999 } }));

  expect(reader.start()).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 0, to: 999, epoch: undefined },
  });

  expect(reader.takeFailure(tooManyBytes(0, 2000))).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 0, to: 499, epoch: undefined },
  });
});

it('joins a wrapped line across a page edge for recent-unwrapped', () => {
  const reader = createPaneReader(
    command({ source: 'recentUnwrapped', range: { from: 0, to: 3 } }),
  );

  const sizeFailure = { reason: 'tooManyRows', limit: 2, epoch: 3, first: 0, count: 4 } as const;

  reader.start();

  expect(reader.takeFailure(sizeFailure)).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 0, to: 1, epoch: undefined },
  });

  expect(reader.takeRows(pageOf(0, ['a', 'bcde+']))).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 2, to: 3, epoch: 3 },
  });

  expect(reader.takeRows(pageOf(2, ['fg', 'h']))).toEqual({
    kind: 'done',
    output: { epoch: 3, oldest: 10, from: 0, to: 3, lines: ['a', 'bcdefg', 'h'] },
  });
});

it('fails a later page that was pruned or changed epoch, and gives no partial result', () => {
  const reader = createPaneReader(command({ range: { from: 0, to: 3 } }));

  reader.start();
  reader.takeFailure({ reason: 'tooManyRows', limit: 2, epoch: 3, first: 0, count: 4 });
  reader.takeRows(pageOf(0, ['a', 'b']));

  expect(reader.takeFailure({ reason: 'staleEpoch', epoch: 4 })).toEqual({
    kind: 'failed',
    failure: { reason: 'staleEpoch', epoch: 4 },
  });
});

it('fails the whole read when a later page was pruned', () => {
  const reader = createPaneReader(command({ range: { from: 0, to: 3 } }));

  reader.start();
  reader.takeFailure({ reason: 'tooManyRows', limit: 2, epoch: 3, first: 0, count: 4 });
  reader.takeRows(pageOf(0, ['a', 'b']));

  expect(reader.takeFailure({ reason: 'pruned', oldest: 3 })).toEqual({
    kind: 'failed',
    failure: { reason: 'pruned', oldest: 3 },
  });
});

it.each(['recent', 'visible'] as const)('reports no bounds for a zero-line %s read', (source) => {
  const reader = createPaneReader(command({ source, lines: 0 }));

  reader.start();

  expect(reader.takeRows(pageOf(101, []))).toEqual({
    kind: 'done',
    output: { epoch: 3, oldest: 10, from: undefined, to: undefined, lines: [] },
  });
});

it('reports no rows from a recent read of an empty pane', () => {
  const reader = createPaneReader(command({ lines: 9 }));

  reader.start();

  expect(reader.takeRows(pageOf(7, []))).toEqual({
    kind: 'done',
    output: { epoch: 3, oldest: 10, from: undefined, to: undefined, lines: [] },
  });
});

it('pages a visible read the server refuses over the rows it selected, in one epoch', () => {
  const reader = createPaneReader(command({ source: 'visible' }));

  reader.start();

  expect(reader.takeFailure(tooManyBytes(30, 4))).toEqual({
    kind: 'send',
    selection: { source: 'range', from: 30, to: 33, epoch: 3 },
  });

  expect(reader.takeRows(pageOf(30, ['a', 'b', 'c', 'd']))).toEqual({
    kind: 'done',
    output: { epoch: 3, oldest: 10, from: 30, to: 33, lines: ['a', 'b', 'c', 'd'] },
  });
});

it.each(['recent', 'visible'] as const)(
  'drops trailing blank lines of a %s read and keeps the rows read',
  (source) => {
    const reader = createPaneReader(command({ source }));

    reader.start();

    expect(reader.takeRows(pageOf(5, ['one', '', 'two', '', '']))).toEqual({
      kind: 'done',
      output: { epoch: 3, oldest: 10, from: 5, to: 9, lines: ['one', '', 'two'] },
    });
  },
);

it('drops trailing blank lines after joining a recent-unwrapped read', () => {
  const reader = createPaneReader(command({ source: 'recentUnwrapped' }));

  reader.start();

  expect(reader.takeRows(pageOf(5, ['abcd+', 'e', '']))).toMatchObject({
    output: { from: 5, to: 7, lines: ['abcde'] },
  });
});

it('keeps a last line of only a no-break space in a recent-unwrapped read', () => {
  const reader = createPaneReader(command({ source: 'recentUnwrapped' }));

  reader.start();

  expect(reader.takeRows(pageOf(5, ['one', '\u00a0', '']))).toMatchObject({
    output: { from: 5, to: 7, lines: ['one', '\u00a0'] },
  });
});

it('returns no lines when every row of a read is blank', () => {
  const reader = createPaneReader(command({ lines: 3 }));

  reader.start();

  expect(reader.takeRows(pageOf(5, ['', '', '']))).toMatchObject({
    output: { from: 5, to: 7, lines: [] },
  });
});

it('keeps the blank rows of an explicit range', () => {
  const reader = createPaneReader(command({ range: { from: 5, to: 7 } }));

  reader.start();

  expect(reader.takeRows(pageOf(5, ['one', '', '']))).toMatchObject({
    output: { from: 5, to: 7, lines: ['one', '', ''] },
  });
});

it('stops a range at the first page with fewer rows than it asked for', () => {
  const reader = createPaneReader(command({ range: { from: 5, to: 99 } }));

  reader.start();

  expect(reader.takeRows(pageOf(5, ['a', 'b']))).toEqual({
    kind: 'done',
    output: { epoch: 3, oldest: 10, from: 5, to: 6, lines: ['a', 'b'] },
  });
});
