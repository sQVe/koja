import { expect, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };
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

export const runCli = async (
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
