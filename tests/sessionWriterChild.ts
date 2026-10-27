// Saves the session one pane number later, and pauses at a boundary of the write so the parent can
// kill it there. Usage: bun tests/sessionWriterChild.ts <session path> <boundary>
import { spyOn } from 'bun:test';
import * as fsPromises from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Log } from '../src/server/log.ts';
import { readSessionFile } from '../src/server/sessionFile.ts';
import { createSessionWriter } from '../src/server/sessionWriter.ts';

const [path, boundary] = process.argv.slice(2);

if (path === undefined || boundary === undefined) {
  throw new Error('Usage: sessionWriterChild.ts <session path> <boundary>');
}

const ignore = (): void => {};

const log: Log = { debug: ignore, info: ignore, warn: ignore, error: ignore };

// Never resolves, and keeps the process alive until the parent kills it.
const pause = async (at: string): Promise<never> => {
  setInterval(ignore, 60_000);
  process.stdout.write(`paused ${at}\n`);

  return new Promise<never>(ignore);
};

const realOpen = fsPromises.open;
const realRename = fsPromises.rename;

spyOn(fsPromises, 'open').mockImplementation(async (...args: Parameters<typeof realOpen>) => {
  const handle = await realOpen(...args);
  const realSync = handle.sync.bind(handle);
  const opened = String(args[0]);

  handle.sync = async () => {
    if (opened === `${path}.tmp` && boundary === 'written') {
      await pause(boundary);
    }

    if (opened === dirname(path) && boundary === 'beforeFolderSync') {
      await pause(boundary);
    }

    await realSync();

    if (opened === `${path}.tmp` && boundary === 'synced') {
      await pause(boundary);
    }
  };

  return handle;
});

spyOn(fsPromises, 'rename').mockImplementation(async (...args: Parameters<typeof realRename>) => {
  await realRename(...args);

  if (boundary === 'renamed') {
    await pause(boundary);
  }
});

const saved = await readSessionFile(path);

if (saved.kind !== 'restored') {
  throw new Error(`Cannot read the old session: ${saved.kind}`);
}

const session = { ...saved.session, nextPaneNumber: saved.session.nextPaneNumber + 1 };

await createSessionWriter(path, log, undefined).stopSaving(session);

throw new Error(`The write never reached the boundary ${boundary}.`);
