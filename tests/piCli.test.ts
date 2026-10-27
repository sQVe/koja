import { expect, it, onTestFinished } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { logPathFor } from '../src/server/log.ts';
import { readStat } from '../src/server/processGroups.ts';
import { cliTestTimeoutMs, environmentFor, root, temporaryDirectory } from './cliHarness.ts';
import type { CliRun } from './cliHarness.ts';
import { pollUntil, readJson, setup } from './paneHarness.ts';
import type { PaneSetup } from './paneHarness.ts';

interface PaneReportOptions {
  processId: string;
  json: boolean;
}

const report = {
  processId: 0,
  piVersion: '1.4.0',
  sessionId: 'conversation-1',
  sessionFile: null,
  leafId: 'leaf-1',
  provider: 'anthropic',
  model: 'claude-opus',
  thinkingLevel: 'high',
  ownership: 'interactive',
  event: { kind: 'start', reason: 'startup' },
  sequence: 1,
};

const conversationFileOf = (pane: PaneSetup): string =>
  join(pane.directory, 'conversation-1.jsonl');

const reportOf = (
  pane: PaneSetup,
  fields: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...report,
  sessionFile: conversationFileOf(pane),
  ...fields,
});

const saveConversation = (pane: PaneSetup): Promise<void> =>
  writeFile(conversationFileOf(pane), '{"type":"session"}\n');

// The identity fields that status shows for a reported or lost pi.
const piFieldsOf = (fields: Record<string, unknown>) => {
  const { processId: _processId, event: _event, sequence: _sequence, leafId, ...identity } = fields;

  return { ...identity, reportedLeafId: leafId };
};

const processInfoSchema = z.object({ shell_pid: z.number() });

const shellPidOf = async (pane: PaneSetup): Promise<number> => {
  const info = await pane.koja('pane', 'process-info', pane.first);

  return processInfoSchema.parse(JSON.parse(info.stdout)).shell_pid;
};

const shellPassOf = async (pane: PaneSetup): Promise<string> => {
  const shellPid = await shellPidOf(pane);
  const environment = (await readFile(`/proc/${shellPid}/environ`, 'utf8')).split('\0');
  const pass = environment.find((entry) => entry.startsWith('KOJA_REPORT_TOKEN='))?.slice(18);

  expect(pass).toMatch(/^[0-9a-f]{64}$/);

  return pass ?? '';
};

// rchar counts the bytes the shell has read, so it rises when the pane receives input.
const inputBytesOf = async (processId: number): Promise<number> => {
  const io = await readFile(`/proc/${processId}/io`, 'utf8');
  const rchar = io.match(/^rchar: (\d+)$/m)?.[1];

  expect(rchar).toBeDefined();

  return Number(rchar);
};

const selfReport: PaneReportOptions = { processId: '$$', json: true };

const reportFromPane = async (
  pane: PaneSetup,
  fields: Record<string, unknown>,
  name: string,
  { processId, json }: PaneReportOptions = selfReport,
): Promise<CliRun> => {
  const template = join(pane.directory, `${name}.json`);
  const output = join(pane.directory, name);

  await writeFile(template, JSON.stringify({ ...fields, processId: 'PROCESS_ID' }));

  const jsonFlag = json ? ' --json' : '';

  const command =
    `sed 's/"PROCESS_ID"/'${processId}'/' '${template}' | '${process.execPath}' '${root}src/index.ts' ` +
    `pi report${jsonFlag} > '${output}.out' 2> '${output}.err'; echo $? > '${output}.exit'\n`;

  expect((await pane.koja('pane', 'send', command)).exitCode).toBe(0);

  await pollUntil(
    () => Promise.resolve(existsSync(`${output}.exit`)),
    (done) => done,
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    readFile(`${output}.exit`, 'utf8'),
    readFile(`${output}.out`, 'utf8'),
    readFile(`${output}.err`, 'utf8'),
  ]);

  return { exitCode: Number(exitCode.trim()), stdout, stderr };
};

