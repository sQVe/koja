import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connectAttach } from '../src/client/client.ts';
import { clientId, paneId, tabId, workspaceId } from '../src/ids.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  maxFramePayloadBytes,
  parseControl,
} from '../src/protocol/protocol.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';
import {
  decodePaneInput,
  encodeRowUpdate,
  ModeFlag,
  rowHeaderWords,
  rowWords,
} from '../src/rows/rows.ts';
import type { RowUpdate } from '../src/rows/rows.ts';
import { createLog } from '../src/server/log.ts';
import { runServer } from '../src/server/server.ts';
import { waitFor } from './serverProcesses.ts';

type Reply = (Uint8Array | ControlMessage)[] | undefined;

const version = { version: 'test', ghostty: 'test-ghostty' };

const size = { columns: 100, rows: 30 };

const pane = {
  id: paneId(7),
  tabId: tabId(1),
  lifecycle: 'running',
  generation: 1,
  size: { columns: 100, rows: 29 },
  exitCode: undefined,
  startFolder: undefined,
  restored: false,
  error: undefined,
} as const;

const tab = {
  id: tabId(1),
  workspaceId: workspaceId(1),
  layout: { kind: 'pane', paneId: pane.id },
  focusedPaneId: pane.id,
  zoomedPaneId: undefined,
  label: undefined,
} as const;

const workspace = {
  id: workspaceId(1),
  root: '/work/phi',
  label: 'phi',
  tabIds: [tab.id],
} as const;

const view = {
  focusedWorkspaceId: workspace.id,
  activeTabs: [{ workspaceId: workspace.id, tabId: tab.id }],
  scrolls: [],
};

const snapshotAt = (revision: number, clients = 0) => ({
  revision,
  workspaces: [workspace],
  tabs: [tab],
  panes: [pane],
  defaultView: view,
  attachedClientId: undefined,
  foregroundClientId: undefined,
  clients: Array.from({ length: clients }, (_, index) => ({
    id: clientId(index + 1),
    size,
    theme: undefined,
    view,
  })),
});

const snapshotMessage = (revision: number, clients = 0): ControlMessage => ({
  type: 'snapshot',
  snapshot: {
    revision,
    workspaces: [workspace],
    tabs: [tab],
    panes: [pane],
    defaultView: view,
    attachedClientId: undefined,
    foregroundClientId: undefined,
    clients: Array.from({ length: clients }, (_, index) => ({
      id: clientId(index + 1),
      size,
      theme: undefined,
      view,
    })),
  },
});

const control = (message: ControlMessage) => encodeFrame(FrameKind.control, encodeControl(message));

const toBytes = (reply: Uint8Array | ControlMessage): Uint8Array =>
  reply instanceof Uint8Array ? reply : control(reply);

const listen = async (respond: (message: ControlMessage) => Reply) => {
  const directory = await mkdtemp(join(tmpdir(), 'phi-attach-client-'));
  const socketPath = join(directory, 'phi.sock');
  const received: ControlMessage[] = [];
  const inputs: Uint8Array[] = [];
  const inputArrived = Promise.withResolvers<undefined>();
  const inputWaiters: { bytes: number; resolve: () => void }[] = [];
  let inputBytes = 0;
  const decoder = createFrameDecoder();

  // The pane-number word comes before the input bytes in each payload.
  const takeInput = (payload: Uint8Array): void => {
    inputs.push(payload);
    inputBytes += payload.length - 4;
    inputArrived.resolve(undefined);

    for (const waiter of inputWaiters.filter((each) => inputBytes >= each.bytes)) {
      waiter.resolve();
    }
  };

  const inputBytesArrived = async (bytes: number): Promise<void> => {
    const { promise, resolve } = Promise.withResolvers<undefined>();

    inputWaiters.push({
      bytes,
      resolve: () => {
        resolve(undefined);
      },
    });

    if (inputBytes >= bytes) {
      resolve(undefined);
    }

    await promise;
  };

  const sockets: Bun.Socket[] = [];

  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      open: (socket) => {
        sockets.push(socket);
      },
      data: (socket, bytes) => {
        const decoded = decoder.push(bytes);

        if (!decoded.ok) {
          socket.end();

          return;
        }

        for (const frame of decoded.frames) {
          if (frame.kind === FrameKind.input) {
            takeInput(frame.payload);

            continue;
          }

          const parsed = parseControl(frame.payload);

          if (!parsed.ok) {
            socket.end();

            return;
          }

          received.push(parsed.message);

          const replies = respond(parsed.message);

          if (replies === undefined) {
            socket.end();

            return;
          }

          for (const reply of replies) {
            socket.write(toBytes(reply));
          }
        }
      },
    },
  });

  onTestFinished(async () => {
    listener.stop(true);
    await rm(directory, { recursive: true, force: true });
  });

  return {
    socketPath,
    received,
    inputs,
    inputArrived: inputArrived.promise,
    inputBytesArrived,
    sockets,
  };
};

