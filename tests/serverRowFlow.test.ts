import { expect, it, jest, onTestFinished } from 'bun:test';
import { once } from 'node:events';
import { createConnection } from 'node:net';

import { paneId } from '../src/ids.ts';
import { sideListColumns } from '../src/layout.ts';
import { encodeFrame, FrameKind } from '../src/protocol/frames.ts';
import { encodeControl } from '../src/protocol/messages.ts';
import { kittyFlags } from '../src/rows/rows.ts';
import type { RowUpdate } from '../src/rows/rows.ts';
import type { Server } from '../src/server/server.ts';
import type { TestClient } from './serverHarness.ts';
import {
  readRecent,
  linesOf,
  build,
  temporaryDirectory,
  waitFor,
  connect,
  startServer,
  applyRows,
  receiveText,
  attachTerminal,
  connectCli,
  nextOfType,
  logLinesOf,
  sizedHello,
} from './serverHarness.ts';

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

it('sends new kitty keyboard flags to a subscriber without a row change', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);
  const rows = new Map<number, string>();

  client.send(sizedHello);
  await receiveText(client, rows, '$');

  // The program prints its marker, so the echoed command line never matches it. Echo is off before
  // the marker, so the line that starts the push draws no row.
  server.writeToPane("stty -echo; echo rea''dy; read go; printf '\\033[>5u'; read stop\n");
  await receiveText(client, rows, 'ready');
  server.writeToPane('go\n');

  let update = await client.nextUpdate();

  while (kittyFlags(update.modes) !== 5) {
    applyRows(rows, update);
    client.send({ type: 'ack', paneId: paneId(update.pane), sequence: update.sequence });
    update = await client.nextUpdate();
  }

  expect(update.rowCount).toBe(0);
});
