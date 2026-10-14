import { expect, it, jest, onTestFinished, spyOn } from 'bun:test';
import { once } from 'node:events';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rename, rm, symlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { z } from 'zod';

import { paneId, tabId, workspaceId } from '../src/ids.ts';
import type { PaneId } from '../src/ids.ts';
import { sideListColumns } from '../src/layout.ts';
import {
  createFrameDecoder,
  encodeFrame,
  FrameKind,
  maxFramePayloadBytes,
} from '../src/protocol/frames.ts';
import { encodeControl, parseControl } from '../src/protocol/messages.ts';
import type { BuildVersion, ControlMessage } from '../src/protocol/messages.ts';
import {
  cellWords,
  rowHeaderWords,
  rowWords,
  decodePaneRows,
  decodeRowUpdate,
  encodePaneInput,
  encodePaneRows,
  PaneRowsSource,
  rowsToLines,
} from '../src/rows/rows.ts';
import type { PaneRows, RowUpdate } from '../src/rows/rows.ts';
import { createLog } from '../src/server/log.ts';
import type { Log } from '../src/server/log.ts';
import { spawnPane } from '../src/server/pane.ts';
import { maxReplyBytes, maxSnapshotBytes } from '../src/server/paneRows.ts';
import * as processGroups from '../src/server/processGroups.ts';
import * as scope from '../src/server/scope.ts';
import { runServer } from '../src/server/server.ts';
import type { Server } from '../src/server/server.ts';
import { claimSocketPath } from '../src/server/socketPath.ts';
import { Terminal } from '../src/vt/vt.ts';
import type { ReadRowsResult } from '../src/vt/vt.ts';

interface TestClient {
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

const logLineSchema = z.object({
  level: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.unknown()),
});

// The server's limit on bytes a client has not read.
const unreadQueueLimitBytes = 0x10_00_00;

let nextReadRequestId = 1;

const readRecent = (target: PaneId): ControlMessage => {
  nextReadRequestId += 1;

  return {
    type: 'paneRead',
    paneId: target,
    requestId: nextReadRequestId,
    selection: { source: 'recent', lines: undefined },
  };
};

const linesOf = (rows: PaneRows): string[] => rowsToLines(rows, rows.columns, false);

const build: BuildVersion = { version: '1.2.3', ghostty: 'abc123' };

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'phi-server-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
};

const waitFor = async (condition: () => boolean, timeoutMs = 5000): Promise<void> => {
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

const processesRunning = (commandLine: string): string[] =>
  readdirSync('/proc').filter((name) => commandLineOf(name) === commandLine);

// True until the process is reaped, so an exited process that nobody has waited for still counts.
const processExists = (processId: number): boolean => {
  try {
    process.kill(processId, 0);

    return true;
  } catch {
    return false;
  }
};

const isRoot = process.getuid?.() === 0;

const openLog = (path: string): Log => {
  const created = createLog(path, Date.now);

  if (!created.ok) {
    throw new Error(created.message);
  }

  return created.log;
};

const startEmptyServer = async (
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

const connect = async (socketPath: string): Promise<TestClient> => {
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
const createWorkspace = async (
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
const startServer = async (
  directory: string,
  shell = '/bin/sh',
  path = process.env.PATH,
  scrollbackBytes?: number,
): Promise<{ server: Server; socketPath: string; logPath: string }> => {
  const started = await startEmptyServer(directory, shell, path, scrollbackBytes);

  await createWorkspace(started.socketPath, directory, basename(directory));

  return started;
};

const serverModule = join(import.meta.dir, '..', 'src', 'server', 'server.ts');

const logModule = join(import.meta.dir, '..', 'src', 'server', 'log.ts');

// Runs a server in its own process, so the test can signal it. Lines on stdin go to the pane.
const serverScript = (socketPath: string): string => `
  import { createLog, logPathFor } from ${JSON.stringify(logModule)};
  import { runServer } from ${JSON.stringify(serverModule)};

  const created = createLog(logPathFor(process.env.XDG_STATE_HOME, '/nonexistent'), Date.now);

  if (!created.ok) {
    console.error(created.message);
    process.exit(1);
  }

  const result = await runServer({
    socketPath: ${JSON.stringify(socketPath)},
    version: ${JSON.stringify(build)},
    log: created.log,
    environment: { ...process.env, SHELL: '/bin/sh' },
  });

  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }

  process.stdin.on('data', (bytes) => result.server.writeToPane(bytes.toString()));
  console.log('listening');
  await result.server.stopped;
  process.exit(0);
`;

const readUntil = async (stream: ReadableStream<Uint8Array>, text: string): Promise<void> => {
  const decoder = new TextDecoder();
  let read = '';

  for await (const chunk of stream) {
    read += decoder.decode(chunk);

    if (read.includes(text)) {
      return;
    }
  }

  throw new Error(`The output ended before ${text}: ${read}`);
};

const startServerProcess = async (directory: string) => {
  const socketPath = join(directory, 'run', 'phi.sock');

  const child = Bun.spawn([process.execPath, '--eval', serverScript(socketPath)], {
    cwd: directory,
    env: { ...process.env, XDG_STATE_HOME: join(directory, 'state') },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'inherit',
  });

  onTestFinished(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }

    await child.exited;
  });

  await readUntil(child.stdout, 'listening');

  return { child, socketPath };
};

it.each(['paneRead', 'paneSend'] as const)(
  'refuses %s for a pane other than the live pane without changing it',
  async (type) => {
    const directory = await temporaryDirectory();
    const { server, socketPath } = await startServer(directory);

    server.writeToPane("printf 'ready-marker\\n'\n");
    await waitFor(() => server.paneText()?.includes('ready-marker') === true);

    const client = await connect(socketPath);

    client.send({ type: 'hello', version: build, size: undefined });
    expect(await client.nextMessage()).toEqual({ type: 'welcome' });
    await client.nextMessage();

    const before = server.snapshot();
    const missing = paneId(99);

    const message: ControlMessage =
      type === 'paneRead'
        ? readRecent(missing)
        : { type, paneId: missing, text: 'must-not-reach-live-pane' };

    client.send(message);

    expect(await client.nextMessage()).toEqual({ type: 'paneMissing', paneId: missing });
    expect(server.snapshot()).toEqual(before);

    client.send(readRecent(paneId(1)));

    const read = linesOf(await client.nextPaneRows()).join('\n');

    expect(read).toContain('ready-marker');
    expect(read).not.toContain('must-not-reach-live-pane');
  },
);

it('answers paneRead during a synchronized-output hold only after the hold ends', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
  await client.nextMessage();

  server.writeToPane('printf \'\\033[?2026hhalf-\'"drawn"\n');
  await waitFor(() => server.paneText()?.includes('half-drawn') === true);

  // The server handles frames in order, so this answer shows it took the read before it.
  client.sendTogether([readRecent(paneId(1)), { type: 'paneSend', paneId: paneId(1), text: '' }]);

  expect(await client.nextMessage()).toEqual({ type: 'paneSent', paneId: paneId(1) });
  expect(client.paneRows).toHaveLength(0);

  server.writeToPane("printf '\\033[2J\\033[Hfull-'\"drawn\"'\\033[?2026l'\n");

  const text = linesOf(await client.nextPaneRows()).join('\n');

  expect(text).toContain('full-drawn');
  expect(text).not.toContain('half-drawn');
});

it('leaves the snapshot of a newer read alone when an older held read resumes after it', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);

  await mkdir(join(directory, 'second'));
  await createWorkspace(socketPath, join(directory, 'second'), 'second');

  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });

  const typeInto = (pane: number, text: string) => {
    client.send({ type: 'paneSend', paneId: paneId(pane), text });
  };

  const ready = join(directory, 'second', 'ready');

  typeInto(2, `seq 1 1200 | sed 's/^/n/'; touch ${ready}\n`);
  await waitFor(() => existsSync(ready));

  const held = join(directory, 'held');

  typeInto(1, `printf '\\033[?2026hhalf'; touch ${held}\n`);
  await waitFor(() => existsSync(held));

  const rangeA = { source: 'range', from: 0, to: 0, epoch: undefined, screen: undefined } as const;
  const rangeB = { ...rangeA, to: 999 };

  // The server handles frames in order, so paneSent shows it took read A and held it.
  client.sendTogether([
    { type: 'paneRead', paneId: paneId(1), requestId: 1, selection: rangeA },
    { type: 'paneSend', paneId: paneId(1), text: '' },
  ]);

  await waitFor(() => client.messages.some((message) => message.type === 'paneSent'));
  expect(client.paneRows).toHaveLength(0);

  client.send({ type: 'paneRead', paneId: paneId(2), requestId: 2, selection: rangeB });
  await waitFor(() => client.paneRows.some((rows) => rows.requestId === 2));

  const first = client.paneRows.find((rows) => rows.requestId === 2);

  expect(first?.remaining).toBeGreaterThan(0);

  typeInto(1, "printf '\\033[?2026lfull'\n");
  await waitFor(() => client.messages.some((message) => message.type === 'paneReadFailed'));

  expect(client.messages.find((message) => message.type === 'paneReadFailed')).toEqual({
    type: 'paneReadFailed',
    paneId: paneId(1),
    requestId: 1,
    failure: { reason: 'noSnapshot' },
  });

  const parts = client.paneRows.filter((rows) => rows.requestId === 2);

  while ((parts.at(-1)?.remaining ?? 0) > 0) {
    client.send({ type: 'paneReadNext', paneId: paneId(2), requestId: 2 });

    await waitFor(
      () => client.paneRows.filter((rows) => rows.requestId === 2).length > parts.length,
    );

    parts.push(...client.paneRows.filter((rows) => rows.requestId === 2).slice(parts.length));
  }

  expect(parts.reduce((total, part) => total + part.rowCount, 0)).toBe(1000);

  // The typed command and its echo take the first rows; how many depends on the shell.
  const lines = parts.flatMap((part) => linesOf(part));
  const numbered = lines.slice(lines.findIndex((line) => /^n\d+$/.test(line)));
  const firstNumber = Number(numbered[0]?.slice(1));

  expect(numbered).toEqual(
    Array.from({ length: numbered.length }, (_, index) => `n${firstNumber + index}`),
  );

  expect(numbered.length).toBeGreaterThan(900);

  expect(client.messages.filter((message) => message.type === 'paneReadFailed')).toHaveLength(1);
});

