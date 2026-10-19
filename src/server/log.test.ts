import { expect, it, onTestFinished } from 'bun:test';
import { readdirSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { createLog, logPathFor } from './log.ts';
import type { Log } from './log.ts';

const messageSchema = z.object({ message: z.string() });

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-log-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
};

const openLog = (path: string, now: () => number, limitBytes?: number): Log => {
  const created = createLog(path, now, limitBytes);

  if (!created.ok) {
    throw new Error(created.message);
  }

  return created.log;
};

const readLines = async (path: string): Promise<unknown[]> => {
  const text = await readFile(path, 'utf8');

  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
};

const readMessages = async (path: string): Promise<string[]> => {
  const lines = await readLines(path);

  return lines.map((line) => messageSchema.parse(line).message);
};

it('places the log in the XDG state directory', () => {
  expect(logPathFor('/home/user/state', '/home/user')).toBe('/home/user/state/koja/server.log');
});

it('places the log in ~/.local/state without an XDG state directory', () => {
  expect(logPathFor(undefined, '/home/user')).toBe('/home/user/.local/state/koja/server.log');
  expect(logPathFor('relative', '/home/user')).toBe('/home/user/.local/state/koja/server.log');
});

it('writes each entry as a JSON line with its time, level, message, and fields', async () => {
  const path = join(await temporaryDirectory(), 'koja', 'server.log');
  const log = openLog(path, () => Date.UTC(2026, 9, 5, 8, 0, 0));

  log.info('server started', { socket: '/run/koja.sock' });
  log.error('pane failed', { pane: 'pane-1', code: 2 });

  expect(await readLines(path)).toEqual([
    {
      time: '2026-10-05T08:00:00.000Z',
      level: 'info',
      message: 'server started',
      fields: { socket: '/run/koja.sock' },
    },
    {
      time: '2026-10-05T08:00:00.000Z',
      level: 'error',
      message: 'pane failed',
      fields: { pane: 'pane-1', code: 2 },
    },
  ]);
});

it('rotates at the size limit and keeps exactly one old file', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'server.log');
  // Each line is 82 bytes, so two lines fit under the limit and a third rotates the log.
  const limitBytes = 200;
  const log = openLog(path, () => 0, limitBytes);

  for (const message of ['line 1', 'line 2', 'line 3', 'line 4', 'line 5']) {
    log.info(message);
  }

  expect((await readdir(directory)).toSorted()).toEqual(['server.log', 'server.log.1']);
  expect(await readMessages(`${path}.1`)).toEqual(['line 3', 'line 4']);
  expect(await readMessages(path)).toEqual(['line 5']);
  expect((await stat(`${path}.1`)).size).toBeLessThanOrEqual(limitBytes);
});

it('refuses a log path it cannot write under', async () => {
  const blocker = join(await temporaryDirectory(), 'state');
  await writeFile(blocker, 'not a directory');

  const result = createLog(join(blocker, 'koja', 'server.log'), Date.now);

  expect(result).toMatchObject({ ok: false, reason: 'logUnavailable' });
  expect(await readFile(blocker, 'utf8')).toBe('not a directory');
});

it('does not rotate an empty log for one line over the limit', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'server.log');
  const log = openLog(path, () => 0, 10);

  log.info('a line longer than the limit');

  expect(await readdir(directory)).toEqual(['server.log']);
  expect(await readMessages(path)).toEqual(['a line longer than the limit']);
});

it('keeps a line that takes the log exactly to the limit', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'server.log');
  const log = openLog(path, () => 0, 164);

  log.info('line 1');
  log.info('line 2');

  expect((await stat(path)).size).toBe(164);
  expect(await readdir(directory)).toEqual(['server.log']);

  log.info('line 3');

  expect(await readMessages(`${path}.1`)).toEqual(['line 1', 'line 2']);
  expect(await readMessages(path)).toEqual(['line 3']);
});

it('creates the log and its rotated successor readable by the owner only', async () => {
  const path = join(await temporaryDirectory(), 'server.log');
  const log = openLog(path, () => 0, 100);

  expect((await stat(path)).mode & 0o777).toBe(0o600);

  log.info('line 1');
  log.info('line 2');

  expect(await readMessages(`${path}.1`)).toEqual(['line 1']);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

it('leaves no file descriptor open after it creates the log', async () => {
  const path = join(await temporaryDirectory(), 'server.log');
  const before = readdirSync('/proc/self/fd').length;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    openLog(path, () => 0);
  }

  expect(readdirSync('/proc/self/fd')).toHaveLength(before);
});
