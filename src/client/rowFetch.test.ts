import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { encodeControl, parseControl } from '../protocol/protocol.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { CursorShape, PaneRowsSource, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { PaneRows, RowUpdate } from '../rows/rows.ts';
import { createRowCache } from './rowCache.ts';
import { createRowFetcher } from './rowFetch.ts';

const columns = 2;

const pane = paneId(1);

const heldUpdate: RowUpdate = {
  pane: 1,
  sequence: 1,
  size: { columns, rows: 2 },
  cursor: { x: 0, y: 0, visible: true, shape: CursorShape.default, blinking: false },
  modes: 0,
  epoch: 1,
  first: 0,
  activeTop: 100,
  rowCount: 0,
  cells: new Uint32Array(),
  graphemes: new Uint32Array(),
  colors: new Uint32Array(),
};

const rowsFor = (requestId: number, first: number, count: number, remaining = 0): PaneRows => {
  const cells = new Uint32Array(count * rowWords(columns));

  for (let index = 0; index < count; index++) {
    cells[index * rowWords(columns) + rowHeaderWords] = 65 + index;
  }

  return {
    pane: 1,
    requestId,
    source: PaneRowsSource.range,
    columns,
    epoch: 1,
    screen: 1,
    remaining,
    oldest: 0,
    first,
    rowCount: count,
    cells,
    graphemes: new Uint32Array(),
  };
};

const setup = () => {
  const cache = createRowCache({ rowLimit: 100 });
  const sent: ControlMessage[] = [];
  const fetched: string[] = [];

  cache.apply(heldUpdate);

  const fetcher = createRowFetcher({
    send: (message) => sent.push(message),
    cacheOf: () => cache,
    onFetched: (fetchedPane) => fetched.push(fetchedPane),
  });

  return { cache, sent, fetched, fetcher };
};

const rangeOf = (message: ControlMessage | undefined) =>
  message?.type === 'paneRead' && message.selection.source === 'range'
    ? [message.selection.from, message.selection.to]
    : undefined;

it('asks for the rows the cache lacks and stores what the server returns', () => {
  const { cache, sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });

  expect(sent).toHaveLength(1);
  expect(rangeOf(sent[0])).toEqual([10, 12]);

  const requestId = sent[0]?.type === 'paneRead' ? sent[0].requestId : -1;

  fetcher.takeRows(rowsFor(requestId, 10, 3));

  expect(cache.rowAt(11)?.cells[0]).toBe(66);
  expect(fetched).toEqual([pane]);
  expect(cache.missing({ from: 10, to: 12 })).toBeUndefined();
});

it('reads one range at a time and sends the newest wish when the read ends', () => {
  const { sent, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.want(pane, { from: 20, to: 22 });

  expect(sent).toHaveLength(1);

  const requestId = sent[0]?.type === 'paneRead' ? sent[0].requestId : -1;

  fetcher.takeRows(rowsFor(requestId, 10, 3));

  expect(sent.map(rangeOf)).toEqual([
    [10, 12],
    [20, 22],
  ]);
});

it('sends nothing for rows the cache holds or after the pane is forgotten', () => {
  const { cache, sent, fetcher } = setup();

  cache.storeRange(rowsFor(1, 10, 3));
  fetcher.want(pane, { from: 10, to: 12 });

  expect(sent).toEqual([]);

  fetcher.want(pane, { from: 30, to: 31 });
  fetcher.forget(pane);

  const requestId = sent[0]?.type === 'paneRead' ? sent[0].requestId : -1;

  fetcher.takeRows(rowsFor(requestId, 30, 2));
  expect(sent).toHaveLength(1);
});

it('asks for the next part of a snapshot and finishes when none remain', () => {
  const { sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 13 });

  const requestId = sent[0]?.type === 'paneRead' ? sent[0].requestId : -1;

  fetcher.takeRows(rowsFor(requestId, 10, 2, 2));

  expect(sent[1]).toEqual({ type: 'paneReadNext', paneId: pane, requestId });
  expect(fetched).toEqual([]);

  fetcher.takeRows(rowsFor(requestId, 12, 2));

  expect(fetched).toEqual([pane]);
});

it('gives up on a range the server refuses and moves to the next wish', () => {
  const { sent, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });

  const requestId = sent[0]?.type === 'paneRead' ? sent[0].requestId : -1;

  fetcher.takeFailure(pane, requestId, { reason: 'pruned', oldest: 11 });
  fetcher.want(pane, { from: 11, to: 12 });

  expect(sent.map(rangeOf)).toEqual([
    [10, 12],
    [11, 12],
  ]);
});

const fail = (
  fetcher: ReturnType<typeof setup>['fetcher'],
  sent: ControlMessage[],
  reason: 'noSnapshot' | 'pruned',
): void => {
  const last = sent.at(-1);

  const requestId =
    last?.type === 'paneRead' || last?.type === 'paneReadNext' ? last.requestId : -1;

  fetcher.takeFailure(pane, requestId, reason === 'pruned' ? { reason, oldest: 0 } : { reason });
};

it('reads the missing rows again after a multipart read loses its snapshot', () => {
  const { cache, sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 13 });

  const requestId = sent[0]?.type === 'paneRead' ? sent[0].requestId : -1;

  fetcher.takeRows(rowsFor(requestId, 10, 2, 2));
  fail(fetcher, sent, 'noSnapshot');

  expect(sent.map(rangeOf).at(-1)).toEqual([12, 13]);

  const retryId =
    sent.at(-1)?.type === 'paneRead' ? (sent.at(-1) as { requestId: number }).requestId : -1;

  fetcher.takeRows(rowsFor(retryId, 12, 2));

  expect(cache.missing({ from: 10, to: 13 })).toBeUndefined();
  expect(fetched).toEqual([pane]);
});