it('answers a paneRead held by synchronized output with paneMissing when its workspace closes', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
  await client.nextMessage();

  server.writeToPane('printf \'\\033[?2026hhalf-\'"drawn"\n');
  await waitFor(() => server.paneText()?.includes('half-drawn') === true);

  client.sendTogether([readRecent(paneId(1)), { type: 'paneSend', paneId: paneId(1), text: '' }]);

  expect(await client.nextMessage()).toEqual({ type: 'paneSent', paneId: paneId(1) });

  client.send({ type: 'workspaceClose', workspaceId: workspaceId(1) });

  await waitFor(() => client.messages.some((message) => message.type === 'paneMissing'), 1000);
  expect(client.paneRows).toHaveLength(0);
});

it.each(['paneSend', 'stop'] as const)(
  'answers paneRead with rows before a %s in the same write',
  async (type) => {
    const directory = await temporaryDirectory();
    const { server, socketPath } = await startServer(directory);
    const client = await connect(socketPath);

    client.send({ type: 'hello', version: build, size: undefined });
    expect(await client.nextMessage()).toEqual({ type: 'welcome' });
    await client.nextMessage();

    server.writeToPane("printf 'ready-marker\\n'\n");
    await waitFor(() => server.paneText()?.includes('ready-marker') === true);

    const next: ControlMessage =
      type === 'paneSend' ? { type, paneId: paneId(1), text: '' } : { type };

    client.sendTogether([readRecent(paneId(1)), next]);

    const read = await client.nextPaneRows();

    expect(linesOf(read).join('\n')).toContain('ready-marker');

    if (type === 'paneSend') {
      expect(await client.nextMessage()).toEqual({ type: 'paneSent', paneId: paneId(1) });
    }
  },
);

// A shell that prints a1 to the last count on an empty screen, the last without a newline, then
// waits.
const startCountingServer = async (count = 500, scrollbackBytes?: number) => {
  const directory = await temporaryDirectory();
  const shell = join(directory, 'count.sh');

  await Bun.write(
    shell,
    `#!/bin/sh\ni=1\nwhile [ $i -lt ${count} ]; do echo a$i; i=$((i + 1)); done\nprintf a${count}\nexec sleep 600\n`,
  );

  await chmod(shell, 0o755);

  const { server, socketPath } = await startServer(
    directory,
    shell,
    process.env.PATH,
    scrollbackBytes,
  );

  await waitFor(() => server.paneText()?.includes(`a${count}`) === true);

  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
  await client.nextMessage();

  return client;
};

const readRange = async (client: TestClient, from: number, to: number) => {
  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 77,
    selection: { source: 'range', from, to, epoch: undefined, screen: undefined },
  });

  return client.nextPaneRows();
};

it('reads rows 0 to 9 of a pane as a1 to a10 and the last five printed lines as recent', async () => {
  const client = await startCountingServer();
  const range = await readRange(client, 0, 9);

  expect(linesOf(range)).toEqual(Array.from({ length: 10 }, (_, index) => `a${index + 1}`));
  expect(range).toMatchObject({ pane: 1, requestId: 77, first: 0, oldest: 0 });

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 78,
    selection: { source: 'recent', lines: 5 },
  });

  const recent = await client.nextPaneRows();

  expect(recent.requestId).toBe(78);
  expect(linesOf(recent)).toEqual(['a496', 'a497', 'a498', 'a499', 'a500']);
});

it('answers a soft-wrapped line as several rows, or as one line for the reader that joins them', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: { columns: 20, rows: 10 } });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
  await client.nextMessage();

  server.writeToPane("printf '\\033[H\\033[2J%s' wrap-0123456789-wrap-0123456789-wrap-end\n");
  await waitFor(() => server.paneText()?.includes('wrap-end') === true);

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 1,
    selection: { source: 'recentUnwrapped', lines: 10 },
  });

  const rows = await client.nextPaneRows();
  const lines = linesOf(rows);

  expect(rows.source).toBe(PaneRowsSource.recentUnwrapped);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join('')).toContain('wrap-0123456789-wrap-0123456789-wrap-end');

  expect(
    rowsToLines(rows, rows.columns, true).some((line) =>
      line.startsWith('wrap-0123456789-wrap-0123456789-wrap-end'),
    ),
  ).toBe(true);
});

const askNext = (client: TestClient, requestId: number) => {
  client.send({ type: 'paneReadNext', paneId: paneId(1), requestId });
};

it('sends a range larger than one reply in parts of whole rows, each asked for by the client', async () => {
  const client = await startCountingServer(1200);

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 5,
    selection: { source: 'range', from: 0, to: 1000, epoch: undefined, screen: undefined },
  });

  const parts = [await client.nextPaneRows()];

  while ((parts.at(-1)?.remaining ?? 0) > 0) {
    askNext(client, 5);
    parts.push(await client.nextPaneRows());
  }

  expect(parts.length).toBeGreaterThan(1);

  for (const part of parts) {
    expect(encodePaneRows(part).length).toBeLessThanOrEqual(maxReplyBytes);
    expect(part.requestId).toBe(5);
  }

  const lines = parts.flatMap((part) => linesOf(part));

  expect(lines).toEqual(Array.from({ length: 1001 }, (_, index) => `a${index + 1}`));

  expect(parts.map((part) => part.first)).toEqual(
    parts.map((_, index) => parts.slice(0, index).reduce((sum, part) => sum + part.rowCount, 0)),
  );

  askNext(client, 5);

  expect(await client.nextMessage()).toEqual({
    type: 'paneReadFailed',
    paneId: paneId(1),
    requestId: 5,
    failure: { reason: 'noSnapshot' },
  });
});

it('drops a snapshot when a new read arrives, and answers a part of an unknown request with noSnapshot', async () => {
  const client = await startCountingServer(1200);

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 5,
    selection: { source: 'range', from: 0, to: 1000, epoch: undefined, screen: undefined },
  });

  expect((await client.nextPaneRows()).remaining).toBeGreaterThan(0);

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 6,
    selection: { source: 'recent', lines: 3 },
  });

  await client.nextPaneRows();

  askNext(client, 5);

  expect(await client.nextMessage()).toMatchObject({
    type: 'paneReadFailed',
    requestId: 5,
    failure: { reason: 'noSnapshot' },
  });

  askNext(client, 99);

  expect(await client.nextMessage()).toMatchObject({
    type: 'paneReadFailed',
    requestId: 99,
    failure: { reason: 'noSnapshot' },
  });
});

it('refuses a range below the oldest kept row with that row number', async () => {
  const client = await startCountingServer(20_000, 1);

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 8,
    selection: { source: 'range', from: 0, to: 9, epoch: undefined, screen: undefined },
  });

  const failed = await client.nextMessage();

  if (failed.type !== 'paneReadFailed' || failed.failure.reason !== 'pruned') {
    throw new Error('Expected a pruned failure.');
  }

  const { oldest } = failed.failure;

  expect(oldest).toBeGreaterThan(0);

  const kept = await readRange(client, oldest, oldest);

  expect(kept).toMatchObject({ oldest, first: oldest, rowCount: 1 });
});

