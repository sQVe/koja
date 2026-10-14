import { expect, onTestFinished } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { z } from 'zod';

import type { PaneId } from '../src/ids.ts';
import { createFrameDecoder, encodeFrame, FrameKind } from '../src/protocol/frames.ts';
import { encodeControl, parseControl } from '../src/protocol/messages.ts';
import type { BuildVersion, ControlMessage } from '../src/protocol/messages.ts';
import {
  cellWords,
  rowHeaderWords,
  rowWords,
  decodePaneRows,
  decodeRowUpdate,
  encodePaneInput,
  rowsToLines,
} from '../src/rows/rows.ts';
import type { PaneRows, RowUpdate } from '../src/rows/rows.ts';
import { createLog } from '../src/server/log.ts';
import type { Log } from '../src/server/log.ts';
import { runServer } from '../src/server/server.ts';
import type { Server } from '../src/server/server.ts';

export interface TestClient {
  messages: ControlMessage[];
  updates: RowUpdate[];
  paneRows: PaneRows[];
  nextPaneRows: () => Promise<PaneRows>;
  nextUpdate: () => Promise<RowUpdate>;
  closed: Promise<void>;
  close: () => void;
  send: (message: ControlMessage) => void;
  sendTogether: (messages: ControlMessage[]) => void;
  sendInput: (pane: number, bytes: Uint8Array) => void;
  sendRaw: (kind: FrameKind, payload: Uint8Array) => void;
  nextMessage: () => Promise<ControlMessage>;
}

export const logLineSchema = z.object({
  level: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.unknown()),
});

let nextReadRequestId = 1;

export const readRecent = (target: PaneId): ControlMessage => {
  nextReadRequestId += 1;

  return {
    type: 'paneRead',
    paneId: target,
    requestId: nextReadRequestId,
    selection: { source: 'recent', lines: undefined },
  };
};

export const linesOf = (rows: PaneRows): string[] => rowsToLines(rows, rows.columns, false);

export const build: BuildVersion = { version: '1.2.3', ghostty: 'abc123' };

export const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'phi-server-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
};

export const waitFor = async (condition: () => boolean, timeoutMs = 5000): Promise<void> => {
  const deadline = performance.now() + timeoutMs;

  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error('The condition did not hold in time.');
    }

    await Bun.sleep(10);
  }
};

const commandLineOf = (processId: string): string | undefined => {
  try {
    return readFileSync(join('/proc', processId, 'cmdline'), 'utf8')
      .replaceAll('\0', ' ')
      .trim();
  } catch {
    return undefined;
  }
};

export const processesRunning = (commandLine: string): string[] =>
  readdirSync('/proc').filter((name) => commandLineOf(name) === commandLine);

// True until the process is reaped, so an exited process that nobody has waited for still counts.
export const processExists = (processId: number): boolean => {
  try {
    process.kill(processId, 0);

    return true;
  } catch {
    return false;
  }
};

export const openLog = (path: string): Log => {
  const created = createLog(path, Date.now);

  if (!created.ok) {
    throw new Error(created.message);
  }

  return created.log;
};

export const startEmptyServer = async (
  directory: string,
  shell = '/bin/sh',
  path = process.env.PATH,
  scrollbackBytes?: number,
): Promise<{ server: Server; socketPath: string; logPath: string }> => {
  const socketPath = join(directory, 'run', 'phi.sock');
  const logPath = join(directory, 'state', 'phi', 'server.log');
  const log = openLog(logPath);

  const result = await runServer({
    socketPath,
    version: build,
    log,
    environment: { ...process.env, PATH: path, SHELL: shell },
    holdLimitMs: 60_000,
    ...(scrollbackBytes === undefined ? {} : { scrollbackBytes }),
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const { server } = result;

  // The server logs while it stops, so the directory goes after it.
  onTestFinished(async () => {
    server.stop();
    await server.stopped;
    await rm(directory, { recursive: true, force: true });
  });

  return { server, socketPath, logPath };
};

const createReader = <Item>(
  items: Item[],
  waiting: (() => void)[],
  isClosed: () => boolean,
): (() => Promise<Item>) => {
  let read = 0;

  return async () => {
    while (items.length <= read) {
      if (isClosed()) {
        throw new Error('The connection closed before an item arrived.');
      }

      const { promise, resolve } = Promise.withResolvers<undefined>();

      waiting.push(() => {
        resolve(undefined);
      });

      await promise;
    }

    const item = items[read];

    read += 1;

    if (item === undefined) {
      throw new Error('No item arrived.');
    }

    return item;
  };
};

export const connect = async (socketPath: string): Promise<TestClient> => {
  const decoder = createFrameDecoder();
  const messages: ControlMessage[] = [];
  const updates: RowUpdate[] = [];
  const paneRows: PaneRows[] = [];
  const waiting: (() => void)[] = [];
  const { promise: closed, resolve: markClosed } = Promise.withResolvers<undefined>();
  let isClosed = false;

  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data: (_socket, bytes) => {
        const decoded = decoder.push(bytes);

        if (!decoded.ok) {
          throw new Error(decoded.reason);
        }

        for (const frame of decoded.frames) {
          if (frame.kind === FrameKind.rowUpdate) {
            const parsed = decodeRowUpdate(frame.payload);

            if (!parsed.ok) {
              throw new Error(parsed.reason);
            }

            updates.push(parsed.update);

            continue;
          }

          if (frame.kind === FrameKind.paneRows) {
            const decodedRows = decodePaneRows(frame.payload);

            if (!decodedRows.ok) {
              throw new Error(decodedRows.reason);
            }

            paneRows.push(decodedRows.rows);

            continue;
          }

          const parsed = parseControl(frame.payload);

          if (!parsed.ok) {
            throw new Error(parsed.reason);
          }

          messages.push(parsed.message);
        }

        for (const wake of waiting.splice(0)) {
          wake();
        }
      },
      close: () => {
        isClosed = true;
        markClosed(undefined);

        for (const wake of waiting.splice(0)) {
          wake();
        }
      },
    },
  });

  onTestFinished(() => {
    socket.end();
  });

  const nextMessage = createReader(messages, waiting, () => isClosed);
  const nextUpdate = createReader(updates, waiting, () => isClosed);
  const nextPaneRows = createReader(paneRows, waiting, () => isClosed);

  const send = (message: ControlMessage): void => {
    socket.write(encodeFrame(FrameKind.control, encodeControl(message)));
  };

  const sendTogether = (batch: ControlMessage[]): void => {
    const frames = batch.map((message) => encodeFrame(FrameKind.control, encodeControl(message)));

    socket.write(Buffer.concat(frames));
  };

  const sendInput = (pane: number, bytes: Uint8Array): void => {
    socket.write(encodeFrame(FrameKind.input, encodePaneInput({ pane, bytes })));
  };

  const sendRaw = (kind: FrameKind, payload: Uint8Array): void => {
    socket.write(encodeFrame(kind, payload));
  };

  return {
    messages,
    updates,
    paneRows,
    nextPaneRows,
    nextUpdate,
    closed,
    close: () => {
      socket.end();
    },
    send,
    sendTogether,
    sendInput,
    sendRaw,
    nextMessage,
  };
};