it('stops retrying a range that keeps failing and a range that was pruned', () => {
  const { sent, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 13 });

  for (let attempt = 0; attempt < 20; attempt++) {
    fail(fetcher, sent, 'noSnapshot');
  }

  const count = sent.length;

  expect(count).toBeLessThan(10);

  fetcher.want(pane, { from: 20, to: 21 });
  fail(fetcher, sent, 'pruned');

  expect(sent.length).toBe(count + 1);
});

it('draws the rows already fetched when a wish is dropped after its retries', () => {
  const { sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 13 });

  const requestId = sent[0]?.type === 'paneRead' ? sent[0].requestId : -1;

  fetcher.takeRows(rowsFor(requestId, 10, 2, 2));

  for (let attempt = 0; attempt < 10; attempt++) {
    fail(fetcher, sent, 'noSnapshot');
  }

  expect(fetched).toEqual([pane]);
});

const requestIdOf = (message: ControlMessage | undefined): number =>
  message?.type === 'paneRead' ? message.requestId : -1;

it.each([
  ['a stale epoch', { reason: 'staleEpoch', epoch: 2 }],
  ['a changed screen', { reason: 'screenChanged', screen: 2 }],
] as const)('reads the range again after %s', (_name, failure) => {
  const { sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.takeFailure(pane, requestIdOf(sent[0]), failure);

  expect(sent.map(rangeOf)).toEqual([
    [10, 12],
    [10, 12],
  ]);

  expect(fetched).toEqual([]);
});

it('sends request IDs that the protocol accepts', () => {
  const { sent, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.takeFailure(pane, requestIdOf(sent[0]), { reason: 'noSnapshot' });
  fetcher.takeFailure(pane, requestIdOf(sent[1]), { reason: 'noSnapshot' });

  expect(sent).toHaveLength(3);

  for (const message of sent) {
    expect(parseControl(encodeControl(message))).toEqual({ ok: true, message });
  }
});

it('sends nothing for a pane that has no row cache', () => {
  const sent: ControlMessage[] = [];
  const fetched: string[] = [];

  const fetcher = createRowFetcher({
    send: (message) => sent.push(message),
    cacheOf: () => undefined,
    onFetched: (fetchedPane) => fetched.push(fetchedPane),
  });

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.want(paneId(2), { from: 10, to: 12 });

  expect(sent).toEqual([]);
  expect(fetched).toEqual([]);
});

it('finishes a read whose pane lost its row cache', () => {
  const cache = createRowCache({ rowLimit: 100 });
  const sent: ControlMessage[] = [];
  const fetched: string[] = [];
  let held: typeof cache | undefined = cache;

  cache.apply(heldUpdate);

  const fetcher = createRowFetcher({
    send: (message) => sent.push(message),
    cacheOf: () => held,
    onFetched: (fetchedPane) => fetched.push(fetchedPane),
  });

  fetcher.want(pane, { from: 10, to: 12 });
  held = undefined;
  fetcher.takeRows(rowsFor(requestIdOf(sent[0]), 10, 3));

  expect(fetched).toEqual([pane]);
  expect(cache.missing({ from: 10, to: 12 })).toEqual({ from: 10, to: 12 });
});

it('reads a pane that is wanted again after the panes wanted before it', () => {
  const { sent, fetcher } = setup();
  const other = paneId(2);

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.want(other, { from: 20, to: 22 });
  fetcher.want(pane, { from: 30, to: 32 });
  fetcher.takeRows(rowsFor(requestIdOf(sent[0]), 10, 3));

  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ type: 'paneRead', paneId: other });
});

it('drops the read of a forgotten pane and ignores its rows', () => {
  const { cache, sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.forget(pane);
  fetcher.takeRows(rowsFor(requestIdOf(sent[0]), 10, 3));

  expect(fetched).toEqual([]);
  expect(cache.missing({ from: 10, to: 12 })).toEqual({ from: 10, to: 12 });
});

it('starts the next wish when the read in flight is forgotten', () => {
  const { sent, fetcher } = setup();
  const other = paneId(2);

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.want(other, { from: 20, to: 22 });
  fetcher.forget(pane);

  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ type: 'paneRead', paneId: other });
});

it('keeps the read in flight when another pane is forgotten', () => {
  const { cache, sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.forget(paneId(2));
  fetcher.takeRows(rowsFor(requestIdOf(sent[0]), 10, 3));

  expect(fetched).toEqual([pane]);
  expect(cache.missing({ from: 10, to: 12 })).toBeUndefined();
});

it('forgets a pane that has no read without error', () => {
  const { sent, fetcher } = setup();

  fetcher.forget(pane);
  fetcher.want(pane, { from: 10, to: 12 });

  expect(sent).toHaveLength(1);
});

it('ignores rows of an older request', () => {
  const { cache, sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });
  fetcher.takeRows(rowsFor(requestIdOf(sent[0]) + 1, 10, 3));

  expect(fetched).toEqual([]);
  expect(cache.missing({ from: 10, to: 12 })).toEqual({ from: 10, to: 12 });
});

it.each([
  ['another pane', paneId(2), 0],
  ['an older request', pane, 1],
])('ignores a failure for %s', (_name, failedPane, requestOffset) => {
  const { sent, fetched, fetcher } = setup();

  fetcher.want(pane, { from: 10, to: 12 });

  fetcher.takeFailure(failedPane, requestIdOf(sent[0]) + requestOffset, {
    reason: 'pruned',
    oldest: 11,
  });

  expect(fetched).toEqual([]);

  fetcher.takeRows(rowsFor(requestIdOf(sent[0]), 10, 3));

  expect(fetched).toEqual([pane]);
});