it('refuses a wide range over the snapshot budget with a typed failure and sends only replies that fit', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: { columns: 1100, rows: 24 } });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
  await client.nextMessage();

  server.writeToPane('seq 1 1200; echo wide-$((6 * 7))\n');
  await waitFor(() => server.paneText()?.includes('wide-42') === true);

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 8,
    selection: { source: 'recent', lines: 1 },
  });

  const { oldest } = await client.nextPaneRows();

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 9,
    selection: {
      source: 'range',
      from: oldest,
      to: oldest + 999,
      epoch: undefined,
      screen: undefined,
    },
  });

  await waitFor(() => client.messages.some((message) => message.type === 'paneReadFailed'));

  expect(client.messages.find((message) => message.type === 'paneReadFailed')).toEqual({
    type: 'paneReadFailed',
    paneId: paneId(1),
    requestId: 9,
    failure: {
      reason: 'tooManyBytes',
      limitBytes: maxSnapshotBytes,
      epoch: expect.any(Number) as number,
      screen: 0,
      first: oldest,
      count: 1000,
    },
  });

  const rows = await readRange(client, oldest, oldest + 19);
  const bytes = encodePaneRows(rows).length;

  expect(bytes).toBeLessThanOrEqual(maxReplyBytes);
  expect(maxReplyBytes).toBeLessThan(unreadQueueLimitBytes);
  expect(maxReplyBytes).toBeLessThan(maxFramePayloadBytes);
});

it('refuses a range in another epoch with the current epoch', async () => {
  const client = await startCountingServer();

  client.send({
    type: 'paneRead',
    paneId: paneId(1),
    requestId: 6,
    selection: { source: 'range', from: 0, to: 1, epoch: 4242, screen: undefined },
  });

  const failed = await client.nextMessage();

  expect(failed).toMatchObject({
    type: 'paneReadFailed',
    requestId: 6,
    failure: { reason: 'staleEpoch' },
  });

  expect(client.paneRows).toHaveLength(0);
});

it('removes the socket it bound even when its symlink route changes', async () => {
  const directory = await temporaryDirectory();
  const real = join(directory, 'real');
  const link = join(directory, 'link');
  await mkdir(real, { mode: 0o700 });
  await mkdir(join(directory, 'other'), { mode: 0o700 });
  await symlink(real, link);

  const result = await runServer({
    socketPath: join(link, 'phi', 'phi.sock'),
    version: build,
    log: openLog(join(directory, 'state', 'phi', 'server.log')),
    environment: { ...process.env, SHELL: '/bin/sh' },
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  await symlink(join(directory, 'other'), join(directory, 'next'));
  await rename(join(directory, 'next'), link);
  result.server.stop();
  await result.server.stopped;

  expect(existsSync(join(real, 'phi', 'phi.sock'))).toBe(false);
});

it('creates the socket for its owner only, whatever the umask', async () => {
  const directory = await temporaryDirectory();
  const previous = process.umask(0);

  onTestFinished(() => {
    process.umask(previous);
  });

  const { socketPath } = await startServer(directory);

  process.umask(previous);

  expect(statSync(socketPath).mode & 0o777).toBe(0o600);
});

it('welcomes a client from the same build and removes the socket when it stops', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'welcome' });

  server.stop();

  expect(await server.stopped).toEqual({ ok: true });
  expect(existsSync(socketPath)).toBe(false);
});

it('sends a snapshot after welcome and each later change in revision order', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'welcome' });

  const initial = await client.nextMessage();

  expect(initial.type).toBe('snapshot');

  if (initial.type !== 'snapshot') {
    throw new Error('Expected a snapshot.');
  }

  expect(initial.snapshot.panes[0]?.id).toBe(paneId(1));

  server.writeToPane('exit\n');
  await waitFor(() => client.messages.length >= 5);

  expect(client.messages.slice(2)).toEqual([
    {
      type: 'change',
      revision: initial.snapshot.revision + 1,
      change: { type: 'paneRemoved', paneId: paneId(1) },
    },
    {
      type: 'change',
      revision: initial.snapshot.revision + 2,
      change: { type: 'tabRemoved', tabId: tabId(1) },
    },
    {
      type: 'change',
      revision: initial.snapshot.revision + 3,
      change: {
        type: 'workspaceRemoved',
        workspaceId: workspaceId(1),
        focusedWorkspaceId: undefined,
      },
    },
  ]);

  server.stop();
  await server.stopped;
});

it('resyncs after dropping a change inside a multi-change transition', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  server.writeToPane("trap '' HUP; echo ready-$((6 * 7))\n");
  await waitFor(() => server.paneText()?.includes('ready-42') === true);
  client.send({ type: 'hello', version: build, size: undefined });
  await client.nextMessage();

  const initial = await client.nextMessage();

  if (initial.type !== 'snapshot') {
    throw new Error('Expected a snapshot.');
  }

  server.stop();

  const dropped = await client.nextMessage();
  const received = await client.nextMessage();

  expect(dropped).toMatchObject({ type: 'change', change: { type: 'paneStateChanged' } });

  if (received.type !== 'change') {
    throw new Error('Expected a change.');
  }

  const hasGap = received.revision > initial.snapshot.revision + 1;

  expect(hasGap).toBe(true);

  if (hasGap) {
    client.send({ type: 'resync' });
  }

  const recovered = await client.nextMessage();

  expect(recovered).toEqual({ type: 'snapshot', snapshot: server.snapshot() });

  expect(recovered).toMatchObject({
    snapshot: { revision: received.revision, panes: [{ lifecycle: 'closing' }] },
  });

  server.writeToPane('exit\n');
  await server.stopped;
});

it('broadcasts changes to every welcomed client but not a connection waiting for hello', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const first = await connect(socketPath);
  const second = await connect(socketPath);
  const waiting = await connect(socketPath);

  first.send({ type: 'hello', version: build, size: undefined });
  second.send({ type: 'hello', version: build, size: undefined });
  await first.nextMessage();
  await second.nextMessage();

  const initial = await first.nextMessage();

  expect(await second.nextMessage()).toEqual(initial);

  server.writeToPane('exit\n');
  await waitFor(() => first.messages.length >= 5 && second.messages.length >= 5);
  server.stop();
  await server.stopped;
  await Promise.all([first.closed, second.closed, waiting.closed]);

  expect(first.messages.slice(2, 5).map((message) => message.type)).toEqual([
    'change',
    'change',
    'change',
  ]);

  expect(second.messages).toEqual(first.messages);
  expect(waiting.messages).toEqual([]);
});

it('sends no snapshot or changes to a stop-only connection', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'stop' });
  await server.stopped;
  await client.closed;

  expect(client.messages).toEqual([]);
});

const applyRows = (rows: Map<number, string>, update: RowUpdate): void => {
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

const receiveText = async (
  client: TestClient,
  rows: Map<number, string>,
  text: string,
): Promise<void> => {
  while (![...rows.values()].some((row) => row.includes(text))) {
    const update = await client.nextUpdate();

    applyRows(rows, update);
  }
};

it('publishes ordered rows to terminal clients but not CLI clients', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await connect(socketPath);
  const cli = await connect(socketPath);

  terminal.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  cli.send({ type: 'hello', version: build, size: undefined });

  expect(await terminal.nextMessage()).toEqual({ type: 'welcome' });
  expect(await cli.nextMessage()).toEqual({ type: 'welcome' });
  expect(await terminal.nextMessage()).toMatchObject({ type: 'snapshot' });
  expect(await cli.nextMessage()).toMatchObject({ type: 'snapshot' });

  const first = await terminal.nextUpdate();
  const rows = new Map<number, string>();

  applyRows(rows, first);

  expect(first.pane).toBe(1);
  expect(first.size).toEqual({ columns: 100 - sideListColumns, rows: 29 });
  expect(first.rowCount).toBe(29);

  server.writeToPane('echo first-$((6 * 7))\n');
  await receiveText(terminal, rows, 'first-42');
  server.writeToPane('echo second-$((7 * 7))\n');
  await receiveText(terminal, rows, 'second-49');

  expect([...rows.values()].some((row) => row.includes('first-42'))).toBe(true);
  expect(terminal.updates.length).toBeGreaterThan(1);

  for (let index = 1; index < terminal.updates.length; index += 1) {
    expect(terminal.updates[index]?.sequence).toBeGreaterThan(
      terminal.updates[index - 1]?.sequence ?? 0,
    );
  }

  cli.send({ type: 'resync' });
  await cli.nextMessage();

  expect(cli.updates).toEqual([]);
});

const nextPaneResize = async (client: TestClient) => {
  for (;;) {
    const message = await client.nextMessage();

    if (message.type === 'change' && message.change.type === 'paneResized') {
      return message.change;
    }
  }
};

