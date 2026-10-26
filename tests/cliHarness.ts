import { expect, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };
import { runCli as runCliInTestProcess } from '../src/cli/cli.ts';
import { ghosttyCommit } from '../src/vt/vt.ts';
import { createWorkspaceAt, endServersIn } from './serverProcesses.ts';

export interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const root = fileURLToPath(new URL('..', import.meta.url));

// The machine may be busy, and every command here starts Bun and loads the terminal library.
export const cliTestTimeoutMs = 30_000;

export const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-cli-'));

  onTestFinished(async () => {
    await endServersIn(directory);
    await rm(directory, { recursive: true, force: true });
  });

  return directory;
};

// Inside a Koja pane, an inherited KOJA_SOCKET_PATH would send commands to the enclosing server.
export const environmentFor = (directory: string): Record<string, string | undefined> => ({
  ...process.env,
  KOJA_SOCKET_PATH: undefined,
  XDG_STATE_HOME: join(directory, 'state'),
  XDG_RUNTIME_DIR: join(directory, 'runtime'),
});

// Starts a real Koja process. Use it where startup, exit status, or the process cwd is what the
// test proves.
export const runCliProcess = async (
  commandArguments: string[],
  directory: string,
  environment = environmentFor(directory),
): Promise<CliRun> => {
  const child = Bun.spawn(['bun', join(root, 'src/index.ts'), ...commandArguments], {
    cwd: directory,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
};

const recorderFor =
  (chunks: string[]) =>
  (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));

    return true;
  };

// The in-process CLI writes to the shared process streams, so runs take turns.
let previousRun: Promise<unknown> = Promise.resolve();

// A run that never settles would hold the streams and every later run, so it fails its own test
// well before the test times out.
const inProcessRunTimeoutMs = cliTestTimeoutMs / 2;

const settleWithin = async <Value>(
  running: Promise<Value>,
  commandArguments: string[],
): Promise<Value> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `koja ${commandArguments.join(' ')} did not finish in ${inProcessRunTimeoutMs} ms.`,
        ),
      );
    }, inProcessRunTimeoutMs);
  });

  try {
    return await Promise.race([running, timedOut]);
  } finally {
    clearTimeout(timer);
  }
};

const runCliInProcess = async (
  commandArguments: string[],
  environment: Record<string, string | undefined>,
): Promise<CliRun> => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writeStdout = process.stdout.write;
  const writeStderr = process.stderr.write;

  process.stdout.write = recorderFor(stdout);
  process.stderr.write = recorderFor(stderr);

  try {
    const exitCode = await settleWithin(
      runCliInTestProcess(commandArguments, environment),
      commandArguments,
    );

    return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
  } finally {
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
  }
};

const takeTurn = (run: () => Promise<CliRun>): Promise<CliRun> => {
  const turn = previousRun.then(run, run);

  previousRun = turn.catch(() => undefined);

  return turn;
};

const pathOptions = new Set(['--cwd', '--socket']);

const isRelativePath = (path: string | undefined): boolean =>
  path !== undefined && path !== '' && !isAbsolute(path);

const passesRelativePath = (commandArguments: string[]): boolean => {
  const [family, action, directory] = commandArguments;

  const createsRelativeWorkspace =
    family === 'workspace' && action === 'create' && isRelativePath(directory);

  const passesRelativeOption = commandArguments.some(
    (argument, index) => pathOptions.has(argument) && isRelativePath(commandArguments[index + 1]),
  );

  return createsRelativeWorkspace || passesRelativeOption;
};

// Server start spawns Bun.main, which is the test file under bun test. Attach and the default
// command need a terminal. Relative paths resolve against the process cwd, which the test process
// does not share with the command.
const needsOwnProcess = (commandArguments: string[]): boolean => {
  const [family, action] = commandArguments;
  const serverLaunch = action === 'start' || action === 'run';
  const startsServer = family === 'server' && serverLaunch;
  const attaches = family === undefined || family === 'attach' || family.startsWith('--socket');

  return startsServer || attaches || passesRelativePath(commandArguments);
};

// Runs the command in the test process when it does not need its own process, since each process
// starts Bun and loads the terminal library.
export const runCli = (
  commandArguments: string[],
  directory: string,
  environment = environmentFor(directory),
): Promise<CliRun> =>
  needsOwnProcess(commandArguments)
    ? runCliProcess(commandArguments, directory, environment)
    : takeTurn(() => runCliInProcess(commandArguments, environment));

export const startOutputSchema = z.object({ socket: z.string(), pid: z.number().int().positive() });

export const buildVersion = (): { version: string; ghostty: string } => {
  const commit = ghosttyCommit();

  if (!commit.ok) {
    throw new Error(commit.detail);
  }

  return { version: packageJson.version, ghostty: commit.commit };
};

export const startServer = async (
  directory: string,
  socketPath: string,
): Promise<z.infer<typeof startOutputSchema>> => {
  const started = await runCli(['server', 'start', '--socket', socketPath, '--json'], directory);

  expect({ exitCode: started.exitCode, stderr: started.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  await createWorkspaceAt(socketPath, directory);

  return startOutputSchema.parse(JSON.parse(started.stdout));
};
