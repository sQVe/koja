import { expect, it, onTestFinished, spyOn } from 'bun:test';
import * as fsPromises from 'node:fs/promises';
import { chmod, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { paneId, tabId, workspaceId } from '../ids.ts';
import type { SavedSession } from '../store/store.ts';
import type { Log } from './log.ts';
import { readSessionFile } from './sessionFile.ts';
import { createSessionWriter } from './sessionWriter.ts';

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
};

const sessionWith = (overrides: Partial<SavedSession> = {}): SavedSession => ({
  workspaces: [
    {
      id: workspaceId(1),
      root: '/work/one',
      label: 'one',
      tabIds: [tabId(1)],
      activeTabId: tabId(1),
    },
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
  ...overrides,
});

const ignore = (): void => {};

const recordingLog = (): { log: Log; errors: string[] } => {
  const errors: string[] = [];

  return {
    log: {
      debug: ignore,
      info: ignore,
      warn: ignore,
      error: (message) => {
        errors.push(message);
      },
    },
    errors,
  };
};

const savedJson = async (session: SavedSession): Promise<unknown> =>
  JSON.parse(JSON.stringify(session, (_key, value: unknown) => value ?? null));

// Lets a test change each file handle the writer opens, by the path it opened.
const changeHandles = (change: (opened: string, handle: FileHandle) => void): void => {
  const realOpen = fsPromises.open;

  const openSpy = spyOn(fsPromises, 'open').mockImplementation(
    async (...args: Parameters<typeof realOpen>) => {
      const handle = await realOpen(...args);

      change(String(args[0]), handle);

      return handle;
    },
  );

  onTestFinished(() => {
    openSpy.mockRestore();
  });
};

const failing = (message: string) => async (): Promise<never> => {
  throw new Error(message);
};

const failHandle = (path: string, method: 'writeFile' | 'sync', message: string): void => {
  changeHandles((opened, handle) => {
    if (opened === path) {
      handle[method] = failing(message);
    }
  });
};

const failRename = (message: string): void => {
  const renameSpy = spyOn(fsPromises, 'rename').mockImplementation(failing(message));

  onTestFinished(() => {
    renameSpy.mockRestore();
  });
};

const failurePoints: [string, (path: string) => void, string, 'old' | 'new'][] = [
  [
    'the temporary write',
    (path) => {
      failHandle(`${path}.tmp`, 'writeFile', 'No space left.');
    },
    'No space left.',
    'old',
  ],
  [
    'the temporary file sync',
    (path) => {
      failHandle(`${path}.tmp`, 'sync', 'Cannot sync the file.');
    },
    'Cannot sync the file.',
    'old',
  ],
  [
    'the rename',
    () => {
      failRename('Cannot rename.');
    },
    'Cannot rename.',
    'old',
  ],
  [
    'the folder sync',
    (path) => {
      failHandle(dirname(path), 'sync', 'Cannot sync the folder.');
    },
    'Cannot sync the folder.',
    'new',
  ],
];

it.each(failurePoints)(
  'reports a failed save and keeps a complete session when %s fails',
  async (_name, fail, error, kept) => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'session.json');
    const oldSession = sessionWith();
    const newSession = sessionWith({ nextPaneNumber: 9 });
    const keptSession = kept === 'old' ? oldSession : newSession;

    await createSessionWriter(path, recordingLog().log).stopSaving(oldSession);
    fail(path);

    const { log, errors } = recordingLog();
    const result = await createSessionWriter(path, log).stopSaving(newSession);

    expect(result).toEqual({ ok: false, message: expect.stringContaining(error) as string });
    expect(errors.length).toBe(1);
    expect(await readSessionFile(path)).toEqual({ kind: 'restored', session: keptSession });
    expect(await readdir(directory)).toEqual(['session.json']);
  },
);

it('leaves no file open after a save', async () => {
  const directory = await temporaryDirectory();
  const writer = createSessionWriter(join(directory, 'session.json'), recordingLog().log);
  const openBefore = await readdir('/proc/self/fd');

  await writer.stopSaving(sessionWith());

  expect(await readdir('/proc/self/fd')).toEqual(openBefore);
});

