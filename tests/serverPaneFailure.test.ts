import { expect, it, onTestFinished, spyOn } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { paneId } from '../src/ids.ts';
import * as processGroups from '../src/server/processGroups.ts';
import { Terminal } from '../src/vt/vt.ts';
import {
  build,
  connect,
  createWorkspace,
  linesOf,
  logLinesOf,
  processExists,
  readRecent,
  startServer,
  temporaryDirectory,
  waitFor,
} from './serverHarness.ts';

// Observed with Bun 1.4.3 and no catch in the pane's output callback: an error thrown from the PTY
// `data` callback is uncaught. Bun prints it and ends the whole process, so every pane dies with it.
const failOnePane = async (scanFails: boolean): Promise<void> => {
  const directory = await temporaryDirectory();
  const { server, socketPath, logPath } = await startServer(directory);

  await createWorkspace(socketPath, join(directory, '.'), `${basename(directory)}-second`);

  if (scanFails) {
    const scan = spyOn(processGroups, 'sessionGroups').mockImplementation(() => {
      throw new Error('No /proc here.');
    });

    onTestFinished(() => {
      scan.mockRestore();
    });
  }

  const write = Terminal.prototype.write;
  const maxSeenLength = 64;
  const decoders = new WeakMap<Terminal, TextDecoder>();
  const seenByTerminal = new WeakMap<Terminal, string>();
  let thrown = false;

  const spy = spyOn(Terminal.prototype, 'write').mockImplementation(function throwOnMarker(
    this: Terminal,
    bytes: Uint8Array,
  ) {
    const decoder = decoders.get(this) ?? new TextDecoder();

    decoders.set(this, decoder);

    const seen = (seenByTerminal.get(this) ?? '') + decoder.decode(bytes, { stream: true });

    seenByTerminal.set(this, seen.slice(-maxSeenLength));

    if (!thrown && seen.includes('boom-marker')) {
      thrown = true;

      throw new Error('marker rejected');
    }

    return write.call(this, bytes);
  });

  onTestFinished(() => {
    spy.mockRestore();
  });

  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  await client.nextMessage();
  await client.nextMessage();

  const failed = (): string | undefined => {
    const pane = server.snapshot().panes.find((known) => known.id === paneId(1));

    return pane?.lifecycle === 'failed' ? pane.error : undefined;
  };

  client.send({
    type: 'paneSend',
    paneId: paneId(2),
    text: "printf 'other-%s\\n' alive\n",
  });

  const pidFile = join(directory, 'shell.pid');
  let shellProcess = 0;

  client.send({
    type: 'paneSend',
    paneId: paneId(1),
    text: `echo $$ > ${pidFile}\n`,
  });

  await waitFor(() => {
    shellProcess = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : 0;

    return shellProcess > 0;
  });

  client.send({
    type: 'paneSend',
    paneId: paneId(1),
    text: "printf 'boom-%s\\n' marker\n",
  });

  await waitFor(() => failed() !== undefined);

  expect(failed()).toContain('marker rejected');

  await waitFor(() =>
    logLinesOf(logPath).some(
      (line) =>
        line.fields.paneId === paneId(1) && String(line.fields.message).includes('marker rejected'),
    ),
  );

  await waitFor(() => !processExists(shellProcess));

  expect(failed()).toContain('marker rejected');

  await waitFor(
    () => server.snapshot().panes.find((p) => p.id === paneId(2))?.lifecycle === 'running',
  );

  client.send(readRecent(paneId(2)));

  for (;;) {
    const rows = await client.nextPaneRows();

    if (linesOf(rows).join('\n').includes('other-alive')) {
      break;
    }
  }
};

it('fails only the pane whose output handling throws, and keeps serving the other pane', async () => {
  await failOnePane(false);
});

it('fails the pane and serves the other pane when the process scan also fails', async () => {
  await failOnePane(true);
});