const statusJson = async (pane: PaneSetup): Promise<unknown> => {
  const status = await pane.koja('pi', 'status', pane.first, '--json');

  expect({ exitCode: status.exitCode, stderr: status.stderr }).toEqual({ exitCode: 0, stderr: '' });

  return JSON.parse(status.stdout);
};

const piStateSchema = z.object({ pi: z.object({ state: z.string() }).nullable() });

const stateOf = async (pane: PaneSetup): Promise<string | null> =>
  piStateSchema.parse(await statusJson(pane)).pi?.state ?? null;

it(
  'prints no pi for a pane without a report',
  async () => {
    const { koja, first } = await setup();
    const status = await koja('pi', 'status', first, '--json');

    expect(status).toEqual({
      exitCode: 0,
      stdout: `${JSON.stringify({ pane: first, pi: null })}\n`,
      stderr: '',
    });
  },
  cliTestTimeoutMs,
);

it(
  'shows the reported pi, then the conversation a later start report names',
  async () => {
    const pane = await setup();

    expect(await reportFromPane(pane, reportOf(pane), 'first')).toEqual({
      exitCode: 0,
      stdout: '{"ok":true,"status":"recorded"}\n',
      stderr: '',
    });

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: {
        state: 'reported',
        recoveryEligible: false,
        ineligibleReasons: ['sessionNotSaved'],
        ...piFieldsOf(reportOf(pane)),
      },
    });

    const switched = reportOf(pane, { sessionId: 'conversation-2', leafId: 'leaf-2', sequence: 2 });

    expect(await reportFromPane(pane, switched, 'second')).toEqual({
      exitCode: 0,
      stdout: '{"ok":true,"status":"updated"}\n',
      stderr: '',
    });

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: {
        state: 'reported',
        recoveryEligible: false,
        ineligibleReasons: ['sessionNotSaved'],
        ...piFieldsOf(switched),
      },
    });
  },
  cliTestTimeoutMs,
);

it(
  'prints the server refusal for a process outside the pane and keeps the record',
  async () => {
    const pane = await setup();
    const reported = await reportFromPane(pane, reportOf(pane), 'first');

    expect(reported.exitCode).toBe(0);

    const before = await statusJson(pane);

    const outside = { processId: String(process.pid), json: false };
    const refused = await reportFromPane(pane, reportOf(pane), 'outside', outside);

    expect({ exitCode: refused.exitCode, stdout: refused.stdout }).toEqual({
      exitCode: 1,
      stdout: '',
    });

    expect(refused.stderr).toContain('does not run in pane');

    const refusedJson = await reportFromPane(pane, reportOf(pane), 'outside-json', {
      ...outside,
      json: true,
    });

    expect({ exitCode: refusedJson.exitCode, stdout: refusedJson.stdout }).toEqual({
      exitCode: 1,
      stdout: '{"ok":false,"reason":"processNotInPane"}\n',
    });

    expect(await statusJson(pane)).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'keeps the pane pass out of status output and the server log',
  async () => {
    const pane = await setup();
    const pass = await shellPassOf(pane);
    const reported = await reportFromPane(pane, reportOf(pane), 'first');

    expect(reported.exitCode).toBe(0);

    const json = await pane.koja('pi', 'status', pane.first, '--json');
    const text = await pane.koja('pi', 'status', pane.first);
    const socketPath = join(pane.directory, 'run', 'koja.sock');
    const log = await readFile(logPathFor(join(pane.directory, 'state'), '', socketPath), 'utf8');

    expect(text).toEqual({
      exitCode: 0,
      stdout:
        `${pane.first}  pi  reported  ${conversationFileOf(pane)}  anthropic/claude-opus\n` +
        'recovery  not eligible: the session file is not saved yet\n',
      stderr: '',
    });

    const outputs = [json.stdout, json.stderr, text.stdout, text.stderr, reported.stdout, log];

    expect(log).toContain(socketPath);
    expect(outputs.filter((output) => output.includes(pass))).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'prints an eligible reported pi as JSON and text',
  async () => {
    const pane = await setup();

    await saveConversation(pane);

    expect((await reportFromPane(pane, reportOf(pane), 'first')).exitCode).toBe(0);

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: {
        state: 'reported',
        recoveryEligible: true,
        ineligibleReasons: [],
        ...piFieldsOf(reportOf(pane)),
      },
    });

    expect(await pane.koja('pi', 'status', pane.first)).toEqual({
      exitCode: 0,
      stdout:
        `${pane.first}  pi  reported  ${conversationFileOf(pane)}  anthropic/claude-opus\n` +
        'recovery  eligible\n',
      stderr: '',
    });
  },
  cliTestTimeoutMs,
);

