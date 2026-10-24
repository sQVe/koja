import { expect, it, onTestFinished, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { paneId, workspaceId } from '../src/ids.ts';
import { maxFramePayloadBytes } from '../src/protocol/frames.ts';
import type { ControlMessage } from '../src/protocol/messages.ts';
import { encodePaneRows, PaneRowsSource, rowsToLines } from '../src/rows/rows.ts';
import { maxReplyBytes, maxSnapshotBytes } from '../src/server/paneRows.ts';
import { Terminal } from '../src/vt/vt.ts';
import type { ReadRowsResult } from '../src/vt/vt.ts';
import type { TestClient } from './serverHarness.ts';
import {
  readRecent,
  linesOf,
  build,
  temporaryDirectory,
  waitFor,
  connect,
  createWorkspace,
  startServer,
  applyRows,
  receiveText,
} from './serverHarness.ts';

// The server's limit on bytes a client has not read.
const unreadQueueLimitBytes = 0x10_00_00;

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

const visibleRead = (requestId: number): ControlMessage => ({
  type: 'paneRead',
  paneId: paneId(1),
  requestId,
  selection: { source: 'visible', lines: undefined },
});

it('frees held read capacity when a socket disconnects before release', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const departed = await connect(socketPath);
  const retained = await connect(socketPath);

  departed.send({ type: 'hello', version: build, size: { columns: 80, rows: 24 } });
  retained.send({ type: 'hello', version: build, size: undefined });
  await waitFor(() => server.snapshot().clients.length === 1);

  server.writeToPane('printf \'\\033[?2026hhalf-\'"drawn"\n');
  await waitFor(() => server.paneText()?.includes('half-drawn') === true);

  const barrier = { type: 'paneSend', paneId: paneId(1), text: '' } as const;

  departed.sendTogether([
    ...Array.from({ length: 32 }, (_, index) => visibleRead(index + 1)),
    barrier,
  ]);

  retained.sendTogether([
    ...Array.from({ length: 32 }, (_, index) => visibleRead(index + 33)),
    barrier,
  ]);

  await waitFor(() => departed.messages.some((message) => message.type === 'paneSent'));
  await waitFor(() => retained.messages.some((message) => message.type === 'paneSent'));
  expect(departed.paneRows).toHaveLength(0);
  expect(retained.paneRows).toHaveLength(0);

  departed.close();
  await waitFor(() => server.snapshot().clients.length === 0);

  retained.sendTogether([
    ...Array.from({ length: 32 }, (_, index) => visibleRead(index + 65)),
    barrier,
  ]);

  await waitFor(
    () => retained.messages.filter((message) => message.type === 'paneSent').length === 2,
  );

  expect(retained.messages.filter((message) => message.type === 'paneReadFailed')).toEqual([]);

  server.writeToPane("printf '\\033[?2026l'\n");
  const rows = await retained.nextPaneRows();

  expect(rows.requestId).toBe(96);

  await waitFor(
    () => retained.messages.filter((message) => message.type === 'paneReadFailed').length === 63,
  );

  expect(
    retained.messages
      .filter((message) => message.type === 'paneReadFailed')
      .every((message) => message.failure.reason === 'noSnapshot'),
  ).toBe(true);
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
