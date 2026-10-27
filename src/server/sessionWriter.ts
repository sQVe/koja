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
  save: (session: SavedSession) => void;
  stopSaving: (session: SavedSession) => Promise<SaveResult>;
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
    await handle.chmod(fileMode);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const syncFolder = async (folder: string): Promise<void> => {
  const handle = await open(folder, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const createdFolders = (firstCreated: string, innermost: string): string[] =>
  innermost === firstCreated
    ? [firstCreated]
    : [...createdFolders(firstCreated, dirname(innermost)), innermost];

const createFolder = async (folder: string): Promise<void> => {
  const firstCreated = await mkdir(folder, { recursive: true, mode: directoryMode });

  if (firstCreated === undefined) {
    return;
  }

  const parents = createdFolders(firstCreated, folder).map((created) => dirname(created));

  await Promise.all(parents.map(syncFolder));
};

const attempt = async (step: () => Promise<unknown>): Promise<SaveResult> => {
  try {
    await step();

    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
};

const replaceFile = async (path: string, text: string): Promise<SaveResult> => {
  const temporaryPath = `${path}.tmp`;

  const placed = await attempt(async () => {
    await createFolder(dirname(path));
    await rm(temporaryPath, { force: true });
    await writeTemporaryFile(temporaryPath, text);
    await rename(temporaryPath, path);
  });

  if (!placed.ok) {
    await attempt(() => rm(temporaryPath));

    return placed;
  }

  return attempt(() => syncFolder(dirname(path)));
};

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
    await attempt(() => rm(preservedPath, { force: true }));
  }

  return copied;
};

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