it('syncs the temporary file before the rename and the folder after it', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const calls: string[] = [];
  const realRename = fsPromises.rename;

  changeHandles((opened, handle) => {
    const realSync = handle.sync.bind(handle);

    handle.sync = async () => {
      await realSync();
      calls.push(`sync ${opened}`);
    };
  });

  const renameSpy = spyOn(fsPromises, 'rename').mockImplementation(
    async (...args: Parameters<typeof realRename>) => {
      await realRename(...args);
      calls.push('rename');
    },
  );

  onTestFinished(() => {
    renameSpy.mockRestore();
  });

  const result = await createSessionWriter(path, recordingLog().log).stopSaving(sessionWith());

  expect(result).toEqual({ ok: true });
  expect(calls).toEqual([`sync ${path}.tmp`, 'rename', `sync ${directory}`]);
});

// The umask can narrow the mode writeFile creates, so set the world-readable mode explicitly.
const leaveTemporaryFile = async (temporaryPath: string): Promise<void> => {
  await writeFile(temporaryPath, 'left by a crash');
  await chmod(temporaryPath, 0o644);

  expect((await stat(temporaryPath)).mode & 0o777).toBe(0o644);
};

it('writes an owner-only file over a leftover temporary file', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  await leaveTemporaryFile(`${path}.tmp`);
  const writer = createSessionWriter(path, recordingLog().log);

  await writer.stopSaving(sessionWith());

  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

it('reads back the session it saved under a umask that removes owner read', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const session = sessionWith();
  const previousUmask = process.umask(0o477);
  onTestFinished(() => process.umask(previousUmask));
  const writer = createSessionWriter(path, recordingLog().log);

  await writer.stopSaving(session);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

it('creates the temporary file owner-only before the session data lands in it', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const temporaryPath = `${path}.tmp`;
  const previousUmask = process.umask(0o022);
  onTestFinished(() => process.umask(previousUmask));
  const modesWithData: number[] = [];

  changeHandles((opened, handle) => {
    if (opened !== temporaryPath) {
      return;
    }

    const realWriteFile = handle.writeFile.bind(handle);

    handle.writeFile = async (...args: Parameters<typeof realWriteFile>) => {
      await realWriteFile(...args);
      modesWithData.push((await stat(temporaryPath)).mode & 0o777);
    };
  });

  const writer = createSessionWriter(path, recordingLog().log);

  await writer.stopSaving(sessionWith());

  expect(modesWithData).toEqual([0o600]);
});

it('does not write the session into a leftover temporary file another reader holds open', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const temporaryPath = `${path}.tmp`;
  await leaveTemporaryFile(temporaryPath);
  const heldHandle = await open(temporaryPath, 'r');
  onTestFinished(() => heldHandle.close());
  const writer = createSessionWriter(path, recordingLog().log);

  await writer.stopSaving(sessionWith());

  const { bytesRead, buffer } = await heldHandle.read(Buffer.alloc(4096), 0, 4096, 0);

  expect(buffer.subarray(0, bytesRead).toString('utf8')).toBe('left by a crash');
});

it('writes the newest of the saves made during one write', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const writer = createSessionWriter(path, recordingLog().log);
  const sessions = [1, 2, 3, 4].map((number) => sessionWith({ nextPaneNumber: 3 + number }));
  const newest = sessions.at(-1) ?? sessionWith();

  for (const session of sessions) {
    writer.save(session);
  }

  await writer.settled();

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session: newest });
  expect(await readdir(directory)).toEqual(['session.json']);

  await writer.stopSaving(newest);
});

it('does not write the saves a newer save replaced', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const writer = createSessionWriter(path, recordingLog().log);
  const running = sessionWith({ nextPaneNumber: 10 });
  const replaced = sessionWith({ nextPaneNumber: 11 });
  const newest = sessionWith({ nextPaneNumber: 12 });

  writer.save(running);
  writer.save(replaced);
  writer.save(newest);

  await writer.stopSaving(running);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session: running });
});

it('logs a failed write and does not throw', async () => {
  const directory = await temporaryDirectory();
  const blocker = join(directory, 'blocker');
  await writeFile(blocker, 'a file');
  const { log, errors } = recordingLog();
  const writer = createSessionWriter(join(blocker, 'session.json'), log);

  writer.save(sessionWith());
  await writer.stopSaving(sessionWith());

  expect(errors.length).toBe(2);
});

it('ignores a save after stopSaving', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const writer = createSessionWriter(path, recordingLog().log);
  const final = sessionWith();

  await writer.stopSaving(final);
  writer.save(sessionWith({ nextPaneNumber: 50 }));
  await writer.settled();

  expect(await readFile(path, 'utf8')).toBe(
    JSON.stringify({ version: 1, session: await savedJson(final) }),
  );

  expect(await readdir(directory)).toEqual(['session.json']);
});
