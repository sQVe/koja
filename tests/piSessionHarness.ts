import { expect } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SessionManager } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };
import { root } from './cliHarness.ts';
import type { PaneSetup } from './paneHarness.ts';

interface PiStart {
  extension: boolean;
  workerRecord?: string;
  sessionFile?: string;
  binaryPath?: string;
}

interface PiDirectories {
  agent: string;
  sessions: string;
  home: string;
}

interface SavedIdentity {
  sessionId: string | undefined;
  sessionFile: string;
  reportedLeafId: string | undefined;
}

interface BranchedConversation {
  sessionFile: string;
  firstId: string;
}

const piBinary = join(root, 'node_modules/.bin/pi');
const extension = join(root, 'extensions/pi/koja.ts');

export const pinnedPiVersion = packageJson.devDependencies['@earendil-works/pi-coding-agent'];

export const testProvider = 'koja-test';
export const testModel = 'fake-model';
export const testThinkingLevel = 'low';

const sessionLineSchema = z.object({ type: z.string(), id: z.string() });

export const piDirectories = async (
  directory: string,
  settings: Record<string, unknown> = {},
): Promise<PiDirectories> => {
  const directories = {
    agent: join(directory, 'pi-agent'),
    sessions: join(directory, 'pi-sessions'),
    home: join(directory, 'home'),
  };

  await Promise.all(Object.values(directories).map((path) => mkdir(path)));

  const models = {
    providers: {
      [testProvider]: {
        baseUrl: 'http://127.0.0.1:9/v1',
        api: 'openai-completions',
        apiKey: 'unused',
        models: [{ id: testModel, reasoning: true }],
      },
    },
  };

  await writeFile(join(directories.agent, 'models.json'), JSON.stringify(models));
  await writeFile(join(directories.agent, 'settings.json'), JSON.stringify(settings));

  return directories;
};

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

const workerRecordAssignment = (start: PiStart): string[] =>
  start.workerRecord === undefined ? [] : [`TAU_WORKER_RECORD=${quote(start.workerRecord)}`];

const binaryPathAssignment = (start: PiStart): string[] =>
  start.binaryPath === undefined ? [] : [`KOJA_BIN_PATH=${quote(start.binaryPath)}`];

const extensionFlags = (start: PiStart): string[] =>
  start.extension ? ['-e', quote(extension)] : [];

const sessionFlags = (start: PiStart): string[] =>
  start.sessionFile === undefined ? [] : ['--session', quote(start.sessionFile)];

export const piCommand = (directories: PiDirectories, start: PiStart): string => {
  const environment = [
    'env',
    '-u',
    'TAU_WORKER_RECORD',
    `HOME=${quote(directories.home)}`,
    `PI_CODING_AGENT_DIR=${quote(directories.agent)}`,
    ...workerRecordAssignment(start),
    ...binaryPathAssignment(start),
  ];

  const flags = [
    '--offline',
    '-ne',
    ...extensionFlags(start),
    '-ns',
    '-np',
    '-nc',
    '-na',
    '--no-mcp',
    '--session-dir',
    quote(directories.sessions),
    ...sessionFlags(start),
    '--model',
    `${testProvider}/${testModel}`,
    '--thinking',
    testThinkingLevel,
  ];

  return `clear; ${environment.join(' ')} ${quote(piBinary)} ${flags.join(' ')}\n`;
};

export const lastEntryIdOf = async (sessionFile: string): Promise<string | undefined> => {
  const lines = (await readFile(sessionFile, 'utf8')).trim().split('\n');
  const last = lines.at(-1);

  return last === undefined ? undefined : sessionLineSchema.parse(JSON.parse(last)).id;
};

export const headerIdOf = async (sessionFile: string): Promise<string | undefined> => {
  const [first] = (await readFile(sessionFile, 'utf8')).split('\n');

  return first === undefined ? undefined : sessionLineSchema.parse(JSON.parse(first)).id;
};

export const savedIdentityOf = async (sessionFile: string): Promise<SavedIdentity> => ({
  sessionId: await headerIdOf(sessionFile),
  sessionFile,
  reportedLeafId: await lastEntryIdOf(sessionFile),
});

export const savedConversation = (
  pane: PaneSetup,
  directories: PiDirectories,
  messages: string[] = ['hello'],
): string => {
  const session = SessionManager.create(join(pane.directory, 'work'), directories.sessions);

  for (const message of messages) {
    session.appendMessage({ role: 'user', content: message, timestamp: Date.now() });
  }

  const sessionFile = session.getSessionFile();

  expect(sessionFile).toBeDefined();

  return sessionFile ?? '';
};

export const branchedConversation = (
  pane: PaneSetup,
  directories: PiDirectories,
): BranchedConversation => {
  const session = SessionManager.create(join(pane.directory, 'work'), directories.sessions);
  const first = session.appendMessage({ role: 'user', content: 'first', timestamp: Date.now() });

  session.appendMessage({ role: 'user', content: 'branch one', timestamp: Date.now() });
  session.branch(first);
  session.appendMessage({ role: 'user', content: 'branch two', timestamp: Date.now() });

  const sessionFile = session.getSessionFile();

  expect(sessionFile).toBeDefined();

  return { sessionFile: sessionFile ?? '', firstId: first };
};