const untilState = async (
  session: { subscribe: (listener: () => void) => () => void },
  isReady: () => boolean,
) => {
  const ready = Promise.withResolvers<undefined>();

  const unsubscribe = session.subscribe(() => {
    if (isReady()) {
      ready.resolve(undefined);
    }
  });

  if (isReady()) {
    ready.resolve(undefined);
  }

  await ready.promise;
  unsubscribe();
};

const attach = async (server: { socketPath: string }) => {
  const result = await connectAttach(server.socketPath, version, size);

  if (!result.ok) {
    throw new Error(`Attach failed: ${result.reason}`);
  }

  onTestFinished(() => {
    result.session.close();
  });

  return result.session;
};

const welcomeWith = (...replies: (Uint8Array | ControlMessage)[]) => {
  return (message: ControlMessage): Reply =>
    message.type === 'hello' ? [{ type: 'welcome' }, ...replies] : [];
};

it('sends the terminal size in the hello', async () => {
  const server = await listen(welcomeWith(snapshotMessage(1)));

  await attach(server);

  expect(server.received).toEqual([{ type: 'hello', version, size }]);
});

it('sends resync after a revision gap and applies the next snapshot', async () => {
  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [
        { type: 'welcome' },
        snapshotMessage(2),
        {
          type: 'change',
          revision: 4,
          change: { type: 'paneResized', paneId: pane.id, size: { columns: 50, rows: 10 } },
        },
      ];
    }

    return message.type === 'resync' ? [snapshotMessage(5, 1)] : [];
  });

  const session = await attach(server);

  await untilState(session, () => session.getState().snapshot.revision === 5);

  expect(server.received.map((message) => message.type)).toEqual(['hello', 'resync']);
  expect(session.getState()).toEqual({ snapshot: snapshotAt(5, 1), inputMode: 'insert' });
});

it('notifies subscribers of an input mode change and keeps it across a snapshot', async () => {
  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }, snapshotMessage(1)];
    }

    return message.type === 'resize' ? [snapshotMessage(2)] : [];
  });

  const session = await attach(server);
  let notified = 0;

  session.subscribe(() => {
    notified += 1;
  });

  expect(session.getState().inputMode).toBe('insert');

  session.setInputMode('normal');
  session.setInputMode('normal');

  expect(notified).toBe(1);

  session.resize(size);
  await untilState(session, () => session.getState().snapshot.revision === 2);

  expect(session.getState().inputMode).toBe('normal');
});

it('applies a change whose revision follows the snapshot', async () => {
  const resized = { columns: 50, rows: 10 };

  const server = await listen(
    welcomeWith(snapshotMessage(2), {
      type: 'change',
      revision: 3,
      change: { type: 'paneResized', paneId: pane.id, size: resized },
    }),
  );

  const session = await attach(server);

  await untilState(session, () => session.getState().snapshot.revision === 3);

  expect(session.getState().snapshot.panes[0]?.size).toEqual(resized);
  expect(server.received.map((message) => message.type)).toEqual(['hello']);
});

const rowUpdate = (overrides: Partial<RowUpdate> = {}): RowUpdate => {
  const columns = 3;
  const cells = new Uint32Array(rowWords(columns));

  cells[rowHeaderWords] = 'h'.codePointAt(0) ?? 0;

  return {
    pane: 7,
    sequence: 1,
    size: { columns, rows: 2 },
    cursor: { x: 1, y: 0, visible: true },
    modes: 0,
    epoch: 1,
    first: 0,
    activeTop: 10,
    rowCount: 1,
    cells,
    graphemes: new Uint32Array(),
    colors: new Uint32Array(),
    ...overrides,
  };
};

