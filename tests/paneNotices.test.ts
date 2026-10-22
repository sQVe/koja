import { expect, it } from 'bun:test';

import type { TestClient } from './serverHarness.ts';
import {
  attachTerminal,
  connectCli,
  nextOfType,
  startServer,
  temporaryDirectory,
  waitFor,
} from './serverHarness.ts';

const clipboardCommand = `printf '\\033]52;c;%s\\007' "$(printf hi | base64)"\n`;

// Writes `hi` without running a program. Under dash in the full suite, the exec of base64 right
// after a 600 KiB write fails with E2BIG, though the pane keeps working.
const literalClipboardCommand = "printf '\\033]52;c;aGk=\\007'\n";

const largeClipboardCommand = (kibibytes: number): string =>
  `printf '\\033]52;c;%s\\007' "$(head -c ${kibibytes * 1024} /dev/zero | tr '\\0' x | base64 -w0)"\n`;

// The server sends a client its messages in order, so once the answer to a resync arrives, every
// notice the pane made before it has arrived too.
const settle = async (
  server: { paneText: () => string | undefined },
  client: TestClient,
): Promise<void> => {
  await waitFor(() => server.paneText()?.includes('after-42') === true);
  client.send({ type: 'resync' });
  await nextOfType(client, 'snapshot');
};

it('sends a bell to the foreground client only', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);
  const cli = await connectCli(socketPath);

  server.writeToPane("printf '\\a'\n");

  expect(await nextOfType(terminal, 'bell')).toEqual({ type: 'bell', count: 1 });

  server.writeToPane('echo after-$((6 * 7))\n');

  await settle(server, terminal);
  await settle(server, cli);

  expect(terminal.messages.filter((message) => message.type === 'bell')).toHaveLength(1);
  expect(cli.messages.some((message) => message.type === 'bell')).toBe(false);
});

it('delivers every bell of one write', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);

  server.writeToPane("printf '\\a\\a'\n");
  server.writeToPane('echo after-$((6 * 7))\n');

  let rung = 0;

  while (rung < 2) {
    rung += (await nextOfType(terminal, 'bell')).count;
  }

  await settle(server, terminal);

  expect(rung).toBe(2);
  expect(terminal.messages.filter((message) => message.type === 'bell')).toHaveLength(1);
});

it('sends no bell for an OSC title ended by BEL', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);

  server.writeToPane("printf '\\033]0;a title\\007'\n");
  server.writeToPane('echo after-$((6 * 7))\n');

  await settle(server, terminal);

  expect(terminal.messages.some((message) => message.type === 'bell')).toBe(false);
});

it('sends a clipboard write to the foreground client only', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);
  const cli = await connectCli(socketPath);

  server.writeToPane(clipboardCommand);

  expect(await nextOfType(terminal, 'clipboardWrite')).toEqual({
    type: 'clipboardWrite',
    text: 'hi',
  });

  server.writeToPane('echo after-$((6 * 7))\n');

  await settle(server, cli);

  expect(cli.messages.some((message) => message.type === 'clipboardWrite')).toBe(false);
});

it('sends a clipboard write of 200 KiB to the foreground client', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);

  server.writeToPane(largeClipboardCommand(200));

  const message = await nextOfType(terminal, 'clipboardWrite');

  expect(message).toEqual({ type: 'clipboardWrite', text: 'x'.repeat(200 * 1024) });
});

it('drops a clipboard write of 600 KiB and keeps the next one', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const terminal = await attachTerminal(socketPath, 100);

  server.writeToPane(largeClipboardCommand(600));
  server.writeToPane(literalClipboardCommand);

  expect(await nextOfType(terminal, 'clipboardWrite')).toEqual({
    type: 'clipboardWrite',
    text: 'hi',
  });
});

it('drops a bell and a clipboard write when no client is in the foreground', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const cli = await connectCli(socketPath);

  server.writeToPane("printf '\\a'\n");
  server.writeToPane(clipboardCommand);
  server.writeToPane('echo after-$((6 * 7))\n');

  await settle(server, cli);

  const types = cli.messages.map((message) => message.type);

  expect(types).not.toContain('bell');
  expect(types).not.toContain('clipboardWrite');
  expect(server.snapshot().panes[0]?.lifecycle).toBe('running');
});
