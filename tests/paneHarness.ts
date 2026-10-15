import { expect } from 'bun:test';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';
import type { CliRun } from './cliHarness.ts';

export type PhiRunner = (...commandArguments: string[]) => Promise<CliRun>;

export const paneListSchema = z.array(
  z.object({
    id: z.string(),
    workspace: z.string(),
    tab: z.string(),
    lifecycle: z.string(),
    focused: z.boolean(),
    zoomed: z.boolean(),
    columns: z.number(),
    rows: z.number(),
    cwd: z.string().nullable(),
    foreground_cwd: z.string().nullable(),
  }),
);

const paneDoneSchema = z.object({ pane: z.string() });

export const paneReadSchema = z.object({
  pane: z.string(),
  source: z.string(),
  epoch: z.number(),
  oldest: z.number(),
  from: z.number().nullable(),
  to: z.number().nullable(),
  lines: z.array(z.string()),
});

const workspaceDoneSchema = z.object({ workspace: z.string() });

// A shell that runs the body, then stays alive so the pane keeps its output.
const scriptedShell = async (directory: string, body: string): Promise<string> => {
  const path = join(directory, 'scripted-shell.sh');

  await writeFile(path, `#!/bin/sh\n${body}\nexec sleep 3600\n`);
  await chmod(path, 0o755);

  return path;
};

export interface PaneSetup {
  directory: string;
  phi: PhiRunner;
  list: () => Promise<z.infer<typeof paneListSchema>>;
  act: (...commandArguments: string[]) => Promise<string>;
  first: string;
}

export const setup = async (shellBody?: string): Promise<PaneSetup> => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'phi.sock');
  const shell = shellBody === undefined ? '/bin/sh' : await scriptedShell(directory, shellBody);
  const environment = { ...environmentFor(directory), SHELL: shell, PS1: '' };

  const phi = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  const started = await phi('server', 'start');

  expect(started.exitCode).toBe(0);

  const workspaceRoot = join(directory, 'work');

  await mkdir(workspaceRoot);

  const created = await phi('workspace', 'create', workspaceRoot, '--focus', '--json');

  expect(created.exitCode).toBe(0);
  workspaceDoneSchema.parse(JSON.parse(created.stdout));

  const list = async () => {
    const listed = await phi('pane', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return paneListSchema.parse(JSON.parse(listed.stdout));
  };

  const act = async (...commandArguments: string[]): Promise<string> => {
    const result = await phi('pane', ...commandArguments, '--json');

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    return paneDoneSchema.parse(JSON.parse(result.stdout)).pane;
  };

  const [first] = await list();

  return { directory, phi, list, act, first: first?.id ?? '' };
};

export const pollUntil = async <Value>(
  read: () => Promise<Value>,
  done: (value: Value) => boolean,
): Promise<Value> => {
  let value = await read();

  for (let attempt = 0; attempt < 100 && !done(value); attempt += 1) {
    await Bun.sleep(100);
    value = await read();
  }

  return value;
};

export const readJson = async (
  phi: PhiRunner,
  ...flags: string[]
): Promise<z.infer<typeof paneReadSchema>> => {
  const result = await phi('pane', 'read', ...flags, '--json');

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  return paneReadSchema.parse(JSON.parse(result.stdout));
};

export const waitForText = async (
  phi: PhiRunner,
  text: string,
  source = 'visible',
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const read = await readJson(phi, '--source', source, '--lines', '30');

    if (read.lines.includes(text)) {
      return;
    }

    await Bun.sleep(100);
  }

  throw new Error(`The pane never showed ${text}.`);
};