it('resizes the pane to the client size less the status bar when a sized hello arrives', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });

  const resized = await nextPaneResize(client);

  expect(resized.size).toEqual({ columns: 100 - sideListColumns, rows: 29 });
  expect(server.snapshot().panes[0]?.size).toEqual({ columns: 100 - sideListColumns, rows: 29 });

  const update = await client.nextUpdate();

  expect(update.size).toEqual({ columns: 100 - sideListColumns, rows: 29 });
});

it('keeps change revisions consecutive when a stalled terminal overflows its write queue', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const stalled = createConnection(socketPath);

  stalled.on('error', () => undefined);
  onTestFinished(() => stalled.destroy());
  await once(stalled, 'connect');
  stalled.pause();

  stalled.write(
    encodeFrame(
      FrameKind.control,
      encodeControl({
        type: 'hello',
        version: build,
        size: { columns: 80, rows: 1 },
      }),
    ),
  );

  await waitFor(() => server.snapshot().clients.length === 1);

  const observer = await connect(socketPath);

  observer.send({ type: 'hello', version: build, size: undefined });
  await observer.nextMessage();

  const initial = await observer.nextMessage();

  if (initial.type !== 'snapshot') {
    throw new Error('Expected the initial snapshot.');
  }

  const frames = Array.from({ length: 100 }, (_, index) =>
    encodeFrame(
      FrameKind.control,
      encodeControl({ type: 'resize', size: { columns: 80, rows: (index % 2) + 1 } }),
    ),
  );

  const batch = Buffer.concat(frames);
  let latest = initial.snapshot;

  for (let sent = 0; sent < 40_000 && latest.clients.length > 0; sent += frames.length) {
    stalled.write(batch);
    observer.send({ type: 'resync' });

    for (;;) {
      const message = await observer.nextMessage();

      if (message.type === 'snapshot') {
        latest = message.snapshot;

        break;
      }
    }
  }

  expect(latest.clients).toEqual([]);
  expect(latest.attachedClientId).toBeUndefined();

  const changes = observer.messages.flatMap((message) =>
    message.type === 'change' ? [message] : [],
  );

  const revisions = changes.map((message) => message.revision);
  const expected = revisions.map((_, index) => initial.snapshot.revision + index + 1);

  expect(revisions).toEqual(expected);
  expect(changes.at(-1)?.change).toMatchObject({ type: 'clientDetached', reason: 'requested' });
  expect(revisions.at(-1)).toBe(latest.revision);
});

it('removes a closed terminal client from subsequent snapshots', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const first = await connect(socketPath);

  first.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(first);
  first.close();
  await first.closed;

  const second = await connect(socketPath);

  second.send({ type: 'hello', version: build, size: undefined });
  expect(await second.nextMessage()).toEqual({ type: 'welcome' });

  expect(await second.nextMessage()).toMatchObject({
    type: 'snapshot',
    snapshot: { attachedClientId: undefined, clients: [] },
  });
});

it('attaches after a closed terminal without a takeover change', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const first = await connect(socketPath);

  first.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(first);
  first.close();
  await first.closed;

  const second = await connect(socketPath);

  second.send({ type: 'hello', version: build, size: { columns: 90, rows: 20 } });
  await nextPaneResize(second);

  const changes = second.messages.flatMap((message) =>
    message.type === 'change' ? [message.change] : [],
  );

  expect(changes.some((change) => change.type === 'clientAttached')).toBe(true);
  expect(changes.filter((change) => change.type === 'clientDetached')).toEqual([]);
});

const attachTerminal = async (socketPath: string, columns: number): Promise<TestClient> => {
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: { columns, rows: 30 } });
  await nextPaneResize(client);

  return client;
};

const connectCli = async (socketPath: string): Promise<TestClient> => {
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
  await client.nextMessage();

  return client;
};

const nextOfType = async <Type extends ControlMessage['type']>(
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

it('starts with no workspace and adds one focused workspace for each workspaceCreate', async () => {
  const directory = await temporaryDirectory();
  const first = join(directory, 'first');
  const second = join(directory, 'second');

  await mkdir(first);
  await mkdir(second);

  const { server, socketPath } = await startEmptyServer(directory);

  expect(server.snapshot()).toMatchObject({ workspaces: [], tabs: [], panes: [] });

  const answers = [
    await createWorkspace(socketPath, first, 'first'),
    await createWorkspace(socketPath, second, 'second'),
  ];

  const { workspaces, tabs, panes, defaultView } = server.snapshot();

  expect(answers).toEqual([
    { type: 'workspaceDone', workspaceId: workspaceId(1) },
    { type: 'workspaceDone', workspaceId: workspaceId(2) },
  ]);

  expect(workspaces.map(({ root, label }) => ({ root, label }))).toEqual([
    { root: first, label: 'first' },
    { root: second, label: 'second' },
  ]);

  expect(defaultView.focusedWorkspaceId).toBe(workspaceId(2));
  expect(tabs).toHaveLength(2);
  expect(panes.map((pane) => pane.lifecycle)).toEqual(['running', 'running']);
});

it('removes the workspace when its only shell exits and keeps serving', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  server.writeToPane('exit\n');
  await waitFor(() => server.snapshot().workspaces.length === 0);

  expect(server.snapshot()).toMatchObject({
    tabs: [],
    panes: [],
    defaultView: { focusedWorkspaceId: undefined },
  });

  const answer = await createWorkspace(socketPath, directory, 'again');

  expect(answer.type).toBe('workspaceDone');
  expect(server.snapshot().workspaces.map((workspace) => workspace.label)).toEqual(['again']);
  expect(server.snapshot().panes.map((pane) => pane.lifecycle)).toEqual(['running']);
});

it.each([
  { type: 'workspaceFocus', workspaceId: workspaceId(9) },
  { type: 'workspaceRename', workspaceId: workspaceId(9), label: 'renamed' },
  { type: 'workspaceClose', workspaceId: workspaceId(9) },
] as const)(
  'answers $type for an unknown workspace with a failure and changes nothing',
  async (request) => {
    const directory = await temporaryDirectory();
    const { server, socketPath } = await startServer(directory);
    const before = server.snapshot();
    const client = await connectCli(socketPath);

    client.send(request);

    expect(await nextOfType(client, 'workspaceFailed')).toEqual({
      type: 'workspaceFailed',
      reason: 'unknownWorkspace',
      message: undefined,
    });

    expect(server.snapshot()).toEqual(before);
  },
);

