import { expect, it } from 'bun:test';

import { runPaneCopy } from '../src/client/client.ts';
import type { PaneCopyCommand } from '../src/client/client.ts';
import { paneId } from '../src/ids.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';
import type { TestClient } from './serverHarness.ts';
import {
  attachTerminal,
  connectCli,
  nextOfType,
  build,
  startServer,
  temporaryDirectory,
  waitFor,
} from './serverHarness.ts';

const screenCommand = `printf '\\033[2J\\033[H%s\\n%s' alpha-bravo charlie\n`;

const copyRange = (print: boolean, target = paneId(1)): ControlMessage => ({
  type: 'paneCopy',
  paneId: target,
  start: { row: 0, column: 6 },
  end: { row: 1, column: 2 },
  print,
});

const startServerOnly = async () => {
  const directory = await temporaryDirectory();

  return startServer(directory);
};

// A terminal must attach before the screen is drawn, because its size reflows the pane.
const drawScreen = async (server: {
  writeToPane: (text: string) => void;
  paneText: () => string | undefined;
}) => {
  server.writeToPane(screenCommand);

  await waitFor(() => server.paneText()?.includes('alpha-bravo\ncharlie') === true);
};

// The server sends a client its messages in order, so once the answer to a resync arrives, every
// message sent before it has arrived too.
const settle = async (client: TestClient): Promise<void> => {
  client.send({ type: 'resync' });
  await nextOfType(client, 'snapshot');
};

it('sends the copied text to the foreground client only', async () => {
  const { server, socketPath } = await startServerOnly();
  const terminal = await attachTerminal(socketPath, 100);

  await drawScreen(server);

  const cli = await connectCli(socketPath);

  cli.send(copyRange(false));

  const result = await nextOfType(cli, 'paneCopyResult');

  expect(await nextOfType(terminal, 'clipboardWrite')).toEqual({
    type: 'clipboardWrite',
    text: 'bravo\ncha',
  });

  expect(result.result).toMatchObject({ ok: true, text: 'bravo\ncha' });

  await settle(cli);

  expect(cli.messages.some((message) => message.type === 'clipboardWrite')).toBe(false);
});

it('fails with noClient and sends nothing when no client is attached', async () => {
  const { server, socketPath } = await startServerOnly();

  await drawScreen(server);

  const cli = await connectCli(socketPath);

  cli.send(copyRange(false));

  expect((await nextOfType(cli, 'paneCopyResult')).result).toEqual({
    ok: false,
    reason: 'noClient',
    oldest: undefined,
  });
});

it('returns the text with print and no client attached', async () => {
  const { server, socketPath } = await startServerOnly();

  await drawScreen(server);

  const cli = await connectCli(socketPath);

  cli.send(copyRange(true));

  expect((await nextOfType(cli, 'paneCopyResult')).result).toEqual({
    ok: true,
    text: 'bravo\ncha',
    clientId: undefined,
  });
});

it('sends no clipboard write to the foreground client with print', async () => {
  const { server, socketPath } = await startServerOnly();
  const terminal = await attachTerminal(socketPath, 100);

  await drawScreen(server);

  const cli = await connectCli(socketPath);

  cli.send(copyRange(true));

  expect((await nextOfType(cli, 'paneCopyResult')).result).toMatchObject({ ok: true });

  await settle(terminal);

  expect(terminal.messages.some((message) => message.type === 'clipboardWrite')).toBe(false);
});

it('fails for an unknown pane', async () => {
  const { server, socketPath } = await startServerOnly();

  await drawScreen(server);

  const cli = await connectCli(socketPath);

  cli.send(copyRange(true, paneId(99)));

  expect((await nextOfType(cli, 'paneCopyResult')).result).toMatchObject({
    ok: false,
    reason: 'unknownPane',
  });
});

it('copies through runPaneCopy and names the client that got the text', async () => {
  const { server, socketPath } = await startServerOnly();
  const terminal = await attachTerminal(socketPath, 100);

  await drawScreen(server);

  const command: PaneCopyCommand = {
    action: 'copy',
    pane: paneId(1),
    start: { row: 0, column: 6 },
    end: { row: 1, column: 2 },
    print: false,
  };

  const result = await runPaneCopy(socketPath, build, command);

  expect(await nextOfType(terminal, 'clipboardWrite')).toEqual({
    type: 'clipboardWrite',
    text: 'bravo\ncha',
  });

  expect(result).toMatchObject({ ok: true, text: 'bravo\ncha' });
  expect(result.ok && result.clientId).toBeDefined();
});

it('reports noClient through runPaneCopy and prints with no client', async () => {
  const { server, socketPath } = await startServerOnly();

  await drawScreen(server);

  const command: PaneCopyCommand = {
    action: 'copy',
    pane: paneId(1),
    start: { row: 0, column: 0 },
    end: { row: 0, column: 4 },
    print: false,
  };

  expect(await runPaneCopy(socketPath, build, command)).toEqual({ ok: false, reason: 'noClient' });

  expect(await runPaneCopy(socketPath, build, { ...command, print: true })).toEqual({
    ok: true,
    text: 'alpha',
    clientId: undefined,
  });
});