// Sends workspaceCreate from a CLI connection, waits for the answer, and closes the connection.
export const createWorkspace = async (
  socketPath: string,
  root: string,
  label: string,
): Promise<ControlMessage> => {
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  client.send({ type: 'workspaceCreate', root, label, background: false });

  for (;;) {
    const message = await client.nextMessage();

    if (message.type === 'workspaceDone' || message.type === 'workspaceFailed') {
      client.close();

      return message;
    }
  }
};

// Starts a server and one workspace rooted at the directory.
export const startServer = async (
  directory: string,
  shell = '/bin/sh',
  path = process.env.PATH,
  scrollbackBytes?: number,
): Promise<{ server: Server; socketPath: string; logPath: string }> => {
  const started = await startEmptyServer(directory, shell, path, scrollbackBytes);

  await createWorkspace(started.socketPath, directory, basename(directory));

  return started;
};

export const applyRows = (rows: Map<number, string>, update: RowUpdate): void => {
  const stride = rowWords(update.size.columns);

  for (let start = 0; start < update.cells.length; start += stride) {
    const points: number[] = [];

    for (let column = 0; column < update.size.columns; column += 1) {
      points.push(update.cells[start + rowHeaderWords + column * cellWords] ?? 0);
    }

    const offset = (update.cells[start] ?? 0) | 0;

    const text = String.fromCodePoint(...points)
      .replaceAll('\0', ' ')
      .trimEnd();

    rows.set(update.activeTop + offset, text);
  }
};

export const receiveText = async (
  client: TestClient,
  rows: Map<number, string>,
  text: string,
): Promise<void> => {
  while (![...rows.values()].some((row) => row.includes(text))) {
    const update = await client.nextUpdate();

    applyRows(rows, update);
  }
};

export const nextPaneResize = async (
  client: TestClient,
): Promise<
  Extract<Extract<ControlMessage, { type: 'change' }>['change'], { type: 'paneResized' }>
> => {
  for (;;) {
    const message = await client.nextMessage();

    if (message.type === 'change' && message.change.type === 'paneResized') {
      return message.change;
    }
  }
};

export const attachTerminal = async (socketPath: string, columns: number): Promise<TestClient> => {
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: { columns, rows: 30 } });
  await nextPaneResize(client);

  return client;
};

export const connectCli = async (socketPath: string): Promise<TestClient> => {
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
  await client.nextMessage();

  return client;
};

export const nextOfType = async <Type extends ControlMessage['type']>(
  client: TestClient,
  type: Type,
): Promise<Extract<ControlMessage, { type: Type }>> => {
  for (;;) {
    const message = await client.nextMessage();

    if (message.type === type) {
      return message as Extract<ControlMessage, { type: Type }>;
    }
  }
};

export const logLinesOf = (logPath: string): z.output<typeof logLineSchema>[] => {
  if (!existsSync(logPath)) {
    return [];
  }

  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => logLineSchema.parse(JSON.parse(line)));
};

export const sizedHello: ControlMessage = {
  type: 'hello',
  version: build,
  size: { columns: 100, rows: 30 },
};
