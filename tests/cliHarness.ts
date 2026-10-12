import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { endServersIn } from './serverProcesses.ts';

export interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const root = fileURLToPath(new URL('..', import.meta.url));

// The machine may be busy, and every command here starts Bun and loads the terminal library.
export const cliTestTimeoutMs = 30_000;

export const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'phi-cli-'));

  onTestFinished(async () => {
    await endServersIn(directory);
    await rm(directory, { recursive: true, force: true });
  });

  return directory;
};

export const environmentFor = (directory: string): Record<string, string | undefined> => ({
  ...process.env,
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
