import { onTestFinished } from 'bun:test';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SessionManager } from '@earendil-works/pi-coding-agent';

import { invariant } from '../invariant.ts';

interface PiSession {
  sessionFile: string;
  sessionId: string;
  entryIds: string[];
}

interface FileSnapshot {
  name: string;
  size: number;
  modified: number;
}

export const sessionDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-pi-sessions-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
};

const piSessionFrom = (session: SessionManager, entryIds: string[]): PiSession => {
  const sessionFile = session.getSessionFile();

  invariant(sessionFile !== undefined, 'pi saves a session file.');

  return { sessionFile, sessionId: session.getSessionId(), entryIds };
};

export const writePiSession = (directory: string, messages = ['first', 'second']): PiSession => {
  const session = SessionManager.create(directory, directory);

  const entryIds = messages.map((content) =>
    session.appendMessage({ role: 'user', content, timestamp: Date.now() }),
  );

  return piSessionFrom(session, entryIds);
};

export const writeBranchedPiSession = (directory: string): PiSession => {
  const session = SessionManager.create(directory, directory);
  const first = session.appendMessage({ role: 'user', content: 'first', timestamp: Date.now() });

  const branchOne = session.appendMessage({
    role: 'user',
    content: 'branch one',
    timestamp: Date.now(),
  });

  session.branch(first);

  const branchTwo = session.appendMessage({
    role: 'user',
    content: 'branch two',
    timestamp: Date.now(),
  });

  return piSessionFrom(session, [first, branchOne, branchTwo]);
};

const snapshotOf = async (directory: string): Promise<FileSnapshot[]> => {
  const entries = await readdir(directory);
  const names = entries.toSorted();

  return Promise.all(
    names.map(async (name) => {
      const stats = await stat(join(directory, name));

      return { name, size: stats.size, modified: stats.mtimeMs };
    }),
  );
};

export const snapshotsAround = async <Result>(
  directory: string,
  action: () => Promise<Result>,
): Promise<{ result: Result; before: FileSnapshot[]; after: FileSnapshot[] }> => {
  const before = await snapshotOf(directory);
  const result = await action();
  const after = await snapshotOf(directory);

  return { result, before, after };
};
