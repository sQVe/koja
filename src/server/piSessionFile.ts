import { statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { z } from 'zod';

type PiSessionFileFailure = 'missing' | 'empty' | 'unreadable' | 'notPiSession';

type PiParentLink = { kind: 'root' } | { kind: 'entry'; id: string } | { kind: 'malformed' };

export interface PiSessionEntry {
  id: string | undefined;
  parent: PiParentLink;
}

export type PiSessionFile =
  | { status: 'read'; sessionId: string; linked: boolean; entries: PiSessionEntry[] }
  | { status: 'failed'; reason: PiSessionFileFailure };

const headerSchema = z.object({
  type: z.literal('session'),
  id: z.string(),
  version: z.unknown().optional(),
});

// Pi gives the entries of a file before version 2 new ids and a parent chain in file order when it
// opens it, so their saved links never break the history. Pi decides with `(version ?? 1) < 2`, a
// loose comparison that Number reproduces for every JSON value.
const linkedVersion = 2;

const isLinked = (version: unknown): boolean => !(Number(version ?? 1) < linkedVersion);

// Pi reads these fields loosely, so a value that is not an object has none of them.
const fieldsSchema = z
  .object({ type: z.unknown(), id: z.unknown(), parentId: z.unknown() })
  .partial();

type PiEntryFields = Partial<z.infer<typeof fieldsSchema>>;

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

const fieldsOf = (value: unknown): PiEntryFields => {
  const fields = fieldsSchema.safeParse(value);

  return fields.success ? fields.data : {};
};

// Pi follows a parent only when it is truthy, so a falsy value marks a root.
const parentLinkOf = (parentId: unknown): PiParentLink => {
  if (parentId === undefined || falsyValues.has(parentId)) {
    return { kind: 'root' };
  }

  if (typeof parentId !== 'string') {
    return { kind: 'malformed' };
  }

  return { kind: 'entry', id: parentId };
};

const entryOf = (fields: PiEntryFields): PiSessionEntry => {
  const id = typeof fields.id === 'string' && fields.id !== '' ? fields.id : undefined;

  return { id, parent: parentLinkOf(fields.parentId) };
};

// Keeps the header, then the id and parent link of each later value that pi indexes, so message
// bodies are dropped as they parse.
const piSessionOf = (text: string): PiSessionFile => {
  const entries = entriesOf(text);
  const header = headerSchema.safeParse(entries.next().value);

  if (!header.success) {
    return { status: 'failed', reason: 'notPiSession' };
  }

  const sessionEntries: PiSessionEntry[] = [];

  for (const value of entries) {
    const fields = fieldsOf(value);

    if (fields.type !== 'session') {
      sessionEntries.push(entryOf(fields));
    }
  }

  return {
    status: 'read',
    sessionId: header.data.id,
    linked: isLinked(header.data.version),
    entries: sessionEntries,
  };
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
