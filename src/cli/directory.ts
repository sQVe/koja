import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export type ResolvedFolder =
  | { ok: true; folder: string | undefined }
  | { ok: false; message: string };

export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const status = await stat(path);

    return status.isDirectory();
  } catch {
    return false;
  }
};

export const resolveFolder = async (folder: string | undefined): Promise<ResolvedFolder> => {
  if (folder === undefined) {
    return { ok: true, folder };
  }

  const resolved = resolve(folder);

  return (await isDirectory(resolved))
    ? { ok: true, folder: resolved }
    : { ok: false, message: `${resolved} is not a directory.` };
};
