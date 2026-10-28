import { expect, it } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readPiSessionFile } from './piSessionFile.ts';
import type { PiSessionFile } from './piSessionFile.ts';
import { sessionDirectory, snapshotsAround, writePiSession } from './piSessionFixture.ts';

// Reads the file and expects its directory unchanged.
const readInDirectory = async (directory: string, sessionFile: string): Promise<PiSessionFile> => {
  const { result, before, after } = await snapshotsAround(directory, () =>
    readPiSessionFile(sessionFile),
  );

  expect(after).toEqual(before);

  return result;
};

const writeLines = async (directory: string, text: string): Promise<string> => {
  const sessionFile = join(directory, 'session.jsonl');

  await writeFile(sessionFile, text);

  return sessionFile;
};

it('reads the session id and entry ids of a pi session', async () => {
  const directory = await sessionDirectory();
  const { sessionFile, sessionId, entryIds } = writePiSession(directory);

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'read', sessionId, entryIds: new Set(entryIds) });
});

it('skips blank and malformed lines before and after the header', async () => {
  const directory = await sessionDirectory();

  const lines = [
    '',
    '{oops',
    'null',
    '0',
    'false',
    '""',
    '{"type":"session","id":"s"}',
    '  ',
    '7',
    '{"type":"label"}',
    '{"id":"a"}',
    '{"id":',
  ];

  const sessionFile = await writeLines(directory, lines.join('\n'));

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'read', sessionId: 's', entryIds: new Set(['a']) });
});

it('leaves an unterminated last line as it is', async () => {
  const directory = await sessionDirectory();
  const text = '{"type":"session","id":"s"}\n{"id":"a"}';
  const sessionFile = await writeLines(directory, text);

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'read', sessionId: 's', entryIds: new Set(['a']) });
  expect(await Bun.file(sessionFile).text()).toBe(text);
});

it('fails a missing file without creating it', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'missing.jsonl');

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'failed', reason: 'missing' });
  expect(await Bun.file(sessionFile).exists()).toBe(false);
});

it('fails an empty file and leaves it empty', async () => {
  const directory = await sessionDirectory();
  const sessionFile = await writeLines(directory, '');

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'failed', reason: 'empty' });
  expect(await Bun.file(sessionFile).text()).toBe('');
});

it('fails a path it cannot read', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'folder.jsonl');

  await mkdir(sessionFile);

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'failed', reason: 'unreadable' });
});

it('fails a path that is a FIFO without opening it', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'pipe.jsonl');

  const mkfifo = Bun.spawn(['mkfifo', sessionFile]);

  expect(await mkfifo.exited).toBe(0);

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'failed', reason: 'unreadable' });
});

it.each([
  ['no parsed entry', '\n{oops\n\n'],
  [
    'a first entry that is not a session',
    '{"type":"message","id":"a"}\n{"type":"session","id":"s"}\n',
  ],
  ['a session header without a string id', '{"type":"session","id":7}\n{"id":"a"}\n'],
])('fails a file with %s as not a pi session', async (_name, text) => {
  const directory = await sessionDirectory();
  const sessionFile = await writeLines(directory, text);

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({ status: 'failed', reason: 'notPiSession' });
});
