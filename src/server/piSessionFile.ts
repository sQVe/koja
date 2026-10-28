import { statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { z } from 'zod';

type PiSessionFileFailure = 'missing' | 'empty' | 'unreadable' | 'notPiSession';

export type PiSessionFile =
  | { status: 'read'; sessionId: string; entryIds: ReadonlySet<string> }
  | { status: 'failed'; reason: PiSessionFileFailure };

const headerSchema = z.object({ type: z.literal('session'), id: z.string() });
const entrySchema = z.object({ id: z.string() });

const missingFileSchema = z.object({ code: z.literal('ENOENT') });

const readText = async (
  sessionFile: string,
): Promise<{ text: string } | { failure: 'missing' | 'unreadable' }> => {
  try {
    const stats = await stat(sessionFile);

    if (!stats.isFile()) {
      return { failure: 'unreadable' };
    }

    return { text: await readFile(sessionFile, 'utf8') };
  } catch (error) {
    const missing = missingFileSchema.safeParse(error).success;

    return { failure: missing ? 'missing' : 'unreadable' };
  }
};

const falsyValues = new Set<unknown>([null, false, 0, '']);

// A line that is not JSON reads as null, so it is skipped like a falsy entry.
const parsedLine = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

// Walks the lines one at a time, so a large file never becomes an array of its lines.
const entriesOf = function* (text: string): Generator {
  for (const [line] of text.matchAll(/[^\n]+/g)) {
    const entry = parsedLine(line);

    if (!falsyValues.has(entry)) {
      yield entry;
    }
  }
};

// Keeps only the header and the entry ids, so each message body is dropped once it parses.
const piSessionOf = (text: string): PiSessionFile => {
  const entries = entriesOf(text);
  const header = headerSchema.safeParse(entries.next().value);

  if (!header.success) {
    return { status: 'failed', reason: 'notPiSession' };
  }

  const entryIds = new Set<string>();

  for (const entry of entries) {
    const parsed = entrySchema.safeParse(entry);

    if (parsed.success) {
      entryIds.add(parsed.data.id);
    }
  }

  return { status: 'read', sessionId: header.data.id, entryIds };
};

export const readPiSessionFile = async (sessionFile: string): Promise<PiSessionFile> => {
  const read = await readText(sessionFile);

  if ('failure' in read) {
    return { status: 'failed', reason: read.failure };
  }

  if (read.text === '') {
    return { status: 'failed', reason: 'empty' };
  }

  return piSessionOf(read.text);
};

export const isSavedSessionFile = (path: string): boolean => {
  if (!isAbsolute(path)) {
    return false;
  }

  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};
