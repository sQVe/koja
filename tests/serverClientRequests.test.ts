import { expect, it } from 'bun:test';

import { paneId, workspaceId } from '../src/ids.ts';
import { sideListColumns } from '../src/layout.ts';
import { FrameKind } from '../src/protocol/frames.ts';
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
  receiveText,
  nextPaneResize,
  attachTerminal,
  connectCli,
  nextOfType,
  sizedHello,
} from './serverHarness.ts';

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

it('keeps a scrolled view at its distance from the bottom after a resize renumbers the rows', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await connect(socketPath);
  const rows = new Map<number, string>();

  terminal.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(terminal);
  terminal.sendInput(1, new TextEncoder().encode("seq -f '%070g' 1 300; echo phi-done\r"));
  await receiveText(terminal, rows, 'phi-done');
  await waitFor(() => (terminal.updates.at(-1)?.activeTop ?? 0) > 100);

  const before = terminal.updates.at(-1);

  expect(before).toBeDefined();

  const topRow = (before?.activeTop ?? 0) - 60;
  const distance = (before?.activeTop ?? 0) - topRow;

  terminal.send({ type: 'paneScroll', paneId: paneId(1), to: topRow, clientId: undefined });
  await nextOfType(terminal, 'paneScrollResult');
  terminal.send({ type: 'resize', size: { columns: 60, rows: 30 } });
  await nextPaneResize(terminal);

  await waitFor(() => (terminal.updates.at(-1)?.first ?? 0) > (before?.activeTop ?? 0));

  const after = terminal.updates.at(-1);
  const scrolls = server.snapshot().clients[0]?.view.scrolls;

  expect(scrolls).toEqual([{ paneId: paneId(1), topRow: (after?.activeTop ?? 0) - distance }]);
});
