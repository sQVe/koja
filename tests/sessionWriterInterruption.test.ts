import { expect, it, onTestFinished } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { paneId, tabId, workspaceId } from '../src/ids.ts';
import type { Log } from '../src/server/log.ts';
import { readSessionFile } from '../src/server/sessionFile.ts';
import { createSessionWriter } from '../src/server/sessionWriter.ts';
import type { SavedSession } from '../src/store/store.ts';
import { temporaryDirectory, waitFor } from './serverHarness.ts';

const ignore = (): void => {};

const log: Log = { debug: ignore, info: ignore, warn: ignore, error: ignore };

const oldSession: SavedSession = {
  workspaces: [
    { id: workspaceId(1), root: '/work', label: 'work', tabIds: [tabId(1)], activeTabId: tabId(1) },
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
};

// The child saves the session one pane number later.
const newSession: SavedSession = { ...oldSession, nextPaneNumber: 3 };

const boundaries: [string, SavedSession][] = [
  ['written', oldSession],
  ['synced', oldSession],
  ['renamed', newSession],
  ['beforeFolderSync', newSession],
];

// Saves the old session, then kills a child with SIGKILL while its save of the new session pauses
// at the boundary. Returns what the child printed and what the session file then holds.
const killedAt = async (directory: string, boundary: string) => {
  const folder = join(directory, boundary);
  const path = join(folder, 'session.json');

  await mkdir(folder);
  await createSessionWriter(path, log).stopSaving(oldSession);

  const child = Bun.spawn(['bun', join(import.meta.dir, 'sessionWriterChild.ts'), path, boundary], {
    stdout: 'pipe',
    stderr: 'inherit',
  });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  const decoder = new TextDecoder();
  let output = '';

  const reading = (async () => {
    for await (const chunk of child.stdout) {
      output += decoder.decode(chunk);
    }
  })();

  await waitFor(() => output.includes('\n') || child.exitCode !== null);
  child.kill('SIGKILL');
  await Promise.all([child.exited, reading]);

  return { output, saved: await readSessionFile(path) };
};

it('keeps a complete session when the writer is killed at each boundary of a save', async () => {
  const directory = await temporaryDirectory();
  const results = await Promise.all(boundaries.map(([boundary]) => killedAt(directory, boundary)));

  expect(results).toEqual(
    boundaries.map(([boundary, session]) => ({
      output: `paused ${boundary}\n`,
      saved: { kind: 'restored', session },
    })),
  );
});