it('fills the row cache from row updates', async () => {
  const server = await listen(
    welcomeWith(encodeFrame(FrameKind.rowUpdate, encodeRowUpdate(rowUpdate())), snapshotMessage(1)),
  );

  const session = await attach(server);
  const cache = session.rowCache(paneId(7));

  expect(cache?.size()).toEqual({ columns: 3, rows: 2 });
  expect(cache?.cursor()).toEqual({ x: 1, y: 0, visible: true });
  expect(cache?.row(0)?.cells[0]).toBe('h'.codePointAt(0));
  expect(cache?.row(1)).toBeUndefined();
});

it('sends a resize message', async () => {
  const resized = { columns: 120, rows: 40 };
  const arrived = Promise.withResolvers<undefined>();

  const server = await listen((message) => {
    if (message.type === 'resize') {
      arrived.resolve(undefined);
    }

    return message.type === 'hello' ? [{ type: 'welcome' }, snapshotMessage(1)] : [];
  });

  const session = await attach(server);

  session.resize(resized);

  await arrived.promise;

  expect(server.received).toEqual([
    { type: 'hello', version, size },
    { type: 'resize', size: resized },
  ]);
});

it('sends input bytes for a pane as one input frame', async () => {
  const bytes = new TextEncoder().encode('echo phi-input\r');

  const server = await listen((message) =>
    message.type === 'hello' ? [{ type: 'welcome' }, snapshotMessage(1)] : [],
  );

  const session = await attach(server);

  session.sendInput(paneId(1), bytes);

  await server.inputArrived;

  const [payload] = server.inputs;
  const decoded = decodePaneInput(payload ?? new Uint8Array());

  expect(server.inputs).toHaveLength(1);
  expect(decoded).toEqual({ ok: true, input: { pane: 1, bytes } });
});

it('splits input larger than one frame across input frames in order', async () => {
  const bytes = new Uint8Array(maxFramePayloadBytes + 10).map((_, index) => index % 251);

  const server = await listen((message) =>
    message.type === 'hello' ? [{ type: 'welcome' }, snapshotMessage(1)] : [],
  );

  const session = await attach(server);

  session.sendInput(paneId(1), bytes);

  await server.inputBytesArrived(bytes.length);

  const decoded = server.inputs.map((payload) => decodePaneInput(payload));
  const parts = decoded.map((result) => (result.ok ? result.input.bytes : new Uint8Array()));

  expect(server.inputs.length).toBeGreaterThan(1);
  expect(decoded.every((result) => result.ok && result.input.pane === 1)).toBe(true);
  expect(Buffer.concat(parts).equals(Buffer.from(bytes))).toBe(true);
});

it('returns both versions when the server refuses the build', async () => {
  const serverVersion = { version: 'other', ghostty: 'other-ghostty' };

  const server = await listen(() => [{ type: 'refused', client: version, server: serverVersion }]);

  const result = await connectAttach(server.socketPath, version, size);

  expect(result).toEqual({ ok: false, reason: 'refused', client: version, server: serverVersion });
});

it('returns noServer when no server listens', async () => {
  const result = await connectAttach('/nonexistent/phi.sock', version, size);

  expect(result).toEqual({ ok: false, reason: 'noServer' });
});

it('resolves closed when the server ends the socket', async () => {
  const server = await listen(welcomeWith(snapshotMessage(1)));
  const session = await attach(server);

  for (const socket of server.sockets) {
    socket.end();
  }

  expect(await session.closed).toBe('serverClosed');
});

it.each([
  ['takenOver', { type: 'takenOver' }],
  ['detached', { type: 'detached' }],
] as const)(
  'resolves closed with %s when the server sends that message',
  async (reason, message) => {
    const server = await listen(welcomeWith(snapshotMessage(1), message));
    const session = await attach(server);

    expect(await session.closed).toBe(reason);
  },
);

it('closes with connectionFailed after a frame it cannot parse', async () => {
  const server = await listen(
    welcomeWith(snapshotMessage(1), encodeFrame(FrameKind.control, new TextEncoder().encode('{'))),
  );

  const session = await attach(server);

  expect(await session.closed).toBe('connectionFailed');
});

