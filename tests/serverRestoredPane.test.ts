import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paneId, tabId, workspaceId } from '../src/ids.ts';
import type { Log } from '../src/server/log.ts';
import { runServer } from '../src/server/server.ts';
import type { Server } from '../src/server/server.ts';
import { createSessionWriter } from '../src/server/sessionFile.ts';
import type { SavedSession } from '../src/store/store.ts';

const noop = (): void => {};

const log: Log = { debug: noop, info: noop, warn: noop, error: noop };

const savedSession = (root: string): SavedSession => ({
  workspaces: [
    { id: workspaceId(1), root, label: 'saved', tabIds: [tabId(1)], activeTabId: tabId(1) },
  ],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout: { kind: 'pane', paneId: paneId(1) },
      focusedPaneId: paneId(1),
      zoomedPaneId: undefined,
      label: undefined,
    },
  ],
  panes: [{ id: paneId(1), tabId: tabId(1), startFolder: undefined }],
  focusedWorkspaceId: workspaceId(1),
  nextWorkspaceNumber: 2,
  nextTabNumber: 2,
  nextPaneNumber: 2,
});

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-server-'));

  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  return directory;
};

// The server logs while it stops, so it must stop before its directory goes. Cleanup runs in
// reverse order of registration.
const startServer = async (
  directory: string,
  shell: string,
  sessionPath?: string,
): Promise<Server> => {
  const result = await runServer({
    socketPath: join(directory, 'run', 'koja.sock'),
    version: { version: 'test', ghostty: 'test' },
    log,
    environment: { ...process.env, SHELL: shell },
    binaryPath: process.execPath,
    ...(sessionPath === undefined ? {} : { sessionPathFor: () => sessionPath }),
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const { server } = result;

  onTestFinished(async () => {
    server.stop();
    await server.stopped;
  });

  return server;
};

// Starts a server that restores one saved pane, which is focused, with the given shell.
const restoredServer = async (shell: string): Promise<Server> => {
  const directory = await temporaryDirectory();
  const sessionPath = join(directory, 'session.json');

  await createSessionWriter(sessionPath, log).stopSaving(savedSession(directory));

  return startServer(directory, shell, sessionPath);
};

const nextTurn = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const waitFor = async (condition: () => boolean): Promise<void> => {
  const deadline = performance.now() + 5000;

  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error('The condition did not hold in time.');
    }

    await nextTurn();
  }
};

it('writes to the focused pane and reads its text', async () => {
  const server = await restoredServer('/bin/sh');

  await waitFor(() => server.paneText() !== undefined);

  server.writeToPane('echo restored-marker\n');

  await waitFor(() => server.paneText()?.includes('restored-marker') === true);
});

it('ignores a write and a read when the server has no pane', async () => {
  const server = await startServer(await temporaryDirectory(), '/bin/sh');

  expect(() => {
    server.writeToPane('echo ignored\n');
  }).not.toThrow();

  expect(server.paneText()).toBeUndefined();
});

it('ignores a write and a read when the focused pane has no running shell', async () => {
  const server = await restoredServer('/nonexistent/shell');

  await waitFor(() => server.snapshot().panes.some((pane) => pane.lifecycle === 'failed'));

  expect(() => {
    server.writeToPane('echo ignored\n');
  }).not.toThrow();

  expect(server.paneText()).toBeUndefined();
});
