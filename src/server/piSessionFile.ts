import { readFile, stat } from 'node:fs/promises';

import { z } from 'zod';

type PiSessionFileFailure = 'missing' | 'empty' | 'unreadable' | 'notPiSession';

export type PiSessionFile =
  | { status: 'read'; sessionId: string; entryIds: ReadonlySet<string> }
  | { status: 'failed'; reason: PiSessionFileFailure };

interface NextEntry {
  entry: unknown;
  next: number;
}

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

const parsedLine = (line: string): unknown => {
  try {
    const value: unknown = JSON.parse(line);

    return falsyValues.has(value) ? undefined : value;
  } catch {
    return undefined;
  }
};

// Finds the first parsed entry at or after start. It skips blank lines before parsing and walks
// the text without an array of its lines, so a file of mostly blank lines stays cheap.
const nextEntryOf = (text: string, start: number): NextEntry | undefined => {
  let lineStart = start;

  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);
    const entry = line.trim() === '' ? undefined : parsedLine(line);

    lineStart = lineEnd + 1;

    if (entry !== undefined) {
      return { entry, next: lineStart };
    }
  }

  return undefined;
};

// Keeps only the header and the entry ids, so each message body is dropped once it parses.
const piSessionOf = (text: string): PiSessionFile => {
  const first = nextEntryOf(text, 0);
  const header = headerSchema.safeParse(first?.entry);

  if (first === undefined || !header.success) {
    return { status: 'failed', reason: 'notPiSession' };
  }

  const entryIds = new Set<string>();
  let current = nextEntryOf(text, first.next);

  while (current !== undefined) {
    const parsed = entrySchema.safeParse(current.entry);

    if (parsed.success) {
      entryIds.add(parsed.data.id);
    }

    current = nextEntryOf(text, current.next);
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
