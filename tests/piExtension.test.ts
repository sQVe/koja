import { expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SessionManager } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };
import { root } from './cliHarness.ts';
import { pollUntil, readJson, setup } from './paneHarness.ts';
import type { PaneSetup } from './paneHarness.ts';

interface PiStart {
  extension: boolean;
  workerRecord?: string;
  sessionFile?: string;
}

interface PiDirectories {
  agent: string;
  sessions: string;
  home: string;
}

interface ScreenRead {
  current: string[];
  unchanged: boolean;
}

// Each test starts a Koja server and one or two pi processes in a pane.
const piTestTimeoutMs = 60_000;

const piBinary = join(root, 'node_modules/.bin/pi');
const extension = join(root, 'extensions/pi/koja.ts');
const pinnedPiVersion = packageJson.devDependencies['@earendil-works/pi-coding-agent'];

const testProvider = 'koja-test';
const testModel = 'fake-model';
const testThinkingLevel = 'low';
const footerEnd = `${testModel} • ${testThinkingLevel}`;

const piStatusSchema = z.object({
  pane: z.string(),
  pi: z
    .object({
      state: z.string(),
      recoveryEligible: z.boolean(),
      piVersion: z.string().optional(),
      sessionId: z.string().nullable().optional(),
      sessionFile: z.string().nullable().optional(),
      leafId: z.string().nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      thinkingLevel: z.string().optional(),
      ownership: z.string().optional(),
    })
    .nullable(),
});

type PiStatus = z.infer<typeof piStatusSchema>;

const processInfoSchema = z.object({
  shell_pid: z.number(),
  foreground_processes: z.array(z.object({ pid: z.number() })),
});

const sessionLineSchema = z.object({ type: z.string(), id: z.string() });