it(
  'prints a Tau worker pi as not eligible with the tauWorker reason',
  async () => {
    const pane = await setup();

    await saveConversation(pane);

    const worker = reportOf(pane, { ownership: 'tauWorker' });

    expect((await reportFromPane(pane, worker, 'first')).exitCode).toBe(0);

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: {
        state: 'reported',
        recoveryEligible: false,
        ineligibleReasons: ['tauWorker'],
        ...piFieldsOf(worker),
      },
    });

    expect(await pane.koja('pi', 'status', pane.first)).toEqual({
      exitCode: 0,
      stdout:
        `${pane.first}  pi  reported  ${conversationFileOf(pane)}  anthropic/claude-opus\n` +
        'recovery  not eligible: a Tau worker owns this pi\n',
      stderr: '',
    });
  },
  cliTestTimeoutMs,
);

it(
  'prints a pi whose session file is not saved as not eligible',
  async () => {
    const pane = await setup();

    expect((await reportFromPane(pane, reportOf(pane), 'first')).exitCode).toBe(0);

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: {
        state: 'reported',
        recoveryEligible: false,
        ineligibleReasons: ['sessionNotSaved'],
        ...piFieldsOf(reportOf(pane)),
      },
    });

    expect(await pane.koja('pi', 'status', pane.first)).toEqual({
      exitCode: 0,
      stdout:
        `${pane.first}  pi  reported  ${conversationFileOf(pane)}  anthropic/claude-opus\n` +
        'recovery  not eligible: the session file is not saved yet\n',
      stderr: '',
    });
  },
  cliTestTimeoutMs,
);

it(
  'prints a switching pi without identity and with the switchPending reason',
  async () => {
    const pane = await setup();

    await saveConversation(pane);

    expect((await reportFromPane(pane, reportOf(pane), 'first')).exitCode).toBe(0);

    const shutdown = reportOf(pane, { event: { kind: 'shutdown', reason: 'new' }, sequence: 2 });

    expect((await reportFromPane(pane, shutdown, 'second')).exitCode).toBe(0);

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: { state: 'switching', recoveryEligible: false, ineligibleReasons: ['switchPending'] },
    });

    expect(await pane.koja('pi', 'status', pane.first)).toEqual({
      exitCode: 0,
      stdout: `${pane.first}  pi  switching\nrecovery  not eligible: the conversation is switching\n`,
      stderr: '',
    });
  },
  cliTestTimeoutMs,
);

it(
  'prints a lost pi with its last identity after its process ends without quit',
  async () => {
    const pane = await setup();

    await saveConversation(pane);
    await pane.koja('pane', 'send', 'sleep 300 & sleepPid=$!\n');

    const sleeper = { processId: '$sleepPid', json: true };

    expect((await reportFromPane(pane, reportOf(pane), 'first', sleeper)).exitCode).toBe(0);
    expect(await stateOf(pane)).toBe('reported');

    await pane.koja('pane', 'send', 'kill $sleepPid\n');

    expect(
      await pollUntil(
        () => stateOf(pane),
        (state) => state === 'lost',
      ),
    ).toBe('lost');

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: {
        state: 'lost',
        recoveryEligible: true,
        ineligibleReasons: [],
        ...piFieldsOf(reportOf(pane)),
      },
    });

    expect(await pane.koja('pi', 'status', pane.first)).toEqual({
      exitCode: 0,
      stdout: `${pane.first}  pi  lost  ${conversationFileOf(pane)}  anthropic/claude-opus\nrecovery  eligible\n`,
      stderr: '',
    });
  },
  cliTestTimeoutMs,
);