it('moves the view of a terminal client with its own focus and every view with a CLI focus', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  await createWorkspace(socketPath, directory, 'second');

  const terminal = await connect(socketPath);

  terminal.send({ type: 'hello', version: build, size: { columns: 80, rows: 24 } });
  await waitFor(() => server.snapshot().clients.length === 1);

  terminal.send({ type: 'workspaceFocus', workspaceId: workspaceId(1) });
  await nextOfType(terminal, 'workspaceDone');

  const own = server.snapshot();

  expect(own.clients[0]?.view.focusedWorkspaceId).toBe(workspaceId(1));
  expect(own.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(own.foregroundClientId).toBe(own.clients[0]?.id);

  const cli = await connectCli(socketPath);

  cli.send({ type: 'workspaceFocus', workspaceId: workspaceId(2) });
  await nextOfType(cli, 'workspaceDone');

  const shared = server.snapshot();

  expect(shared.clients[0]?.view.focusedWorkspaceId).toBe(workspaceId(2));
  expect(shared.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('focuses, renames, and closes a workspace and answers with its id', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  await createWorkspace(socketPath, directory, 'second');

  const client = await connectCli(socketPath);

  client.send({ type: 'workspaceFocus', workspaceId: workspaceId(1) });

  expect(await nextOfType(client, 'workspaceDone')).toEqual({
    type: 'workspaceDone',
    workspaceId: workspaceId(1),
  });

  expect(server.snapshot().defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  client.send({ type: 'workspaceRename', workspaceId: workspaceId(1), label: 'renamed' });
  await nextOfType(client, 'workspaceDone');
  expect(server.snapshot().workspaces[0]?.label).toBe('renamed');

  client.send({ type: 'workspaceClose', workspaceId: workspaceId(1) });
  await nextOfType(client, 'workspaceDone');
  await waitFor(() => server.snapshot().panes.length === 1);

  expect(server.snapshot().workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(2)]);
  expect(server.snapshot().defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('sends rows only for the focused workspace and the other screen after workspaceFocus', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  await createWorkspace(socketPath, directory, 'second');

  const cli = await connectCli(socketPath);

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'hidden-%s\\n' marker\n" });
  await nextOfType(cli, 'paneSent');

  const terminal = await attachTerminal(socketPath, 100);

  server.writeToPane("printf 'visible-%s\\n' marker\n");
  await waitFor(() => server.paneText()?.includes('visible-marker') === true);

  const rows = new Map<number, string>();

  await receiveText(terminal, rows, 'visible-marker');
  cli.send(readRecent(paneId(1)));

  const hidden = await cli.nextPaneRows();

  expect(linesOf(hidden).join('\n')).toContain('hidden-marker');
  expect(terminal.updates.every((update) => update.pane === 2)).toBe(true);

  const updatesBefore = terminal.updates.length;

  cli.send({ type: 'workspaceFocus', workspaceId: workspaceId(1) });
  await nextOfType(cli, 'workspaceDone');

  const shown = new Map<number, string>();

  for (;;) {
    const update = await terminal.nextUpdate();

    if (update.pane === 1) {
      applyRows(shown, update);

      if ([...shown.values()].some((row) => row.includes('hidden-marker'))) {
        break;
      }
    }
  }

  expect(terminal.updates.length).toBeGreaterThan(updatesBefore);
});

it('sends rows for every pane of the active tab after a split', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const cli = await connectCli(socketPath);
  const terminal = await attachTerminal(socketPath, 100);

  cli.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });

  expect(await nextOfType(cli, 'paneDone')).toEqual({ type: 'paneDone', paneId: paneId(2) });

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'left-%s\\n' marker\n" });
  cli.send({ type: 'paneSend', paneId: paneId(2), text: "printf 'right-%s\\n' marker\n" });

  const seen = new Set<number>();

  while (seen.size < 2) {
    seen.add((await terminal.nextUpdate()).pane);
  }

  expect(seen).toEqual(new Set([1, 2]));
});

const receiveShownText = async (
  client: TestClient,
  rows: Map<number, string>,
  text: string,
): Promise<void> => {
  while (![...rows.values()].some((row) => row.includes(text))) {
    const update = await client.nextUpdate();

    client.send({ type: 'ack', paneId: paneId(update.pane), sequence: update.sequence });

    if (update.pane === 1) {
      applyRows(rows, update);
    }
  }
};

it('sends no rows for a hidden pane while its tab is zoomed and its current screen after unzoom', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const cli = await connectCli(socketPath);
  const terminal = await attachTerminal(socketPath, 100);

  cli.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });
  await nextOfType(cli, 'paneDone');
  cli.send({ type: 'paneZoom', paneId: paneId(1) });
  await nextOfType(cli, 'paneDone');

  const visibleRows = new Map<number, string>();

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'shown-%s\\n' one\n" });
  await receiveShownText(terminal, visibleRows, 'shown-one');

  const updatesBefore = terminal.updates.length;

  cli.send({ type: 'paneSend', paneId: paneId(2), text: "printf 'hidden-%s\\n' marker\n" });

  for (;;) {
    cli.send(readRecent(paneId(2)));

    const read = await cli.nextPaneRows();

    if (linesOf(read).join('\n').includes('hidden-marker')) {
      break;
    }
  }

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'shown-%s\\n' two\n" });
  await receiveShownText(terminal, visibleRows, 'shown-two');

  const whileZoomed = terminal.updates.slice(updatesBefore).map((update) => update.pane);

  expect(whileZoomed.length).toBeGreaterThan(0);
  expect(whileZoomed.filter((pane) => pane !== 1)).toEqual([]);

  cli.send({ type: 'paneZoom', paneId: paneId(1) });
  await nextOfType(cli, 'paneDone');

  const hiddenRows = new Map<number, string>();

  while (![...hiddenRows.values()].some((row) => row.includes('hidden-marker'))) {
    const update = await terminal.nextUpdate();

    terminal.send({ type: 'ack', paneId: paneId(update.pane), sequence: update.sequence });

    if (update.pane === 2) {
      applyRows(hiddenRows, update);
    }
  }
});

it('tells the first terminal client it was taken over and closes it while the pane keeps running', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const first = await attachTerminal(socketPath, 100);
  const second = await attachTerminal(socketPath, 90);

  await nextOfType(first, 'takenOver');
  await first.closed;

  await second.nextUpdate();
  server.writeToPane("printf 'after-takeover\n'\n");
  await waitFor(() => server.paneText()?.includes('after-takeover') === true);
  expect(await second.nextUpdate()).toMatchObject({ pane: 1 });
  expect(server.snapshot().panes[0]?.lifecycle).toBe('running');
  expect(server.snapshot().attachedClientId).toBeDefined();
  expect(server.snapshot().clients).toHaveLength(1);
});

it('detaches the attached terminal client when a CLI client sends detach', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);
  const cli = await connectCli(socketPath);

  server.writeToPane("printf 'kept-marker\n'\n");
  await waitFor(() => server.paneText()?.includes('kept-marker') === true);
  cli.send({ type: 'detach', clientId: undefined });

  expect(await nextOfType(cli, 'detachResult')).toEqual({
    type: 'detachResult',
    result: { ok: true },
  });

  await nextOfType(terminal, 'detached');
  await terminal.closed;

  expect(server.snapshot()).toMatchObject({ attachedClientId: undefined, clients: [] });
  expect(server.snapshot().panes[0]?.lifecycle).toBe('running');

  const next = await connect(socketPath);

  next.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  const reattachedRows = new Map<number, string>();

  await receiveText(next, reattachedRows, 'kept-marker');
  cli.send(readRecent(paneId(1)));

  const read = await cli.nextPaneRows();

  expect(linesOf(read).join('\n')).toContain('kept-marker');
  expect(next.messages.some((message) => message.type === 'takenOver')).toBe(false);
});

it('answers a terminal client that detaches itself before it closes the connection', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);

  terminal.send({ type: 'detach', clientId: undefined });
  await terminal.closed;

  const answers = terminal.messages.filter(
    (message) => message.type === 'detachResult' || message.type === 'detached',
  );

  expect(answers).toEqual([{ type: 'detachResult', result: { ok: true } }, { type: 'detached' }]);

  expect(server.snapshot().panes[0]?.lifecycle).toBe('running');
});

it('answers detach with no attached client and changes no state', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const cli = await connectCli(socketPath);
  const before = server.snapshot();

  cli.send({ type: 'detach', clientId: undefined });

  expect(await nextOfType(cli, 'detachResult')).toEqual({
    type: 'detachResult',
    result: { ok: false, reason: 'noClient' },
  });

  expect(server.snapshot()).toEqual(before);
});

it('resizes the pane when an attached client sends resize', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(client);
  client.send({ type: 'resize', size: { columns: 90, rows: 20 } });

  const resized = await nextPaneResize(client);

  expect(resized.size).toEqual({ columns: 90 - sideListColumns, rows: 19 });

  await waitFor(() =>
    client.updates.some((update) => update.size.columns === 90 - sideListColumns),
  );

  const latest = client.updates.at(-1);

  expect(latest?.size).toEqual({ columns: 90 - sideListColumns, rows: 19 });
});

it('answers a pane color query with the background the attached client reported', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send(sizedHello);
  await waitFor(() => client.updates.length > 0);

  client.send({
    type: 'theme',
    theme: {
      foreground: 0x11_22_33,
      background: 0xdd_ee_ff,
      palette: Array.from({ length: 16 }, () => 0),
    },
  });

  client.send({ type: 'paneSend', paneId: paneId(1), text: "printf '\\033]11;?\\033\\\\'\n" });

  // The PTY echoes the terminal's reply, so the screen shows the color the query got.
  await waitFor(() => server.paneText()?.includes('rgb:dddd/eeee/ffff') === true);
});

it('ignores resize from a connection without a client', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const cli = await connect(socketPath);

  cli.send({ type: 'hello', version: build, size: undefined });
  await cli.nextMessage();
  await cli.nextMessage();
  cli.send({ type: 'resize', size: { columns: 90, rows: 20 } });
  cli.send({ type: 'resync' });

  const answer = await cli.nextMessage();

  expect(answer).toMatchObject({ type: 'snapshot' });
  expect(server.snapshot().panes[0]?.size).toEqual({ columns: 80, rows: 24 });
});

// Frames on one socket are handled in order, so the answer proves the earlier frames ran.
const afterResync = async (client: TestClient): Promise<void> => {
  const seen = client.messages.length;

  client.send({ type: 'resync' });

  while (!client.messages.slice(seen).some((message) => message.type === 'snapshot')) {
    await client.nextMessage();
  }
};

it('writes input from the attached client to the pane', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const terminal = await connect(socketPath);
  const rows = new Map<number, string>();

  terminal.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(terminal);
  terminal.sendInput(1, new TextEncoder().encode('echo phi-input\r'));

  await receiveText(terminal, rows, 'phi-input');

  expect([...rows.values()].some((row) => row.includes('phi-input'))).toBe(true);
});