it('hands the update sequence to row listeners and acks only when told to', async () => {
  const sequences: number[] = [];
  const arrived = Promise.withResolvers<undefined>();

  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }, snapshotMessage(1)];
    }

    if (message.type === 'resize') {
      return [
        encodeFrame(FrameKind.rowUpdate, encodeRowUpdate(rowUpdate({ sequence: 1 }))),
        encodeFrame(FrameKind.rowUpdate, encodeRowUpdate(rowUpdate({ sequence: 2 }))),
      ];
    }

    if (message.type === 'ack') {
      arrived.resolve(undefined);
    }

    return [];
  });

  const session = await attach(server);
  const listened = Promise.withResolvers<undefined>();

  session.subscribeRows(({ sequence }) => {
    sequences.push(sequence);

    if (sequences.length === 2) {
      listened.resolve(undefined);
    }
  });

  session.resize({ columns: 120, rows: 40 });
  await listened.promise;

  expect(sequences).toEqual([1, 2]);
  expect(server.received.some((message) => message.type === 'ack')).toBe(false);

  session.acknowledge(paneId(7), 2);
  await arrived.promise;

  expect(server.received.filter((message) => message.type === 'ack')).toEqual([
    { type: 'ack', paneId: paneId(7), sequence: 2 },
  ]);
});

it('sends no ack after the session closed', async () => {
  const server = await listen(welcomeWith(snapshotMessage(1)));
  const session = await attach(server);

  session.close();
  await session.closed;
  session.acknowledge(paneId(7), 1);
  await Bun.sleep(20);

  expect(server.received.map((message) => message.type)).toEqual(['hello']);
});

it('sends no ack for a row update it cannot decode', async () => {
  const server = await listen(
    welcomeWith(snapshotMessage(1), encodeFrame(FrameKind.rowUpdate, new Uint8Array([1, 2, 3]))),
  );

  const session = await attach(server);

  expect(await session.closed).toBe('connectionFailed');
  expect(server.received.map((message) => message.type)).toEqual(['hello']);
});

// Sends workspaceCreate over a raw connection and resolves once the server answers it.
const createWorkspace = async (socketPath: string, root: string): Promise<void> => {
  const decoder = createFrameDecoder();
  const answered = Promise.withResolvers<undefined>();

  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data: (_socket, bytes) => {
        const decoded = decoder.push(bytes);

        for (const frame of decoded.ok ? decoded.frames : []) {
          const parsed = parseControl(frame.payload);

          if (parsed.ok && parsed.message.type === 'workspaceDone') {
            answered.resolve(undefined);
          }
        }
      },
    },
  });

  const send = (message: ControlMessage): void => {
    socket.write(encodeFrame(FrameKind.control, encodeControl(message)));
  };

  send({ type: 'hello', version, size: undefined });
  send({ type: 'workspaceCreate', root, label: 'paced', focus: true });
  await answered.promise;
  socket.end();
};

it('keeps receiving row updates from a real server past the in-flight limit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'phi-attach-paced-'));
  const created = createLog(join(directory, 'state', 'server.log'), Date.now);

  if (!created.ok) {
    throw new Error(created.message);
  }

  const started = await runServer({
    socketPath: join(directory, 'run', 'phi.sock'),
    version,
    log: created.log,
    environment: { ...process.env, SHELL: '/bin/sh' },
    binaryPath: process.execPath,
    holdLimitMs: 60_000,
  });

  if (!started.ok) {
    throw new Error(started.message);
  }

  const { server } = started;

  onTestFinished(async () => {
    server.stop();
    await server.stopped;
    await rm(directory, { recursive: true, force: true });
  });

  await createWorkspace(join(directory, 'run', 'phi.sock'), directory);

  const session = await attach({ socketPath: join(directory, 'run', 'phi.sock') });
  let updates = 0;

  session.subscribeRows(({ pane: changedPane, sequence }) => {
    updates += 1;
    session.acknowledge(changedPane, sequence);
  });

  const printLine = async (line: number): Promise<void> => {
    const marker = `line-${line}`;
    const seen = updates;

    server.writeToPane(`echo ${marker}\n`);
    expect(await waitFor(() => server.paneText()?.includes(marker) === true)).toBe(true);
    expect(await waitFor(() => updates > seen)).toBe(true);
  };

  for (let line = 0; line < 16; line += 1) {
    await printLine(line);
  }

  expect(updates).toBeGreaterThan(8);
});

