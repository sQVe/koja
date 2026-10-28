import { expect, it } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { invariant } from '../invariant.ts';
import { isSavedSessionFile, readPiSessionFile } from './piSessionFile.ts';
import type { PiSessionFile } from './piSessionFile.ts';
import { sessionDirectory, snapshotsAround, writePiSession } from './piSessionFixtures.ts';

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

it('reads the session id, and the id and parent link of each entry, of a pi session', async () => {
  const directory = await sessionDirectory();
  const { sessionFile, sessionId, entryIds } = writePiSession(directory);
  const [first, second] = entryIds;

  invariant(first !== undefined && second !== undefined, 'The session has two entries.');

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({
    status: 'read',
    sessionId,
    linked: true,
    entries: [
      { id: first, parent: { kind: 'root' } },
      { id: second, parent: { kind: 'entry', id: first } },
    ],
  });
});

it('keeps an entry whose parent id is neither a string nor absent with a malformed link', async () => {
  const directory = await sessionDirectory();
  const lines = ['{"type":"session","id":"s"}', '{"id":"b","parentId":7}', '{"id":"a"}'];

  const sessionFile = await writeLines(directory, lines.join('\n'));

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({
    status: 'read',
    sessionId: 's',
    linked: false,
    entries: [
      { id: 'b', parent: { kind: 'malformed' } },
      { id: 'a', parent: { kind: 'root' } },
    ],
  });
});

it.each([
  ['no version', '{"type":"session","id":"s"}', false],
  ['version 1', '{"type":"session","version":1,"id":"s"}', false],
  ['version 2', '{"type":"session","version":2,"id":"s"}', true],
  ['a null version', '{"type":"session","version":null,"id":"s"}', false],
  ['version "1" as text', '{"type":"session","version":"1","id":"s"}', false],
  ['version "3" as text', '{"type":"session","version":"3","id":"s"}', true],
  ['a version that is not a number', '{"type":"session","version":"oops","id":"s"}', true],
  ['an object as its version', '{"type":"session","version":{},"id":"s"}', true],
])(
  'reads a header with %s as linked unless pi relinks it below version 2',
  async (_name, header, linked) => {
    const directory = await sessionDirectory();
    const sessionFile = await writeLines(directory, `${header}\n{"id":"a"}`);

    expect(await readInDirectory(directory, sessionFile)).toMatchObject({ status: 'read', linked });
  },
);

it('reads an empty entry id as no id, as pi does', async () => {
  const directory = await sessionDirectory();
  const sessionFile = await writeLines(directory, '{"type":"session","id":"s"}\n{"id":""}');

  expect(await readInDirectory(directory, sessionFile)).toMatchObject({
    entries: [{ id: undefined }],
  });
});

it('reads an empty parent id as a root, as pi does', async () => {
  const directory = await sessionDirectory();
  const lines = ['{"type":"session","id":"s"}', '{"id":"a","parentId":""}'];

  const sessionFile = await writeLines(directory, lines.join('\n'));

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({
    status: 'read',
    sessionId: 's',
    linked: false,
    entries: [{ id: 'a', parent: { kind: 'root' } }],
  });
});

it('skips blank, unparsable, and falsy lines, and a later session header', async () => {
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
    '{"type":"session","id":"t"}',
    '{"id":"a"}',
    '{"id":',
  ];

  const sessionFile = await writeLines(directory, lines.join('\n'));

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({
    status: 'read',
    sessionId: 's',
    linked: false,
    entries: [{ id: 'a', parent: { kind: 'root' } }],
  });
});

it('keeps a truthy value without an id as an entry without an id, as pi indexes it', async () => {
  const directory = await sessionDirectory();
  const lines = ['{"type":"session","id":"s"}', '7', '{"type":"label"}', '{"id":"a"}'];

  const sessionFile = await writeLines(directory, lines.join('\n'));

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({
    status: 'read',
    sessionId: 's',
    linked: false,
    entries: [
      { id: undefined, parent: { kind: 'root' } },
      { id: undefined, parent: { kind: 'root' } },
      { id: 'a', parent: { kind: 'root' } },
    ],
  });
});

it('leaves an unterminated last line as it is', async () => {
  const directory = await sessionDirectory();
  const text = '{"type":"session","id":"s"}\n{"id":"a"}';
  const sessionFile = await writeLines(directory, text);

  const read = await readInDirectory(directory, sessionFile);

  expect(read).toEqual({
    status: 'read',
    sessionId: 's',
    linked: false,
    entries: [{ id: 'a', parent: { kind: 'root' } }],
  });

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

it('fails a path below a regular file as unreadable', async () => {
  const directory = await sessionDirectory();
  const { sessionFile } = writePiSession(directory);

  const read = await readInDirectory(directory, join(sessionFile, 'child.jsonl'));

  expect(read).toEqual({ status: 'failed', reason: 'unreadable' });
});

it('counts only an existing regular file at an absolute path as a saved session file', async () => {
  const directory = await sessionDirectory();
  const { sessionFile } = writePiSession(directory);

  expect(isSavedSessionFile(sessionFile)).toBe(true);
  expect(isSavedSessionFile(relative(process.cwd(), sessionFile))).toBe(false);
  expect(isSavedSessionFile(directory)).toBe(false);
  expect(isSavedSessionFile(join(directory, 'missing.jsonl'))).toBe(false);
  expect(isSavedSessionFile(join(sessionFile, 'child.jsonl'))).toBe(false);
});
