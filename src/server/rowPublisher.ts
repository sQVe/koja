import type { TerminalSize } from '../layout.ts';
import { pendingPaneReadLimit } from '../protocol/protocol.ts';
import { concatRows, ModeFlag, rowUpdateBytes, rowWords, splitRange } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import type { Frame, RowRange, StableRows, Terminal } from '../vt/vt.ts';
import type { Connection } from './connection.ts';

export interface RowSubscription {
  // Returns false, and changes nothing, for a sequence this subscriber was never sent or has
  // already acknowledged.
  acknowledge: (sequence: number) => boolean;
  unsubscribe: () => void;
}

export interface RowPublisher {
  subscribe: (send: (update: RowUpdate) => void) => RowSubscription;
  publish: () => void;
  // Later updates use the size, and every subscriber gets the full screen again.
  resize: (size: TerminalSize) => void;
  whenReleased: () => Promise<void>;
  waitForRead: (owner: Connection) => Promise<void> | undefined;
  forgetReads: (owner: Connection) => void;
  [Symbol.dispose]: () => void;
}

interface PublisherOptions {
  holdLimitMs?: number;
  // How many updates a subscriber may hold unacknowledged before it gets no more.
  inFlightLimit?: number;
  // How many encoded bytes a subscriber may hold unacknowledged. The next update is counted at the
  // size of the largest one sent to that subscriber.
  inFlightBytes?: number;
  requestPublication: () => void;
}

interface Subscriber {
  send: (update: RowUpdate) => void;
  // Sequences sent and not yet acknowledged, oldest first.
  unacknowledged: { sequence: number; bytes: number }[];
  largestBytes: number;
  // True after a publication skipped this subscriber, so its next update needs every row.
  skipped: boolean;
  // The screen of the last update this subscriber was sent. Undefined before the first.
  alternate: boolean | undefined;
  primarySent: Map<number, bigint>;
  alternateSent: Map<number, bigint>;
}

interface Row {
  offset: number;
  cells: Uint32Array;
  graphemes: Uint32Array;
  hash: bigint;
}

interface Publication {
  pane: number;
  sequence: number;
  size: TerminalSize;
  stable: StableRows;
  frame: Frame;
  active: Row[];
  colors: Uint32Array;
}

const renderHoldLimitMs = 1000;

// Lets a client keep a few updates in flight to cover its round trip, and bounds the bytes
// the server queues for it at that many full screens.
const defaultInFlightLimit = 8;

// Three quarters of the server's 1 MiB connection queue, which leaves room for control messages and
// for an update larger than the one it was estimated from.
const defaultInFlightBytes = 0x0c_00_00;

const sentRows = (subscriber: Subscriber, alternate: boolean): Map<number, bigint> =>
  alternate ? subscriber.alternateSent : subscriber.primarySent;

const splitRows = (source: RowRange, columns: number): Row[] => {
  const stride = rowWords(columns);

  return splitRange(source, columns).map((part, index) => {
    const cellsHash = Bun.hash.xxHash64(part.cells.subarray(1));

    return {
      offset: source.cells[index * stride] ?? 0,
      cells: part.cells,
      graphemes: part.graphemes,
      hash: Bun.hash.xxHash64(part.graphemes, cellsHash),
    };
  });
};

const joinRows = (rows: readonly Row[], columns: number): RowRange => {
  const stride = rowWords(columns);
  const range = concatRows(rows.map((row) => ({ rowCount: 1, ...row })));

  rows.forEach((row, index) => {
    range.cells[index * stride] = row.offset;
  });

  return range;
};

const departedRows = (
  terminal: Terminal,
  sent: Map<number, bigint>,
  stable: StableRows,
  columns: number,
): Row[] => {
  const departed: Row[] = [];

  for (const [number, hash] of sent) {
    if (number >= stable.activeTop) {
      continue;
    }

    sent.delete(number);

    if (number < stable.first) {
      continue;
    }

    const read = terminal.readRows(stable.epoch, number, 1);

    if (!read.ok) {
      continue;
    }

    const [row] = splitRows(read.rows, columns);

    if (row !== undefined && row.hash !== hash) {
      departed.push({ ...row, offset: number - stable.activeTop });
    }
  }

  return departed;
};

