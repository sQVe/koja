import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { SavedSession } from '../store/store.ts';
import type { Log } from './log.ts';
import { isMissing, serialized } from './sessionFile.ts';

type SaveResult = { ok: true } | { ok: false; message: string };

type UnusableKind = 'broken' | 'newer';

type Preservation =
  | { ok: true; preservedPath: string | undefined }
  | { ok: false; message: string };

export interface SessionWriter {
  // Writes the session after the running write, unless a newer save replaces it first.
  save: (session: SavedSession) => void;
  // Waits for the running write, writes the session, and ignores every later save.
  stopSaving: (session: SavedSession) => Promise<SaveResult>;
  // Resolves once no write runs or waits.
  settled: () => Promise<void>;
}

const directoryMode = 0o700;

const fileMode = 0o600;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isExisting = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'EEXIST';

const writeTemporaryFile = async (temporaryPath: string, text: string): Promise<void> => {
  const handle = await open(temporaryPath, 'wx', fileMode);

  try {
    await handle.writeFile(text);
    // The umask can narrow the creation mode, and the owner must still read the file.
    await handle.chmod(fileMode);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

// The rename lasts through a power loss only once the folder that holds the file is synced.
const syncFolder = async (folder: string): Promise<void> => {
  const handle = await open(folder, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const attempt = async (step: () => Promise<unknown>): Promise<SaveResult> => {
  try {
    await step();

    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
};

// The session file always holds a complete session, the old one until the rename and the new one
// after it.
const replaceFile = async (path: string, text: string): Promise<SaveResult> => {
  const temporaryPath = `${path}.tmp`;

  const placed = await attempt(async () => {
    await mkdir(dirname(path), { recursive: true, mode: directoryMode });
    await rm(temporaryPath, { force: true });
    await writeTemporaryFile(temporaryPath, text);
    await rename(temporaryPath, path);
  });

  if (!placed.ok) {
    // The next save removes a temporary file this removal leaves behind.
    await attempt(() => rm(temporaryPath));

    return placed;
  }

  return attempt(() => syncFolder(dirname(path)));
};

// Writes the copy into a new owner-only file. A file that is not created here is never removed.
const writePreservedFile = async (
  preservedPath: string,
  original: Buffer,
): Promise<SaveResult | 'taken'> => {
  let handle: FileHandle;

  try {
    handle = await open(preservedPath, 'wx', fileMode);
  } catch (error) {
    if (isExisting(error)) {
      return 'taken';
    }

    return { ok: false, message: describeError(error) };
  }

  const copied = await attempt(async () => {
    try {
      await handle.writeFile(original);
      // The umask can narrow the creation mode, and the owner must still read the file.
      await handle.chmod(fileMode);
      await handle.sync();
    } finally {
      await handle.close();
    }

    await syncFolder(dirname(preservedPath));
  });

  if (!copied.ok) {
    // The attempt created this file, so a partial copy must not stay under its name.
    await attempt(() => rm(preservedPath, { force: true }));
  }

  return copied;
};

// Tries each number from the given one up, so an earlier preserved file is never replaced.
const copyToFreeName = async (
  path: string,
  kind: UnusableKind,
  original: Buffer,
  number: number,
): Promise<Preservation> => {
  const preservedPath = `${path}.${kind}-${number}`;
  const written = await writePreservedFile(preservedPath, original);

  if (written === 'taken') {
    return copyToFreeName(path, kind, original, number + 1);
  }

  if (!written.ok) {
    return written;
  }

  return { ok: true, preservedPath };
};

// A file that is gone when the first save runs has nothing to preserve.
const preserveUnusableFile = async (path: string, kind: UnusableKind): Promise<Preservation> => {
  let original: Buffer;

  try {
    original = await readFile(path);
  } catch (error) {
    if (isMissing(error)) {
      return { ok: true, preservedPath: undefined };
    }

    return { ok: false, message: describeError(error) };
  }

  return copyToFreeName(path, kind, original, 1);
};

// Writes one file at a time and keeps only the newest session that waits. A file the startup read
// found broken or newer is copied before the first save replaces it.
export const createSessionWriter = (
  path: string,
  log: Log,
  unusableKind: UnusableKind | undefined,
): SessionWriter => {
  let running: Promise<void> | undefined;
  let waiting: SavedSession | undefined;
  let stopped = false;
  let unpreserved = unusableKind;

  const preserve = async (): Promise<SaveResult> => {
    if (unpreserved === undefined) {
      return { ok: true };
    }

    const preservation = await preserveUnusableFile(path, unpreserved);

    if (!preservation.ok) {
      return preservation;
    }

    unpreserved = undefined;

    if (preservation.preservedPath !== undefined) {
      log.warn('Preserved the unusable session file.', {
        path,
        preservedPath: preservation.preservedPath,
      });
    }

    return { ok: true };
  };

  const saveSession = async (session: SavedSession): Promise<SaveResult> => {
    const preserved = await preserve();

    if (!preserved.ok) {
      return preserved;
    }

    return replaceFile(path, serialized(session));
  };

  const write = async (session: SavedSession): Promise<SaveResult> => {
    const result = await saveSession(session);

    if (result.ok) {
      return result;
    }

    log.error('Cannot save the session.', { path, error: result.message });

    return { ok: false, message: `Cannot save the session to ${path}: ${result.message}` };
  };

  const drain = async (): Promise<void> => {
    const next = waiting;

    if (next === undefined) {
      running = undefined;

      return;
    }

    waiting = undefined;
    await write(next);
    await drain();
  };

  const save = (session: SavedSession): void => {
    if (stopped) {
      return;
    }

    waiting = session;
    running ??= drain();
  };

  const stopSaving = async (session: SavedSession): Promise<SaveResult> => {
    stopped = true;
    waiting = undefined;
    await running;

    return write(session);
  };

  const settled = async (): Promise<void> => {
    await running;
  };

  return { save, stopSaving, settled };
};