// The provider points at a closed port, and no test sends a prompt, so pi never calls it.
const piDirectories = async (
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

const extensionFlags = (start: PiStart): string[] =>
  start.extension ? ['-e', quote(extension)] : [];

const sessionFlags = (start: PiStart): string[] =>
  start.sessionFile === undefined ? [] : ['--session', quote(start.sessionFile)];

// The pane inherits the test's environment, which may come from a Tau worker or a user's pi.
const piCommand = (directories: PiDirectories, start: PiStart): string => {
  const environment = [
    'env',
    '-u',
    'TAU_WORKER_RECORD',
    `HOME=${quote(directories.home)}`,
    `PI_CODING_AGENT_DIR=${quote(directories.agent)}`,
    ...workerRecordAssignment(start),
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

const send = async (pane: PaneSetup, text: string): Promise<void> => {
  const sent = await pane.koja('pane', 'send', text);

  expect({ exitCode: sent.exitCode, stderr: sent.stderr }).toEqual({ exitCode: 0, stderr: '' });
};

const piStatus = async (pane: PaneSetup): Promise<PiStatus> => {
  const status = await pane.koja('pi', 'status', pane.first, '--json');

  expect({ exitCode: status.exitCode, stderr: status.stderr }).toEqual({ exitCode: 0, stderr: '' });

  return piStatusSchema.parse(JSON.parse(status.stdout));
};

const waitForPi = (pane: PaneSetup, state: string | null): Promise<PiStatus> =>
  pollUntil(
    () => piStatus(pane),
    (status) => (status.pi?.state ?? null) === state,
  );

const processInfo = async (pane: PaneSetup) => {
  const info = await pane.koja('pane', 'process-info', pane.first);

  expect(info.exitCode).toBe(0);

  return processInfoSchema.parse(JSON.parse(info.stdout));
};

const onlyShellRuns = (info: z.infer<typeof processInfoSchema>): boolean =>
  info.foreground_processes.map((process) => process.pid).join(',') === String(info.shell_pid);

const visibleLines = async (pane: PaneSetup): Promise<string[]> =>
  (await readJson(pane.koja, pane.first, '--lines', '30')).lines;

// Pi has drawn its editor and footer once the footer shows the model, and two equal reads show
// that nothing else is still drawing.
const isSettledReady = ({ current, unchanged }: ScreenRead): boolean =>
  unchanged && (current.at(-1)?.endsWith(footerEnd) ?? false);

// `pollUntil` returns its last read after a timeout, so the check repeats here.
const settledScreen = async (pane: PaneSetup): Promise<string[]> => {
  let previous: string[] = [];

  const settled = await pollUntil(async () => {
    const current = await visibleLines(pane);
    const unchanged = current.join('\n') === previous.join('\n');

    previous = current;

    return { current, unchanged };
  }, isSettledReady);

  expect({ ready: isSettledReady(settled), screen: settled.current }).toEqual({
    ready: true,
    screen: settled.current,
  });

  return settled.current;
};

const lastEntryIdOf = async (sessionFile: string): Promise<string | undefined> => {
  const lines = (await readFile(sessionFile, 'utf8')).trim().split('\n');
  const last = lines.at(-1);

  return last === undefined ? undefined : sessionLineSchema.parse(JSON.parse(last)).id;
};

const headerIdOf = async (sessionFile: string): Promise<string | undefined> => {
  const [first] = (await readFile(sessionFile, 'utf8')).split('\n');

  return first === undefined ? undefined : sessionLineSchema.parse(JSON.parse(first)).id;
};

// Pi writes a session file only once it holds a message, so the test writes one with pi's own
// session manager and opens it.
const savedConversation = (pane: PaneSetup, directories: PiDirectories): string => {
  const session = SessionManager.create(join(pane.directory, 'work'), directories.sessions);

  session.appendMessage({ role: 'user', content: 'hello', timestamp: Date.now() });

  const sessionFile = session.getSessionFile();

  expect(sessionFile).toBeDefined();

  return sessionFile ?? '';
};

// Two user replies to one first message give pi's tree two branches, with the second selected.
const branchedConversation = (pane: PaneSetup, directories: PiDirectories): string => {
  const session = SessionManager.create(join(pane.directory, 'work'), directories.sessions);
  const first = session.appendMessage({ role: 'user', content: 'first', timestamp: Date.now() });

  session.appendMessage({ role: 'user', content: 'branch one', timestamp: Date.now() });
  session.branch(first);
  session.appendMessage({ role: 'user', content: 'branch two', timestamp: Date.now() });

  const sessionFile = session.getSessionFile();

  expect(sessionFile).toBeDefined();

  return sessionFile ?? '';
};

const showsLine = async (pane: PaneSetup, line: string): Promise<boolean> => {
  const shown = await pollUntil(
    () => visibleLines(pane),
    (lines) => lines.includes(line),
  );

  return shown.includes(line);
};

it(
  'reports the exact conversation of pi in the pane until pi switches it and quits',
  async () => {
    const pane = await setup();
    const directories = await piDirectories(pane.directory);
    const conversation = savedConversation(pane, directories);

    await send(pane, piCommand(directories, { extension: true, sessionFile: conversation }));

    const { pi } = await waitForPi(pane, 'reported');

    expect(existsSync(conversation)).toBe(true);

    expect(pi).toEqual({
      state: 'reported',
      recoveryEligible: false,
      piVersion: pinnedPiVersion,
      sessionId: await headerIdOf(conversation),
      sessionFile: conversation,
      leafId: await lastEntryIdOf(conversation),
      provider: testProvider,
      model: testModel,
      thinkingLevel: testThinkingLevel,
      ownership: 'interactive',
    });

    await send(pane, '/new\r');

    expect((await waitForPi(pane, 'changed')).pi).toEqual({
      state: 'changed',
      recoveryEligible: false,
    });

    await send(pane, '/quit\r');

    expect((await waitForPi(pane, null)).pi).toBeNull();
    expect(onlyShellRuns(await pollUntil(() => processInfo(pane), onlyShellRuns))).toBe(true);
    expect((await pane.list()).map((listed) => listed.lifecycle)).toEqual(['running']);
  },
  piTestTimeoutMs,
);

it(
  'reports a pi in a Tau worker pane and draws nothing on its screen',
  async () => {
    const pane = await setup();

    // Without quiet startup, pi itself lists each loaded extension's file name.
    const directories = await piDirectories(pane.directory, { quietStartup: true });

    await send(pane, piCommand(directories, { extension: false }));

    const withoutExtension = await settledScreen(pane);

    await send(pane, '/quit\r');
    await pollUntil(() => processInfo(pane), onlyShellRuns);
    await send(pane, piCommand(directories, { extension: true, workerRecord: 'worker-1' }));

    const { pi } = await waitForPi(pane, 'reported');

    expect(pi?.ownership).toBe('tauWorker');
    expect(await settledScreen(pane)).toEqual(withoutExtension);
  },
  piTestTimeoutMs,
);

it(
  'shows a changed conversation after pi selects another branch in its tree',
  async () => {
    const pane = await setup();

    // Without this setting, pi asks whether to summarize the branch it leaves.
    const directories = await piDirectories(pane.directory, {
      branchSummary: { skipPrompt: true },
    });

    const conversation = branchedConversation(pane, directories);

    await send(pane, piCommand(directories, { extension: true, sessionFile: conversation }));

    expect((await waitForPi(pane, 'reported')).pi?.leafId).toBe(await lastEntryIdOf(conversation));

    await send(pane, '/tree\r');

    expect(await showsLine(pane, '› ├─ • user: branch two')).toBe(true);

    await send(pane, '\u001B[B');

    expect(await showsLine(pane, '› └─ user: branch one')).toBe(true);

    await send(pane, '\r');

    expect((await waitForPi(pane, 'changed')).pi).toEqual({
      state: 'changed',
      recoveryEligible: false,
    });
  },
  piTestTimeoutMs,
);
