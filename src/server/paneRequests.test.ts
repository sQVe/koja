import { expect, it, onTestFinished } from 'bun:test';

import { paneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { createTerminal } from '../vt/vt.ts';
import type { Terminal } from '../vt/vt.ts';
import type { Connection } from './connection.ts';
import type { PaneRuntime } from './pane.ts';
import { forgetPaneReads, handlePaneCommand } from './paneRequests.ts';
import { selectPaneRows } from './paneRows.ts';
import { createSnapshot, createSnapshotStore } from './paneSnapshot.ts';
import { createRowPublisher } from './rowPublisher.ts';

interface Fixture {
  context: Parameters<typeof handlePaneCommand>[0];
  connection: Connection;
  sent: ControlMessage[];
  binary: number;
  errors: { message: string; fields: Record<string, unknown> | undefined }[];
  release: (outcome: 'resolve' | 'reject') => void;
  terminal: Terminal;
}

const id = paneId(1);

const noop = (): void => {};

const size = { columns: 20, rows: 5 };

const holdOutput = '\u001B[?2026h';

const fixture = (held: boolean): Fixture => {
  const created = createTerminal(size.columns, size.rows, 1024 * 1024);

  if (!created.ok) {
    throw new Error(created.reason);
  }

  const { terminal } = created;

  onTestFinished(() => {
    terminal[Symbol.dispose]();
  });

  terminal.write(new TextEncoder().encode(held ? `hello${holdOutput}` : 'hello'));

  const sent: ControlMessage[] = [];
  const errors: Fixture['errors'] = [];
  const state = { binary: 0 };
  let resolveRelease: () => void = noop;
  let rejectRelease: (error: Error) => void = noop;

  const released = new Promise<void>((resolve, reject) => {
    resolveRelease = resolve;
    rejectRelease = reject;
  });

  const connection = {
    isClosed: () => false,
    send: (message: ControlMessage) => {
      sent.push(message);
    },
    sendBinary: () => {
      state.binary += 1;
    },
  } as unknown as Connection;

  const context = {
    options: {
      log: {
        debug: noop,
        info: noop,
        warn: noop,
        error: (message: string, fields?: Record<string, unknown>) => {
          errors.push({ message, fields });
        },
      },
    },
    state: { panes: [{ id, lifecycle: 'running', size }], foregroundClientId: undefined },
    runtime: {
      panes: new Map([
        [
          id,
          {
            runtime: { terminal, generation: 1 } as unknown as PaneRuntime,
            publication: {
              pending: false,
              publisher: { whenReleased: () => released, waitForRead: () => released },
            },
          },
        ],
      ]),
      clientIds: new Map(),
      readSnapshots: createSnapshotStore<Connection>(),
    },
  } as unknown as Fixture['context'];

  return {
    context,
    connection,
    sent,
    errors,
    terminal,
    get binary() {
      return state.binary;
    },
    release: (outcome) => {
      if (outcome === 'resolve') {
        terminal.endRenderHold();
        resolveRelease();
      } else {
        rejectRelease(new Error('hold broke'));
      }
    },
  };
};

const usePublisher = (test: Fixture) => {
  const publisher = createRowPublisher(test.terminal, 1, size, { requestPublication: noop });
  const record = test.context.runtime.panes.get(id);

  if (record === undefined) {
    throw new Error('Missing pane');
  }

  record.publication.publisher = publisher;

  onTestFinished(() => {
    publisher[Symbol.dispose]();
  });

  return publisher;
};

const read = {
  type: 'paneRead',
  paneId: id,
  requestId: 1,
  selection: { source: 'visible', lines: undefined },
} satisfies ControlMessage;

const copy = {
  type: 'paneCopy',
  paneId: id,
  start: { row: 0, column: 0 },
  end: { row: 0, column: 2 },
  print: true,
} satisfies ControlMessage;

const turn = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

it.each(['paneRead', 'paneSend'] as const)(
  'handles an existing snapshot when a missing-pane %s arrives',
  (type) => {
    const test = fixture(false);
    const selected = selectPaneRows(test.terminal, size, read.selection);

    if (!selected.ok) {
      throw new Error('Rows were not selected');
    }

    const snapshots = test.context.runtime.readSnapshots;
    const generation = snapshots.begin(test.connection);
    const snapshot = createSnapshot(id, 500, selected.rows);

    snapshots.keep(test.connection, snapshot);

    const missing = paneId(99);

    const message: ControlMessage =
      type === 'paneRead'
        ? { ...read, paneId: missing }
        : { type, paneId: missing, text: 'must not be written' };

    handlePaneCommand(test.context, message, test.connection);
    expect(test.sent).toEqual([{ type: 'paneMissing', paneId: missing }]);
    expect(snapshots.isCurrent(test.connection, generation)).toBe(type === 'paneSend');

    handlePaneCommand(
      test.context,
      { type: 'paneReadNext', paneId: id, requestId: 500 },
      test.connection,
    );

    if (type === 'paneRead') {
      expect(test.binary).toBe(0);

      expect(test.sent[1]).toEqual({
        type: 'paneReadFailed',
        paneId: id,
        requestId: 500,
        failure: { reason: 'noSnapshot' },
      });
    } else {
      expect(test.binary).toBe(1);
      expect(test.sent).toEqual([{ type: 'paneMissing', paneId: missing }]);
    }
  },
);

it.each(['paneRead', 'paneSend'] as const)(
  'handles an accepted held read when a missing-pane %s arrives',
  async (type) => {
    const test = fixture(true);
    const missing = paneId(99);

    const message: ControlMessage =
      type === 'paneRead'
        ? { ...read, paneId: missing, requestId: 2 }
        : { type, paneId: missing, text: 'must not be written' };

    handlePaneCommand(test.context, read, test.connection);
    handlePaneCommand(test.context, message, test.connection);
    expect(test.sent).toEqual([{ type: 'paneMissing', paneId: missing }]);

    test.release('resolve');
    await turn();

    if (type === 'paneRead') {
      expect(test.binary).toBe(0);

      expect(test.sent[1]).toEqual({
        type: 'paneReadFailed',
        paneId: id,
        requestId: 1,
        failure: { reason: 'noSnapshot' },
      });
    } else {
      expect(test.binary).toBe(1);
      expect(test.sent).toEqual([{ type: 'paneMissing', paneId: missing }]);
    }
  },
);

it('answers a read at once when the pane holds no frame', () => {
  const test = fixture(false);

  handlePaneCommand(test.context, read, test.connection);

  expect(test.binary).toBe(1);
});

it('answers a read only after the hold on the pane ends', async () => {
  const test = fixture(true);

  handlePaneCommand(test.context, read, test.connection);
  await turn();

  expect(test.binary).toBe(0);

  test.release('resolve');
  await turn();

  expect(test.binary).toBe(1);
});

it('logs a read whose wait for the hold fails and sends no answer', async () => {
  const test = fixture(true);

  handlePaneCommand(test.context, read, test.connection);
  test.release('reject');
  await turn();

  expect(test.binary).toBe(0);
  expect(test.sent).toEqual([]);
  expect(test.errors).toHaveLength(1);
  expect(test.errors[0]?.fields).toEqual({ paneId: id, error: 'hold broke' });
  expect(test.errors[0]?.message.length).toBeGreaterThan(0);
});

it('limits held reads across connections without superseding the accepted generation', async () => {
  const test = fixture(true);
  const publisher = usePublisher(test);
  const other = { ...test.connection };

  for (let requestId = 1; requestId <= 64; requestId += 1) {
    handlePaneCommand(
      test.context,
      { ...read, requestId },
      requestId % 2 === 0 ? test.connection : other,
    );
  }

  expect(test.sent).toEqual([]);
  handlePaneCommand(test.context, { ...read, requestId: 65 }, test.connection);

  expect(test.sent).toEqual([
    {
      type: 'paneReadFailed',
      paneId: id,
      requestId: 65,
      failure: { reason: 'tooManyPendingReads', limit: 64 },
    },
  ]);

  test.terminal.endRenderHold();
  publisher.publish();
  await turn();

  expect(test.binary).toBe(2);

  expect(
    test.sent.filter(
      (message) => message.type === 'paneReadFailed' && message.failure.reason === 'noSnapshot',
    ),
  ).toHaveLength(62);
});

it('removes disconnected read waiters without resuming them and frees capacity', async () => {
  const test = fixture(true);
  const publisher = usePublisher(test);
  let resumed = 0;

  const disconnected = {
    ...test.connection,
    isClosed: () => {
      resumed += 1;

      return true;
    },
  };

  const retained = { ...test.connection };

  for (let requestId = 1; requestId <= 64; requestId += 1) {
    const owner = requestId % 2 === 0 ? disconnected : retained;

    handlePaneCommand(test.context, { ...read, requestId }, owner);
  }

  forgetPaneReads(test.context, disconnected);
  forgetPaneReads(test.context, disconnected);

  for (let requestId = 65; requestId <= 96; requestId += 1) {
    handlePaneCommand(test.context, { ...read, requestId }, test.connection);
  }

  expect(test.sent).toEqual([]);

  test.terminal.endRenderHold();
  publisher.publish();
  await turn();

  expect(resumed).toBe(0);
  expect(test.binary).toBe(2);
  expect(test.sent).toHaveLength(62);
});

it('keeps an existing snapshot readable when a held read is refused', () => {
  const test = fixture(false);
  const publisher = usePublisher(test);
  const selected = selectPaneRows(test.terminal, size, read.selection);

  if (!selected.ok) {
    throw new Error('Rows were not selected');
  }

  const snapshot = createSnapshot(id, 500, selected.rows);

  test.context.runtime.readSnapshots.keep(test.connection, snapshot);
  test.terminal.write(new TextEncoder().encode(holdOutput));

  const other = { ...test.connection };

  for (let requestId = 1; requestId <= 64; requestId += 1) {
    handlePaneCommand(test.context, { ...read, requestId }, other);
  }

  handlePaneCommand(test.context, read, test.connection);
  expect(test.context.runtime.readSnapshots.find(test.connection, id, 500)).toBe(snapshot);

  handlePaneCommand(
    test.context,
    { type: 'paneReadNext', paneId: id, requestId: 500 },
    test.connection,
  );

  expect(test.binary).toBe(1);

  expect(test.sent).toEqual([
    {
      type: 'paneReadFailed',
      paneId: id,
      requestId: 1,
      failure: { reason: 'tooManyPendingReads', limit: 64 },
    },
  ]);

  publisher.forgetReads(other);
});

it('does not limit copy or unheld reads when held read capacity is full', async () => {
  const test = fixture(true);
  const publisher = usePublisher(test);

  for (let requestId = 1; requestId <= 64; requestId += 1) {
    handlePaneCommand(test.context, { ...read, requestId }, test.connection);
  }

  handlePaneCommand(test.context, copy, test.connection);
  expect(test.sent).toEqual([]);

  test.terminal.endRenderHold();
  handlePaneCommand(test.context, { ...read, requestId: 65 }, test.connection);
  expect(test.binary).toBe(1);

  publisher.publish();
  await turn();

  expect(test.sent.filter((message) => message.type === 'paneCopyResult')).toEqual([
    { type: 'paneCopyResult', result: { ok: true, text: 'hel', clientId: undefined } },
  ]);

  expect(test.binary).toBe(1);
});

it('answers a copy at once when the pane holds no frame', () => {
  const { context, connection, sent } = fixture(false);

  handlePaneCommand(context, copy, connection);

  expect(sent).toEqual([
    { type: 'paneCopyResult', result: { ok: true, text: 'hel', clientId: undefined } },
  ]);
});

it('answers a copy only after the hold on the pane ends', async () => {
  const test = fixture(true);

  handlePaneCommand(test.context, copy, test.connection);
  await turn();

  expect(test.sent).toEqual([]);

  test.release('resolve');
  await turn();

  expect(test.sent).toHaveLength(1);
});

it('answers a copy of an unknown pane as unknown', () => {
  const { context, connection, sent } = fixture(false);

  context.runtime.panes.clear();
  handlePaneCommand(context, copy, connection);

  expect(sent).toEqual([
    { type: 'paneCopyResult', result: { ok: false, reason: 'unknownPane', oldest: undefined } },
  ]);
});

it('logs a copy whose wait for the hold fails and sends no answer', async () => {
  const test = fixture(true);

  handlePaneCommand(test.context, copy, test.connection);
  test.release('reject');
  await turn();

  expect(test.sent).toEqual([]);
  expect(test.errors).toHaveLength(1);
  expect(test.errors[0]?.fields).toEqual({ paneId: id, error: 'hold broke' });
});
