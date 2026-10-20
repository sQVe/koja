import { expect, it, onTestFinished } from 'bun:test';

import { paneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { createTerminal } from '../vt/vt.ts';
import type { Terminal } from '../vt/vt.ts';
import type { Connection } from './connection.ts';
import type { PaneRuntime } from './pane.ts';
import { handlePaneCommand } from './paneRequests.ts';
import { createSnapshotStore } from './paneSnapshot.ts';

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
              publisher: { whenReleased: () => released },
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