it('ignores input from a welcomed connection that is not attached', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const cli = await connect(socketPath);

  cli.send({ type: 'hello', version: build, size: undefined });
  await cli.nextMessage();
  await cli.nextMessage();
  cli.sendInput(1, new TextEncoder().encode('echo phi-ignored\r'));
  await afterResync(cli);
  server.writeToPane('echo phi-marker\r');

  await waitFor(() => server.paneText()?.includes('phi-marker') === true);

  expect(server.paneText()).not.toContain('phi-ignored');
});

it('ignores input for a pane other than the current one', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await connect(socketPath);

  terminal.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(terminal);
  terminal.sendInput(2, new TextEncoder().encode('echo phi-other\r'));
  await afterResync(terminal);
  server.writeToPane('echo phi-marker\r');

  await waitFor(() => server.paneText()?.includes('phi-marker') === true);

  expect(server.paneText()).not.toContain('phi-other');
});

it('closes a connection whose input payload cannot be decoded', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const terminal = await connect(socketPath);

  terminal.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(terminal);
  terminal.sendRaw(FrameKind.input, Uint8Array.from([1, 0]));

  await terminal.closed;
});

it('publishes every changed row when range reads run between pane writes', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);
  const rows = new Map<number, string>();
  const reads: ReadRowsResult[] = [];
  const originalWrite = Terminal.prototype.write;

  const write = spyOn(Terminal.prototype, 'write').mockImplementation(function (
    this: Terminal,
    bytes: Uint8Array,
  ) {
    const reply = originalWrite.call(this, bytes);
    const stable = this.stableRows();

    reads.push(this.readRows(stable.epoch, stable.activeTop, 24));

    return reply;
  });

  onTestFinished(() => {
    write.mockRestore();
  });

  client.send({ type: 'hello', version: build, size: { columns: 80, rows: 24 } });
  applyRows(rows, await client.nextUpdate());

  server.writeToPane('echo range-$((6 * 7))\n');
  await receiveText(client, rows, 'range-42');
  server.writeToPane('echo range-$((7 * 7))\n');
  await receiveText(client, rows, 'range-49');

  expect(reads.length).toBeGreaterThan(1);
  expect(reads.every((read) => read.ok)).toBe(true);
  expect([...rows.values()].some((row) => row.includes('range-42'))).toBe(true);
});

it('answers workspaceCreate with a failure and keeps no workspace when the shell cannot start', async () => {
  const directory = await temporaryDirectory();

  const { server, socketPath } = await startEmptyServer(
    directory,
    join(directory, 'missing-shell'),
  );

  const answer = await createWorkspace(socketPath, directory, 'broken');

  expect(answer).toMatchObject({ type: 'workspaceFailed', reason: 'paneFailedToStart' });
  expect(server.snapshot()).toMatchObject({ workspaces: [], tabs: [], panes: [] });
  expect(existsSync(socketPath)).toBe(true);
});

it('keeps the existing pane at its full size when the split pane fails to start', async () => {
  const directory = await temporaryDirectory();
  const root = join(directory, 'root');

  await mkdir(root);

  const { server, socketPath } = await startEmptyServer(directory);

  await createWorkspace(socketPath, root, 'root');

  const before = server.snapshot().panes[0]?.size ?? { columns: 0, rows: 0 };

  await rm(root, { recursive: true });

  const cli = await connectCli(socketPath);

  cli.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });

  expect(await nextOfType(cli, 'paneFailed')).toMatchObject({ reason: 'paneFailedToStart' });
  expect(server.snapshot().panes.map((pane) => pane.size)).toEqual([before]);

  server.writeToPane('stty size\n');
  await waitFor(() => server.paneText()?.includes(`${before.rows} ${before.columns}`) === true);
});

it('refuses a client from another build with both versions and closes the connection', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const client = await connect(socketPath);
  const other: BuildVersion = { version: '1.2.4', ghostty: 'def456' };

  client.send({ type: 'hello', version: other, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'refused', client: other, server: build });

  await client.closed;

  expect(client.messages).toEqual([{ type: 'refused', client: other, server: build }]);
});

it('parses what the shell writes to its PTY', async () => {
  const directory = await temporaryDirectory();
  const { server } = await startServer(directory);

  server.writeToPane('echo phi-$((6 * 7))\n');

  // The PTY echoes the command, and a shell without line editing prints its prompt before the
  // output, so look for text only the command's output holds.
  await waitFor(() => server.paneText()?.includes('phi-42') === true);
});

it('ends a pane job that ignores SIGHUP within the bounded wait and removes the socket', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  // A unique duration, so the test finds only its own sleep.
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  server.writeToPane(`trap '' HUP; ${command}\n`);
  await waitFor(() => processesRunning(command).length > 0);

  const started = performance.now();

  server.stop();
  await server.stopped;

  expect(performance.now() - started).toBeLessThan(3000);
  await waitFor(() => processesRunning(command).length === 0, 1000);
  expect(existsSync(socketPath)).toBe(false);
});

const scopesAvailable = scope.scopeAvailable(process.env);

const logLinesOf = (logPath: string) => {
  if (!existsSync(logPath)) {
    return [];
  }

  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => logLineSchema.parse(JSON.parse(line)));
};

const startDetachedJob = async (server: Server): Promise<string> => {
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  server.writeToPane(`setsid sh -c "trap '' HUP; exec ${command}" &\n`);
  await waitFor(() => processesRunning(command).length > 0);

  return command;
};

it.skipIf(!scopesAvailable)(
  'ends a pane job that called setsid within the bounded wait',
  async () => {
    const directory = await temporaryDirectory();
    const { server } = await startServer(directory);
    const command = await startDetachedJob(server);
    const started = performance.now();

    server.stop();
    await server.stopped;

    expect(performance.now() - started).toBeLessThan(3000);
    await waitFor(() => processesRunning(command).length === 0, 1000);
  },
);

it.skipIf(!scopesAvailable)('runs a shell whose path holds a dollar sign', async () => {
  const directory = await temporaryDirectory();
  const shell = join(directory, 'sh$$');

  await symlink('/bin/sh', shell);

  const { server } = await startServer(directory, shell);

  server.writeToPane('echo phi-$((6 * 7))\n');
  await waitFor(() => server.paneText()?.includes('phi-42') === true);
});

it('starts the pane and ends its session when no user scope is available', async () => {
  const probe = spyOn(scope, 'scopeAvailable').mockReturnValue(false);

  onTestFinished(() => {
    probe.mockRestore();
  });

  const directory = await temporaryDirectory();
  const { server, logPath } = await startServer(directory);
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  server.writeToPane(`${command}\n`);
  await waitFor(() => processesRunning(command).length > 0);

  server.stop();
  await server.stopped;

  await waitFor(() => processesRunning(command).length === 0, 1000);

  expect(logLinesOf(logPath).some((line) => line.message.includes('No systemd user scope'))).toBe(
    true,
  );
});