it('reports the newest sequence of row updates that arrived before any listener', async () => {
  const server = await listen(
    welcomeWith(
      encodeFrame(FrameKind.rowUpdate, encodeRowUpdate(rowUpdate({ sequence: 1 }))),
      encodeFrame(FrameKind.rowUpdate, encodeRowUpdate(rowUpdate({ sequence: 2 }))),
      snapshotMessage(1),
    ),
  );

  const session = await attach(server);

  expect(session.newestSequence(paneId(7))).toBe(2);
  expect(session.newestSequence(paneId(8))).toBeUndefined();
});

it('reports the reply to each workspace command in the order they were sent', async () => {
  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }, snapshotMessage(1)];
    }

    if (message.type === 'workspaceFocus') {
      return [{ type: 'workspaceDone', workspaceId: message.workspaceId }];
    }

    if (message.type === 'workspaceClose') {
      return [{ type: 'workspaceFailed', reason: 'unknownWorkspace', message: undefined }];
    }

    return [];
  });

  const session = await attach(server);
  const replies: string[] = [];

  session.sendWorkspaceCommand({ action: 'focus', workspaceId: workspaceId(1) }, (reply) => {
    replies.push(`focus ${reply}`);
  });

  session.sendWorkspaceCommand({ action: 'close', workspaceId: workspaceId(1) }, (reply) => {
    replies.push(`close ${reply}`);
  });

  await waitFor(() => replies.length === 2);

  expect(replies).toEqual(['focus done', 'close failed']);
});

const twoTabSnapshot = (): ControlMessage => {
  const second = { ...pane, id: paneId(8), tabId: tabId(2) };

  const secondTab = {
    ...tab,
    id: tabId(2),
    layout: { kind: 'pane', paneId: second.id },
    focusedPaneId: second.id,
  } as const;

  return {
    type: 'snapshot',
    snapshot: {
      ...snapshotAt(1),
      workspaces: [{ ...workspace, tabIds: [tab.id, secondTab.id] }],
      tabs: [tab, secondTab],
      panes: [pane, second],
    },
  };
};

const switchedReplies = (message: ControlMessage): Reply => {
  if (message.type === 'hello') {
    const stale = encodeFrame(
      FrameKind.rowUpdate,
      encodeRowUpdate(rowUpdate({ pane: 8, modes: 0 })),
    );

    return [{ type: 'welcome' }, stale, twoTabSnapshot()];
  }

  if (message.type === 'tabFocus') {
    return [
      {
        type: 'change',
        revision: 2,
        change: { type: 'tabFocused', workspaceId: workspace.id, tabId: tabId(2) },
      },
      { type: 'tabDone', tabId: tabId(2) },
    ];
  }

  if (message.type === 'resize') {
    return [
      encodeFrame(
        FrameKind.rowUpdate,
        encodeRowUpdate(rowUpdate({ pane: 8, sequence: 2, modes: ModeFlag.bracketedPaste })),
      ),
    ];
  }

  return [];
};

it('holds input after a tab switch until the shown pane sends fresh rows', async () => {
  const server = await listen(switchedReplies);
  const session = await attach(server);
  const released = Promise.withResolvers<number | undefined>();

  session.focusTab({ kind: 'next' });

  session.afterTabAnswer(() => {
    released.resolve(session.rowCache(paneId(8))?.modes());
  });

  await untilState(session, () => session.getState().snapshot.revision === 2);
  await waitFor(() => server.received.some((message) => message.type === 'tabFocus'));
  await Bun.sleep(50);

  expect(session.tabPending()).toBe(true);

  session.resize({ columns: 90, rows: 20 });

  expect(await released.promise).toBe(ModeFlag.bracketedPaste);
  expect(session.tabPending()).toBe(false);
});

it('waits for the rows of the pane shown after focus moves away from the awaited pane', async () => {
  const server = await listen((message) => {
    if (message.type !== 'resize') {
      return switchedReplies(message);
    }

    return [
      {
        type: 'change',
        revision: 3,
        change: { type: 'tabFocused', workspaceId: workspace.id, tabId: tabId(1) },
      },
      encodeFrame(
        FrameKind.rowUpdate,
        encodeRowUpdate(rowUpdate({ pane: 7, sequence: 2, modes: ModeFlag.bracketedPaste })),
      ),
    ];
  });

  const session = await attach(server);
  const released = Promise.withResolvers<number | undefined>();

  session.focusTab({ kind: 'next' });

  session.afterTabAnswer(() => {
    released.resolve(session.rowCache(paneId(7))?.modes());
  });

  await untilState(session, () => session.getState().snapshot.revision === 2);
  await waitFor(() => server.received.some((message) => message.type === 'tabFocus'));
  await Bun.sleep(50);

  expect(session.tabPending()).toBe(true);

  session.resize({ columns: 90, rows: 20 });

  expect(await released.promise).toBe(ModeFlag.bracketedPaste);
  expect(session.tabPending()).toBe(false);
});