const changedRows = (
  sent: Map<number, bigint>,
  active: readonly Row[],
  activeTop: number,
  changedScreen: boolean,
): Row[] => {
  const changed: Row[] = [];

  for (const row of active) {
    const number = activeTop + row.offset;

    if (changedScreen || sent.get(number) !== row.hash) {
      changed.push(row);
      sent.set(number, row.hash);
    }
  }

  return changed;
};

const updateFor = (
  terminal: Terminal,
  subscriber: Subscriber,
  publication: Publication,
): RowUpdate => {
  const { pane, sequence, size, stable, frame, active } = publication;
  const changedScreen = subscriber.alternate !== stable.alternate;

  if (changedScreen) {
    subscriber.alternateSent.clear();
  }

  const sent = sentRows(subscriber, stable.alternate);
  const departed = stable.alternate ? [] : departedRows(terminal, sent, stable, size.columns);
  const changed = changedRows(sent, active, stable.activeTop, changedScreen);
  const rows = joinRows([...departed, ...changed], size.columns);

  return {
    pane,
    sequence,
    size,
    cursor: frame.cursor,
    modes: frame.modes,
    epoch: stable.epoch,
    first: stable.first,
    activeTop: stable.activeTop,
    colors: publication.colors,
    ...rows,
  };
};

const clearInvalidTracking = (
  subscribers: ReadonlySet<Subscriber>,
  changedEpoch: boolean,
): void => {
  if (!changedEpoch) {
    return;
  }

  for (const subscriber of subscribers) {
    subscriber.primarySent.clear();
    subscriber.alternateSent.clear();
  }
};