it.skipIf(!scopesAvailable)('ends the pane scope when the pane is disposed', async () => {
  const result = spawnPane({
    generation: 1,
    size: { columns: 80, rows: 24 },
    environment: { ...process.env, SHELL: '/bin/sh' },
    directory: tmpdir(),
    useScope: true,
    onOutput: () => undefined,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const { pane } = result;
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  onTestFinished(() => {
    for (const name of processesRunning(command)) {
      process.kill(Number(name), 'SIGKILL');
    }
  });

  pane.write(new TextEncoder().encode(`setsid sh -c "trap '' HUP; exec ${command}" &\n`));
  await waitFor(() => processesRunning(command).length > 0);

  pane[Symbol.dispose]();

  await waitFor(() => processesRunning(command).length === 0, 2000);
});

it.skipIf(!scopesAvailable)(
  'reports cleanupFailed and still ends the shell when a scope signal fails',
  async () => {
    const signal = spyOn(scope, 'signalScope').mockResolvedValue({
      ok: false,
      message: 'Cannot send SIGHUP to scope test.scope',
    });

    onTestFinished(() => {
      signal.mockRestore();
    });

    const directory = await temporaryDirectory();
    const { server, logPath } = await startServer(directory);
    const command = `sleep 1000.${process.pid}${Date.now()}`;

    server.writeToPane(`exec ${command}\n`);
    await waitFor(() => processesRunning(command).length > 0);

    const [shellProcess] = processesRunning(command);

    server.stop();

    const stopped = await server.stopped;

    expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
    expect(processExists(Number(shellProcess))).toBe(false);

    expect(
      logLinesOf(logPath).some((line) => String(line.fields.error).includes('Cannot send SIGHUP')),
    ).toBe(true);
  },
);

it.skipIf(!scopesAvailable)(
  'stops within a bound and reports cleanupFailed when systemctl stalls',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');

    await mkdir(fakeDirectory);

    const { server, logPath } = await startServer(
      directory,
      '/bin/sh',
      `${fakeDirectory}:${process.env.PATH}`,
    );

    const command = `sleep 1000.${process.pid}${Date.now()}`;

    server.writeToPane(`exec ${command}\n`);
    await waitFor(() => processesRunning(command).length > 0);

    const [shellProcess] = processesRunning(command);

    // The fake goes on PATH only after the pane started in its scope, so only stop meets it.
    await Bun.write(join(fakeDirectory, 'systemctl'), '#!/bin/sh\nexec sleep 30\n');
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const started = performance.now();

    server.stop();

    const stopped = await server.stopped;

    expect(performance.now() - started).toBeLessThan(4000);
    expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
    expect(processExists(Number(shellProcess))).toBe(false);
    expect(logLinesOf(logPath).some((line) => line.level === 'error')).toBe(true);
  },
);

it.skipIf(!scopesAvailable)(
  'signals a pane scope that systemd registers only after stop begins',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');
    const readyPath = join(directory, 'ready');
    const armedPath = join(directory, 'armed');
    const hangupPath = join(directory, 'hangup');
    const queriedPath = join(directory, 'queried');
    const realSystemctl = Bun.which('systemctl');

    await mkdir(fakeDirectory);

    // Until the ready file exists, the fake answers as systemd does for a scope it has not
    // registered yet: kill fails and is-active reports an unknown unit.
    const fake = [
      '#!/bin/sh',
      `if [ ! -e '${readyPath}' ]; then`,
      '  case "$*" in',
      `    *is-active*) touch '${queriedPath}'; exit 4 ;;`,
      '    *kill*) exit 1 ;;',
      '  esac',
      'fi',
      `exec '${realSystemctl}' "$@"`,
      '',
    ].join('\n');

    await Bun.write(join(fakeDirectory, 'systemctl'), fake);
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const result = spawnPane({
      generation: 1,
      size: { columns: 80, rows: 24 },
      environment: {
        ...process.env,
        SHELL: '/bin/sh',
        PATH: `${fakeDirectory}:${process.env.PATH}`,
      },
      directory,
      useScope: true,
      onOutput: () => undefined,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const { pane } = result;

    onTestFinished(() => {
      pane[Symbol.dispose]();
    });

    const script = `trap 'touch ${hangupPath}' HUP; touch ${armedPath}; while :; do sleep 0.05; done\n`;

    pane.write(new TextEncoder().encode(script));
    await waitFor(() => existsSync(armedPath));

    const stopping = pane.stop();

    await waitFor(() => existsSync(queriedPath));
    await Bun.write(readyPath, '');

    expect(await stopping).toEqual([]);
    expect(existsSync(hangupPath)).toBe(true);
  },
);

it.skipIf(!scopesAvailable)(
  'reports cleanupFailed and still ends the shell when the scope never registers',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');
    const armedPath = join(directory, 'armed');

    await mkdir(fakeDirectory);

    const fake = [
      '#!/bin/sh',
      'case "$*" in',
      '  *is-active*) exit 4 ;;',
      '  *kill*) exit 1 ;;',
      'esac',
      '',
    ].join('\n');

    await Bun.write(join(fakeDirectory, 'systemctl'), fake);
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const result = spawnPane({
      generation: 1,
      size: { columns: 80, rows: 24 },
      environment: {
        ...process.env,
        SHELL: '/bin/sh',
        PATH: `${fakeDirectory}:${process.env.PATH}`,
      },
      directory,
      useScope: true,
      onOutput: () => undefined,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const { pane } = result;

    onTestFinished(() => {
      pane[Symbol.dispose]();
    });

    pane.write(new TextEncoder().encode(`touch ${armedPath}; while :; do sleep 0.05; done\n`));
    await waitFor(() => existsSync(armedPath));

    const failures = await pane.stop();

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('did not register');
    expect(await pane.exited).not.toBe(0);
  },
);

it.skipIf(!scopesAvailable)(
  'reports cleanupFailed and signals the shell when a stalled query is followed by unknown unit answers',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');
    const armedPath = join(directory, 'armed');
    const hangupPath = join(directory, 'hangup');
    const queriedPath = join(directory, 'queried');

    await mkdir(fakeDirectory);

    const fake = [
      '#!/bin/sh',
      'case "$*" in',
      `  *is-active*) if [ ! -e '${queriedPath}' ]; then touch '${queriedPath}'; exec sleep 2; fi; exit 4 ;;`,
      '  *kill*) exit 1 ;;',
      'esac',
      '',
    ].join('\n');

    await Bun.write(join(fakeDirectory, 'systemctl'), fake);
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const result = spawnPane({
      generation: 1,
      size: { columns: 80, rows: 24 },
      environment: {
        ...process.env,
        SHELL: '/bin/sh',
        PATH: `${fakeDirectory}:${process.env.PATH}`,
      },
      directory,
      useScope: true,
      onOutput: () => undefined,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const { pane } = result;

    onTestFinished(() => {
      pane[Symbol.dispose]();
    });

    const script = `trap 'touch ${hangupPath}' HUP; touch ${armedPath}; while :; do sleep 0.05; done\n`;

    pane.write(new TextEncoder().encode(script));
    await waitFor(() => existsSync(armedPath));

    const failures = await pane.stop();

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('did not register');
    expect(existsSync(hangupPath)).toBe(true);
    expect(await pane.exited).not.toBe(0);
  },
);

it('keeps running after SIGHUP and after the shell exits, and stops on SIGTERM', async () => {
  const directory = await temporaryDirectory();
  const { child, socketPath } = await startServerProcess(directory);

  child.kill('SIGHUP');
  expect((await createWorkspace(socketPath, directory, 'shell')).type).toBe('workspaceDone');

  await child.stdin.write('exit\n');
  await child.stdin.flush();

  const exitedEarly = await Promise.race([child.exited, Bun.sleep(500).then(() => 'running')]);

  expect(exitedEarly).toBe('running');
  expect(existsSync(socketPath)).toBe(true);

  child.kill('SIGTERM');

  expect(await child.exited).toBe(0);
  expect(existsSync(socketPath)).toBe(false);
});

it.each(['SIGTERM', 'SIGINT'] as const)('stops on %s and removes the socket', async (signal) => {
  const directory = await temporaryDirectory();
  const { child, socketPath } = await startServerProcess(directory);

  child.kill(signal);

  expect(await child.exited).toBe(0);
  expect(existsSync(socketPath)).toBe(false);
});

it('stops when a client sends stop', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  await client.nextMessage();
  client.send({ type: 'stop' });

  await server.stopped;
  await client.closed;

  expect(existsSync(socketPath)).toBe(false);
});

const hasQueueWarning = (logPath: string): boolean =>
  logLinesOf(logPath).some((line) => line.level === 'warn' && line.fields.limitBytes !== undefined);

it('closes a connection that never reads once its queue is full, and keeps parsing the pane', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath, logPath } = await startServer(directory);
  const socket = createConnection(socketPath);
  const closed = Promise.withResolvers<undefined>();

  socket.once('close', () => {
    closed.resolve(undefined);
  });

  // The server closes the socket while this test still writes requests.
  socket.on('error', () => undefined);

  onTestFinished(() => {
    socket.destroy();
  });

  await once(socket, 'connect');
  socket.pause();

  const resync = encodeFrame(FrameKind.control, encodeControl({ type: 'resync' }));
  const requests = Array.from({ length: 40_000 }, () => resync);
  const hello = encodeControl({ type: 'hello', version: build, size: undefined });

  socket.write(encodeFrame(FrameKind.control, hello));
  socket.write(Buffer.concat(requests));

  await waitFor(() => hasQueueWarning(logPath));

  server.writeToPane('echo phi-$((6 * 7))\n');
  await waitFor(() => server.paneText()?.includes('phi-42') === true);

  socket.resume();
  await closed.promise;
});

const sizedHello: ControlMessage = {
  type: 'hello',
  version: build,
  size: { columns: 100, rows: 30 },
};

const nextPaneLines = async (client: TestClient): Promise<string[]> =>
  linesOf(await client.nextPaneRows());

// Every row update the server sent before this call has arrived when it returns.
const roundTrip = async (client: TestClient): Promise<string[]> => {
  client.send(readRecent(paneId(1)));

  return nextPaneLines(client);
};

const hasText = (rows: Map<number, string>, text: string): boolean =>
  [...rows.values()].some((row) => row.includes(text));

const inFlightLimit = 8;

// Prints one line at a time until the client has all the updates the server will send it.
const startPacedClient = async (server: Server, socketPath: string) => {
  const client = await connect(socketPath);

  client.send(sizedHello);
  await waitFor(() => client.updates.length > 0);

  for (let step = 0; client.updates.length < inFlightLimit; step += 1) {
    const marker = `step-${step}`;

    server.writeToPane(`echo ${marker}\n`);
    await waitFor(() => server.paneText()?.includes(marker) === true);
    await roundTrip(client);
  }

  return client;
};

it('stops sending rows to a client that never acks while the pane keeps parsing', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await startPacedClient(server, socketPath);
  const sentBefore = client.updates.length;

  expect(sentBefore).toBe(inFlightLimit);

  server.writeToPane('echo after-limit-$((6 * 7))\n');
  await waitFor(() => server.paneText()?.includes('after-limit-42') === true);
  await roundTrip(client);

  expect(client.updates).toHaveLength(sentBefore);

  const read = await roundTrip(client);

  expect(read.join('\n')).toContain('after-limit-42');
});