it('releases held input at once when the tab request fails', async () => {
  const server = await listen((message) =>
    message.type === 'tabFocus'
      ? [{ type: 'tabFailed', reason: 'unknownTab', message: undefined }]
      : switchedReplies(message),
  );

  const session = await attach(server);
  const released = Promise.withResolvers<undefined>();

  session.focusTab({ kind: 'next' });

  session.afterTabAnswer(() => {
    released.resolve(undefined);
  });

  await released.promise;
  expect(session.tabPending()).toBe(false);
});

it('does not hold input after a switch to a tab whose pane failed', async () => {
  const server = await listen((message) => {
    if (message.type !== 'hello') {
      return switchedReplies(message);
    }

    const snapshot = twoTabSnapshot();

    if (snapshot.type !== 'snapshot') {
      return [];
    }

    const panes = snapshot.snapshot.panes.map((each) =>
      each.id === paneId(8)
        ? { ...each, lifecycle: 'failed' as const, error: 'Cannot start' }
        : each,
    );

    return [{ type: 'welcome' }, { ...snapshot, snapshot: { ...snapshot.snapshot, panes } }];
  });

  const session = await attach(server);
  const released = Promise.withResolvers<undefined>();

  session.focusTab({ kind: 'next' });

  session.afterTabAnswer(() => {
    released.resolve(undefined);
  });

  await released.promise;
  expect(session.tabPending()).toBe(false);
});

it('releases held input when the awaited pane becomes failed', async () => {
  const server = await listen((message) => {
    if (message.type !== 'resize') {
      return switchedReplies(message);
    }

    return [
      {
        type: 'change',
        revision: 3,
        change: {
          type: 'paneStateChanged',
          paneId: paneId(8),
          lifecycle: 'failed',
          exitCode: undefined,
          error: 'Cannot start',
        },
      },
    ];
  });

  const session = await attach(server);
  const released = Promise.withResolvers<undefined>();

  session.focusTab({ kind: 'next' });

  session.afterTabAnswer(() => {
    released.resolve(undefined);
  });

  await untilState(session, () => session.getState().snapshot.revision === 2);
  await waitFor(() => server.received.some((message) => message.type === 'tabFocus'));
  await Bun.sleep(50);

  expect(session.tabPending()).toBe(true);

  session.resize({ columns: 90, rows: 20 });

  await released.promise;
  expect(session.tabPending()).toBe(false);
});

it('hands notices that arrived before any listener to the first listener in order', async () => {
  const server = await listen(
    welcomeWith(
      { type: 'bell', count: 2 },
      { type: 'clipboardWrite', text: 'copied' },
      snapshotMessage(1),
    ),
  );

  const session = await attach(server);
  const first: unknown[] = [];
  const second: unknown[] = [];

  session.subscribeNotices((notice) => first.push(notice));
  session.subscribeNotices((notice) => second.push(notice));

  expect(first).toEqual([
    { kind: 'bell', count: 2 },
    { kind: 'clipboardWrite', text: 'copied' },
  ]);

  expect(second).toEqual([]);
});

it('announces a later notice once to every current listener', async () => {
  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }, snapshotMessage(1)];
    }

    return message.type === 'resize' ? [{ type: 'bell', count: 1 }] : [];
  });

  const session = await attach(server);
  const first: unknown[] = [];
  const second: unknown[] = [];
  const arrived = Promise.withResolvers<undefined>();

  session.subscribeNotices((notice) => first.push(notice));

  session.subscribeNotices((notice) => {
    second.push(notice);
    arrived.resolve(undefined);
  });

  session.resize(size);
  await arrived.promise;

  expect(first).toEqual([{ kind: 'bell', count: 1 }]);
  expect(second).toEqual([{ kind: 'bell', count: 1 }]);
});