export const createRowPublisher = (
  terminal: Terminal,
  pane: number,
  initialSize: TerminalSize,
  options: PublisherOptions,
): RowPublisher => {
  let size = initialSize;
  const subscribers = new Set<Subscriber>();
  let previous: StableRows | undefined;
  let sequence = 0;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let holdExpired = false;
  let disposed = false;
  let waiters: (() => void)[] = [];
  const readWaiters = new Map<() => void, Connection>();

  const clearHold = (): void => {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    holdExpired = false;
  };

  const releaseWaiters = (): void => {
    const released = [...waiters, ...readWaiters.keys()];

    waiters = [];
    readWaiters.clear();

    for (const resolve of released) {
      resolve();
    }
  };

  const watchHold = (): void => {
    if (holdTimer !== undefined || holdExpired) {
      return;
    }

    holdTimer = setTimeout(() => {
      holdTimer = undefined;
      holdExpired = true;
      options.requestPublication();
    }, options.holdLimitMs ?? renderHoldLimitMs);
  };

  const inFlightLimit = options.inFlightLimit ?? defaultInFlightLimit;

  const inFlightBytes = options.inFlightBytes ?? defaultInFlightBytes;

  // A subscriber with nothing unacknowledged always gets an update, however large.
  const isPaused = (subscriber: Subscriber): boolean => {
    if (subscriber.unacknowledged.length === 0) {
      return false;
    }

    const pendingBytes = subscriber.unacknowledged.reduce((total, sent) => total + sent.bytes, 0);
    const overBudget = pendingBytes + subscriber.largestBytes > inFlightBytes;

    return subscriber.unacknowledged.length >= inFlightLimit || overBudget;
  };

  const isResuming = (subscriber: Subscriber): boolean =>
    subscriber.skipped && !isPaused(subscriber);

  const subscribe = (send: (update: RowUpdate) => void): RowSubscription => {
    const subscriber: Subscriber = {
      send,
      unacknowledged: [],
      largestBytes: 0,
      skipped: false,
      alternate: undefined,
      primarySent: new Map(),
      alternateSent: new Map(),
    };

    subscribers.add(subscriber);

    const acknowledge = (acknowledged: number): boolean => {
      if (!subscriber.unacknowledged.some((sent) => sent.sequence === acknowledged)) {
        return false;
      }

      const wasPaused = isPaused(subscriber);
      const missedPublication = subscriber.skipped;

      subscriber.unacknowledged = subscriber.unacknowledged.filter(
        (sent) => sent.sequence > acknowledged,
      );

      if (wasPaused && missedPublication && !isPaused(subscriber)) {
        options.requestPublication();
      }

      return true;
    };

    const unsubscribe = (): void => {
      subscribers.delete(subscriber);
    };

    return { acknowledge, unsubscribe };
  };

  const whenReleased = async (): Promise<void> => {
    if (disposed || !terminal.renderHeld()) {
      return;
    }

    const released = new Promise<void>((resolve) => {
      waiters.push(resolve);
    });

    watchHold();

    await released;
  };

  const waitForRead = (owner: Connection): Promise<void> | undefined => {
    if (readWaiters.size >= pendingPaneReadLimit) {
      return undefined;
    }

    const released = new Promise<void>((resolve) => {
      readWaiters.set(resolve, owner);
    });

    watchHold();

    return released;
  };

  const forgetReads = (owner: Connection): void => {
    for (const [resolve, registeredOwner] of readWaiters) {
      if (registeredOwner === owner) {
        readWaiters.delete(resolve);
      }
    }
  };

  const publish = (): void => {
    if (disposed) {
      return;
    }

    if (holdExpired) {
      terminal.endRenderHold();
      clearHold();
      releaseWaiters();
    }

    const stable = terminal.stableRows();
    const changedScreen = previous?.alternate !== stable.alternate;
    const changedEpoch = previous?.epoch !== stable.epoch;

    const hasNewSubscriber = [...subscribers].some((subscriber) => {
      const sent = sentRows(subscriber, stable.alternate);

      return sent.size === 0 || isResuming(subscriber) || subscriber.alternate !== stable.alternate;
    });

    if (changedEpoch || changedScreen || hasNewSubscriber) {
      terminal.markAllDirty();
    }

    const frame = terminal.frame();

    // A held frame predates the live stable row numbers. Keep both from the last publication.
    if ((frame.modes & ModeFlag.renderHeld) !== 0) {
      terminal.markAllDirty();
      watchHold();

      return;
    }

    clearHold();
    releaseWaiters();

    if (subscribers.size === 0) {
      return;
    }

    clearInvalidTracking(subscribers, changedEpoch);

    const active = splitRows(frame, size.columns);

    sequence += 1;
    previous = stable;

    const colors = terminal.colors();

    const publication: Publication = { pane, sequence, size, stable, frame, active, colors };

    for (const subscriber of subscribers) {
      if (isPaused(subscriber)) {
        subscriber.skipped = true;

        continue;
      }

      subscriber.skipped = false;

      const update = updateFor(terminal, subscriber, publication);
      const bytes = rowUpdateBytes(update);

      subscriber.unacknowledged.push({ sequence, bytes });
      subscriber.largestBytes = Math.max(subscriber.largestBytes, bytes);
      subscriber.send(update);
      subscriber.alternate = stable.alternate;
    }
  };

  const resize = (next: TerminalSize): void => {
    size = next;

    for (const subscriber of subscribers) {
      subscriber.primarySent.clear();
      subscriber.alternateSent.clear();
    }
  };

  const dispose = (): void => {
    disposed = true;
    clearHold();
    releaseWaiters();
    subscribers.clear();
  };

  return {
    subscribe,
    publish,
    resize,
    whenReleased,
    waitForRead,
    forgetReads,
    [Symbol.dispose]: dispose,
  };
};