it('sends the newest screen after the client acks', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await startPacedClient(server, socketPath);
  const sentBefore = client.updates.length;

  server.writeToPane('echo after-limit-$((6 * 7))\n');
  await waitFor(() => server.paneText()?.includes('after-limit-42') === true);

  client.send({ type: 'ack', paneId: paneId(1), sequence: client.updates.at(-1)?.sequence ?? 0 });
  await waitFor(() => client.updates.length > sentBefore);

  const rows = new Map<number, string>();

  for (const update of client.updates) {
    applyRows(rows, update);
  }

  const expected = await roundTrip(client);
  const last = client.updates.at(-1);

  if (last === undefined) {
    throw new Error('No row update arrived.');
  }

  const cached = expected.map((_, index) => rows.get(last.activeTop + index) ?? '');

  expect(cached).toEqual(expected.map((row) => row.trimEnd()));
});

const updatesOf = (client: TestClient, pane: number): RowUpdate[] =>
  client.updates.filter((update) => update.pane === pane);

it('counts an ack only for the pane it names', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const cli = await connectCli(socketPath);

  cli.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });
  await nextOfType(cli, 'paneDone');

  const terminal = await attachTerminal(socketPath, 100);

  const fill = async (pane: number): Promise<void> => {
    for (let step = 0; updatesOf(terminal, pane).length < inFlightLimit; step += 1) {
      const seen = updatesOf(terminal, pane).length;

      cli.send({ type: 'paneSend', paneId: paneId(pane), text: `echo fill-${pane}-${step}\n` });
      await waitFor(() => updatesOf(terminal, pane).length > seen);
    }
  };

  await fill(1);
  await fill(2);

  const secondBefore = updatesOf(terminal, 2).length;
  const secondSequences = new Set(updatesOf(terminal, 2).map((update) => update.sequence));

  const sharedSequences = updatesOf(terminal, 1)
    .map((update) => update.sequence)
    .filter((sequence) => secondSequences.has(sequence));

  const sharedSequence = sharedSequences.at(-1);

  if (sharedSequence === undefined) {
    throw new Error('Both panes must have been sent the same sequence.');
  }

  terminal.send({ type: 'ack', paneId: paneId(1), sequence: sharedSequence });
  await roundTrip(terminal);
  cli.send({ type: 'paneSend', paneId: paneId(2), text: 'echo second-after-$((6 * 7))\n' });

  // Pane 2 schedules its publication when it parses this output. Once the output is readable, the
  // publication runs before any later publication of pane 1, and so before pane 1's update arrives.
  for (;;) {
    cli.send(readRecent(paneId(2)));

    if ((await nextPaneLines(cli)).join('\n').includes('second-after-42')) {
      break;
    }
  }

  const firstAfterFill = updatesOf(terminal, 1).length;

  cli.send({ type: 'paneSend', paneId: paneId(1), text: 'echo first-after\n' });
  await waitFor(() => updatesOf(terminal, 1).length > firstAfterFill);

  expect(updatesOf(terminal, 2)).toHaveLength(secondBefore);
});

it('ignores an ack for a sequence the client was never sent', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await startPacedClient(server, socketPath);
  const sentBefore = client.updates.length;

  client.send({
    type: 'ack',
    paneId: paneId(1),
    sequence: (client.updates.at(-1)?.sequence ?? 0) + 1000,
  });

  await roundTrip(client);

  expect(client.updates).toHaveLength(sentBefore);
});

it('keeps a connection open when output outruns a client that does not read or ack', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath, logPath } = await startServer(directory);
  const socket = createConnection(socketPath);
  let closed = false;

  socket.once('close', () => {
    closed = true;
  });

  socket.on('error', () => undefined);

  onTestFinished(() => {
    socket.destroy();
  });

  await once(socket, 'connect');
  socket.pause();
  socket.write(encodeFrame(FrameKind.control, encodeControl(sizedHello)));

  server.writeToPane('seq 1 200000; echo burst-$((6 * 7))\n');
  await waitFor(() => server.paneText()?.includes('burst-42') === true, 20_000);

  expect(hasQueueWarning(logPath)).toBe(false);
  expect(closed).toBe(false);
});

it('keeps a connection open when full-screen repaints of a large terminal outrun a client that does not read or ack', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath, logPath } = await startServer(directory);
  const socket = createConnection(socketPath);
  let closed = false;

  socket.once('close', () => {
    closed = true;
  });

  socket.on('error', () => undefined);

  onTestFinished(() => {
    socket.destroy();
  });

  await once(socket, 'connect');
  socket.pause();

  const hello = { ...sizedHello, size: { columns: 240, rows: 81 } };

  socket.write(encodeFrame(FrameKind.control, encodeControl(hello)));
  await waitFor(() => server.snapshot().clients.length === 1);

  server.writeToPane('stty -echo\n');
  await Bun.sleep(30);

  for (const character of 'abcdefghijklmnopqrst') {
    const command = `printf '\\033[?2026h\\033[2J\\033[H'; printf '%19200s' '' | tr ' ' '${character}'; printf '\\033[?2026l'\n`;

    server.writeToPane(command);
    await waitFor(() => server.paneText()?.includes(character.repeat(200)) === true);
    await Bun.sleep(60);
  }

  expect(hasQueueWarning(logPath)).toBe(false);
  expect(closed).toBe(false);
});

it('delivers a paneSend echo to an acking client without advancing a timer', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const client = await connect(socketPath);
  const rows = new Map<number, string>();

  client.send(sizedHello);
  await waitFor(() => client.updates.length > 0);

  jest.useFakeTimers();

  try {
    client.send({ type: 'paneSend', paneId: paneId(1), text: 'echo echoed-$((6 * 7))\n' });

    while (!hasText(rows, 'echoed-42')) {
      const update = await client.nextUpdate();

      applyRows(rows, update);
      client.send({ type: 'ack', paneId: paneId(update.pane), sequence: update.sequence });
    }
  } finally {
    jest.useRealTimers();
  }

  expect(hasText(rows, 'echoed-42')).toBe(true);
});

it('ends the pane, closes connections, and removes the socket when stopping the pane fails', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath, logPath } = await startServer(directory);
  const client = await connect(socketPath);
  // A unique duration, so the test finds only its own sleep.
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  client.send({ type: 'hello', version: build, size: undefined });
  await client.nextMessage();
  server.writeToPane(`exec ${command}\n`);
  await waitFor(() => processesRunning(command).length > 0);

  const [shellProcess] = processesRunning(command);

  const scan = spyOn(processGroups, 'sessionGroups').mockImplementation(() => {
    throw new Error('No /proc here.');
  });

  onTestFinished(() => {
    scan.mockRestore();
  });

  server.stop();

  const stopped = await server.stopped;

  expect(processExists(Number(shellProcess))).toBe(false);
  await client.closed;
  expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
  expect(existsSync(socketPath)).toBe(false);
  expect(logLinesOf(logPath).some((line) => line.fields.error === 'No /proc here.')).toBe(true);
});

it('starts a new server on the socket path after the first one stops', async () => {
  const directory = await temporaryDirectory();
  const first = await startServer(directory);

  first.server.stop();
  await first.server.stopped;

  const second = await startServer(directory);
  const client = await connect(second.socketPath);

  client.send({ type: 'hello', version: build, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
});

it.skipIf(isRoot)(
  'releases the lock and reports the failure when it cannot remove its socket',
  async () => {
    const directory = await temporaryDirectory();
    const { server, socketPath, logPath } = await startServer(directory);
    const socketDirectory = join(directory, 'run');

    await chmod(socketDirectory, 0o500);

    let stopped: Awaited<Server['stopped']>;

    try {
      server.stop();
      stopped = await server.stopped;
    } finally {
      await chmod(socketDirectory, 0o700);
    }

    // The socket is left behind, and the next claim removes it as stale.
    const claimed = await claimSocketPath(socketPath);

    if (claimed.ok) {
      claimed.release();
    }

    expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
    expect(logLinesOf(logPath).some((line) => line.level === 'error')).toBe(true);
    expect(claimed).toMatchObject({ ok: true, path: socketPath });
  },
);