const paneSnapshotOf = async (pane: PaneSetup, shellPid: number) => ({
  startTime: readStat(String(shellPid))?.startTime,
  rows: (await readJson(pane.koja, pane.first, '--lines', '30')).lines,
  inputBytes: await inputBytesOf(shellPid),
});

it(
  'reads pi status twice without starting, changing, or typing into the live pi pane',
  async () => {
    const pane = await setup();
    const shellPid = await shellPidOf(pane);

    expect((await reportFromPane(pane, reportOf(pane), 'first')).exitCode).toBe(0);

    const before = await paneSnapshotOf(pane, shellPid);

    expect(await stateOf(pane)).toBe('reported');
    expect(await stateOf(pane)).toBe('reported');

    const after = await paneSnapshotOf(pane, shellPid);

    expect(before.startTime).toBeDefined();
    expect(after.startTime).toBe(before.startTime);
    expect(after.rows).toEqual(before.rows);
    expect(after.inputBytes).toBe(before.inputBytes);
  },
  cliTestTimeoutMs,
);

const validPass = 'a'.repeat(64);

const listenerAt = (socketPath: string) => {
  const connections = { count: 0 };

  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      open: () => {
        connections.count += 1;
      },
      data: () => undefined,
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  return connections;
};

const startReport = (
  directory: string,
  input: string,
  environment: Record<string, string | undefined>,
) =>
  Bun.spawn(['bun', join(root, 'src/index.ts'), 'pi', 'report'], {
    cwd: directory,
    env: environment,
    stdin: new TextEncoder().encode(input),
    stdout: 'pipe',
    stderr: 'pipe',
  });

const reportEnvironment = (directory: string, socketPath: string) => ({
  ...environmentFor(directory),
  KOJA_PANE_ID: 'pane-1',
  KOJA_REPORT_TOKEN: validPass,
  KOJA_SOCKET_PATH: socketPath,
});

it(
  'connects to the pane socket for a valid report',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'koja.sock');
    const connections = listenerAt(socketPath);

    const child = startReport(
      directory,
      JSON.stringify({ ...report, processId: 1 }),
      reportEnvironment(directory, socketPath),
    );

    onTestFinished(() => {
      child.kill();
    });

    const connected = await pollUntil(
      () => Promise.resolve(connections.count),
      (count) => count > 0,
    );

    expect(connected).toBe(1);
  },
  cliTestTimeoutMs,
);

it.each([
  ['invalid JSON', '{"processId":', {}, 'The report on stdin is not valid JSON.'],
  [
    'an oversized field',
    JSON.stringify({ ...report, processId: 1, piVersion: 'x'.repeat(65) }),
    {},
    'The report on stdin is not a valid pi report. piVersion:',
  ],
  [
    'a missing KOJA_REPORT_TOKEN',
    JSON.stringify({ ...report, processId: 1 }),
    { KOJA_REPORT_TOKEN: undefined },
    'KOJA_REPORT_TOKEN is not set. pi report runs only inside a Koja pane.',
  ],
])(
  'refuses %s before it connects',
  async (_name, input, overrides, message) => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'koja.sock');
    const connections = listenerAt(socketPath);

    const child = startReport(directory, input, {
      ...reportEnvironment(directory, socketPath),
      ...overrides,
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: '' });
    expect(stderr).toContain(message);
    expect(stderr).not.toContain(validPass);
    expect(connections.count).toBe(0);
  },
  cliTestTimeoutMs,
);
