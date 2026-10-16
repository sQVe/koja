import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import type { PaneRows } from '../rows/rows.ts';
import { createPaneReader } from './paneRead.ts';
import type { PaneReadFailure, PaneReader, ReadStep } from './paneRead.ts';
import type { RowCache, RowRange } from './rowCache.ts';

interface RowFetcherOptions {
  send: (message: ControlMessage) => void;
  cacheOf: (pane: PaneId) => RowCache | undefined;
  // Called once the rows of a read are in the pane's cache.
  onFetched: (pane: PaneId) => void;
}

interface Wish {
  range: RowRange;
  // Reads of this wish that failed in a way a new read can fix.
  retries: number;
}

interface Read {
  pane: PaneId;
  wish: Wish;
  reader: PaneReader;
  requestId: number;
}

export interface RowFetcher {
  // Wishes the pane's rows in the range to be in its cache. A newer wish for a pane replaces its
  // older one.
  want: (pane: PaneId, range: RowRange) => void;
  // Drops the wish for a pane and the read in flight for it.
  forget: (pane: PaneId) => void;
  takeRows: (rows: PaneRows) => void;
  takeFailure: (pane: PaneId, requestId: number, failure: PaneReadFailure) => void;
}

// The server keeps one read snapshot per connection, so the fetcher reads one range at a time.
const maxRetries = 3;

const canRetry = (failure: PaneReadFailure): boolean =>
  failure.reason === 'noSnapshot' ||
  failure.reason === 'staleEpoch' ||
  failure.reason === 'screenChanged';

export const createRowFetcher = (options: RowFetcherOptions): RowFetcher => {
  const wanted = new Map<PaneId, Wish>();
  let current: Read | undefined;
  let lastRequestId = 0;

  const follow = (read: Read, step: ReadStep): void => {
    if (step.kind === 'next') {
      options.send({ type: 'paneReadNext', paneId: read.pane, requestId: read.requestId });

      return;
    }

    if (step.kind === 'send') {
      lastRequestId += 1;
      read.requestId = lastRequestId;

      options.send({
        type: 'paneRead',
        paneId: read.pane,
        requestId: read.requestId,
        selection: step.selection,
      });

      return;
    }

    current = undefined;

    if (step.kind === 'failed' && canRetry(step.failure) && read.wish.retries < maxRetries) {
      read.wish.retries += 1;

      return;
    }

    if (wanted.get(read.pane) === read.wish) {
      wanted.delete(read.pane);
    }

    options.onFetched(read.pane);
  };

  const startRead = (pane: PaneId, wish: Wish, range: RowRange): void => {
    const reader = createPaneReader({
      action: 'read',
      pane,
      source: 'recent',
      lines: undefined,
      range,
    });

    current = { pane, wish, reader, requestId: 0 };
    follow(current, reader.start());
  };

  // Starts the next wish that still lacks rows, unless a read is in flight. A wish stays until its
  // rows are in the cache or its reads fail for good.
  const pump = (): void => {
    for (;;) {
      const next = wanted.entries().next().value;

      if (current !== undefined || next === undefined) {
        return;
      }

      const [pane, wish] = next;
      const lacking = options.cacheOf(pane)?.missing(wish.range);

      if (lacking === undefined) {
        wanted.delete(pane);
      } else {
        startRead(pane, wish, lacking);
      }
    }
  };

  return {
    want: (pane, range) => {
      wanted.delete(pane);
      wanted.set(pane, { range, retries: 0 });
      pump();
    },
    forget: (pane) => {
      wanted.delete(pane);

      if (current?.pane === pane) {
        current = undefined;
        pump();
      }
    },
    takeRows: (rows) => {
      const read = current;

      if (read === undefined || read.requestId !== rows.requestId) {
        return;
      }

      options.cacheOf(read.pane)?.storeRange(rows);
      follow(read, read.reader.takeRows(rows));
      pump();
    },
    takeFailure: (pane, requestId, failure) => {
      const read = current;

      if (read === undefined || read.pane !== pane || read.requestId !== requestId) {
        return;
      }

      follow(read, read.reader.takeFailure(failure));
      pump();
    },
  };
};
