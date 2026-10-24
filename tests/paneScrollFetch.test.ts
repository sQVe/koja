import { expect, it } from 'bun:test';

import { createRowFetcher } from '../src/client/rowFetch.ts';
import { paneId } from '../src/ids.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';
import { PaneRowsSource, rowWords } from '../src/rows/rows.ts';
import { columns, start, updateOf } from '../src/ui/scrollModeFixtures.ts';

it('waits for later scroll activity after overload and resumes the waiting motion on fetched rows', () => {
  const { mode, cache, fetchedNow } = start([100, 101, 102]);
  const pane = paneId(1);
  const sent: ControlMessage[] = [];
  const fetched: string[] = [];

  const fetcher = createRowFetcher({
    send: (message) => sent.push(message),
    cacheOf: () => cache,
    onFetched: (fetchedPane) => {
      fetched.push(fetchedPane);
      fetchedNow();
    },
  });

  mode.subscribe(() => {
    const reach = mode.reach(pane);

    if (reach !== undefined && cache.missing(reach) !== undefined) {
      fetcher.want(pane, reach);
    }
  });

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'paragraphPrevious' });

  expect(sent).toEqual([
    {
      type: 'paneRead',
      paneId: pane,
      requestId: 1,
      selection: { source: 'range', from: 95, to: 99, epoch: undefined, screen: undefined },
    },
  ]);

  fetcher.takeFailure(pane, 1, { reason: 'tooManyPendingReads', limit: 64 });

  expect(sent).toHaveLength(1);
  expect(fetched).toEqual([]);
  expect(mode.reach(pane)).toEqual({ from: 95, to: 99 });

  mode.handle({ kind: 'move', motion: 'down' });

  expect(sent).toHaveLength(2);

  expect(sent[1]).toMatchObject({
    type: 'paneRead',
    requestId: 2,
    selection: { from: 95, to: 99 },
  });

  const rows = updateOf([95, 96, 97, 98, 99]);

  for (let index = 0; index < rows.rowCount; index += 1) {
    rows.cells[index * rowWords(columns)] = index;
  }

  fetcher.takeRows({
    ...rows,
    requestId: 2,
    source: PaneRowsSource.range,
    columns,
    screen: 0,
    oldest: 95,
    first: 95,
    remaining: 0,
  });

  expect(fetched).toEqual([pane]);
  expect(mode.cursor()).toMatchObject({ row: 101 });
  expect(mode.reach(pane)).toBeUndefined();
  expect(cache.missing({ from: 95, to: 99 })).toBeUndefined();
  expect(sent).toHaveLength(2);
});
