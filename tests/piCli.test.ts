import { expect, it, onTestFinished } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { logPathFor } from '../src/server/log.ts';
import { cliTestTimeoutMs, environmentFor, root, temporaryDirectory } from './cliHarness.ts';
import type { CliRun } from './cliHarness.ts';
import { pollUntil, setup } from './paneHarness.ts';
import type { PaneSetup } from './paneHarness.ts';

interface PaneReportOptions {
  // A shell expression for the reported process id.
  processId: string;
  json: boolean;
}

const report = {
  processId: 0,
  piVersion: '1.4.0',
  sessionId: 'conversation-1',
  sessionFile: '/tmp/conversation-1.jsonl',
  leafId: 'leaf-1',
  provider: 'anthropic',
  model: 'claude-opus',
  thinkingLevel: 'high',
  ownership: 'interactive',
};

const processInfoSchema = z.object({ shell_pid: z.number() });

const shellPassOf = async (pane: PaneSetup): Promise<string> => {
  const info = await pane.koja('pane', 'process-info', pane.first);
  const { shell_pid: shellPid } = processInfoSchema.parse(JSON.parse(info.stdout));
  const environment = (await readFile(`/proc/${shellPid}/environ`, 'utf8')).split('\0');
  const pass = environment.find((entry) => entry.startsWith('KOJA_REPORT_TOKEN='))?.slice(18);

  expect(pass).toMatch(/^[0-9a-f]{64}$/);

  return pass ?? '';
};

const selfReport: PaneReportOptions = { processId: '$$', json: true };

// By default the pane's shell sends the report with its own process id, so a live process in the
// pane's session reports itself.
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
  'shows the reported pi, then only a changed conversation after a different report',
  async () => {
    const pane = await setup();

    expect(await reportFromPane(pane, report, 'first')).toEqual({
      exitCode: 0,
      stdout: '{"ok":true,"status":"recorded"}\n',
      stderr: '',
    });

    const { processId: _processId, ...identity } = report;

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: { state: 'reported', recoveryEligible: false, ...identity },
    });

    const switched = { ...report, sessionId: 'conversation-2', leafId: 'leaf-2' };

    expect(await reportFromPane(pane, switched, 'second')).toEqual({
      exitCode: 0,
      stdout: '{"ok":true,"status":"changed"}\n',
      stderr: '',
    });

    expect(await statusJson(pane)).toEqual({
      pane: pane.first,
      pi: { state: 'changed', recoveryEligible: false },
    });
  },
  cliTestTimeoutMs,
);

it(
  'prints the server refusal for a process outside the pane and keeps the record',
  async () => {
    const pane = await setup();
    const reported = await reportFromPane(pane, report, 'first');

    expect(reported.exitCode).toBe(0);

    const before = await statusJson(pane);

    // The test runner is alive but outside the pane's session.
    const outside = { processId: String(process.pid), json: false };
    const refused = await reportFromPane(pane, report, 'outside', outside);

    expect({ exitCode: refused.exitCode, stdout: refused.stdout }).toEqual({
      exitCode: 1,
      stdout: '',
    });

    expect(refused.stderr).toContain('does not run in pane');

    const refusedJson = await reportFromPane(pane, report, 'outside-json', {
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
    const reported = await reportFromPane(pane, report, 'first');

    expect(reported.exitCode).toBe(0);

    const json = await pane.koja('pi', 'status', pane.first, '--json');
    const text = await pane.koja('pi', 'status', pane.first);
    const socketPath = join(pane.directory, 'run', 'koja.sock');
    const log = await readFile(logPathFor(join(pane.directory, 'state'), '', socketPath), 'utf8');

    expect(text).toEqual({
      exitCode: 0,
      stdout: `${pane.first}  pi  /tmp/conversation-1.jsonl  anthropic/claude-opus\n`,
      stderr: '',
    });

    const outputs = [json.stdout, json.stderr, text.stdout, text.stderr, reported.stdout, log];

    expect(log).toContain(socketPath);
    expect(outputs.filter((output) => output.includes(pass))).toEqual([]);
  },
  cliTestTimeoutMs,
);

const validPass = 'a'.repeat(64);

// A listener in place of the server shows whether the command connected at all.
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
