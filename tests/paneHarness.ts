import { expect } from 'bun:test';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { environmentFor, launchServer, runCli, temporaryDirectory } from './cliHarness.ts';
import type { CliRun } from './cliHarness.ts';

export type KojaRunner = (...commandArguments: string[]) => Promise<CliRun>;

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

const tabLayoutListSchema = z.array(
  z.object({
    id: z.string(),
    pane: z.string(),
    layout: z.unknown(),
    arrangement: z.object({
      choice: z.enum(['legacy', 'master']),
      order: z.array(z.string()),
    }),
  }),
);

const processInfoSchema = z.object({ shell_pid: z.number() });

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
  socketPath: string;
  koja: KojaRunner;
  list: () => Promise<z.infer<typeof paneListSchema>>;
  act: (...commandArguments: string[]) => Promise<string>;
  tabs: () => Promise<z.infer<typeof tabLayoutListSchema>>;
  shellPid: (pane: string) => Promise<number>;
  // Switches the tab of the first pane to legacy layout, so its panes split and resize.
  useLegacy: () => Promise<void>;
  first: string;
}

export const setup = async (shellBody?: string): Promise<PaneSetup> => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'koja.sock');
  const shell = shellBody === undefined ? '/bin/sh' : await scriptedShell(directory, shellBody);
  const environment = { ...environmentFor(directory), SHELL: shell, PS1: '' };

  const koja = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  await launchServer(socketPath, directory, environment);

  const workspaceRoot = join(directory, 'work');

  await mkdir(workspaceRoot);

  const created = await koja('workspace', 'create', workspaceRoot, '--focus', '--json');

  expect(created.exitCode).toBe(0);
  workspaceDoneSchema.parse(JSON.parse(created.stdout));

  const list = async () => {
    const listed = await koja('pane', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return paneListSchema.parse(JSON.parse(listed.stdout));
  };

  const act = async (...commandArguments: string[]): Promise<string> => {
    const result = await koja('pane', ...commandArguments, '--json');

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    return paneDoneSchema.parse(JSON.parse(result.stdout)).pane;
  };

  const tabs = async () => {
    const listed = await koja('tab', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return tabLayoutListSchema.parse(JSON.parse(listed.stdout));
  };

  const shellPid = async (pane: string): Promise<number> => {
    const info = await koja('pane', 'process-info', pane, '--json');

    expect(info.exitCode).toBe(0);

    return processInfoSchema.parse(JSON.parse(info.stdout)).shell_pid;
  };

  const [first] = await list();

  const useLegacy = async (): Promise<void> => {
    const switched = await koja('tab', 'layout', first?.tab ?? '', 'legacy');

    expect({ exitCode: switched.exitCode, stderr: switched.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
  };

  return {
    directory,
    socketPath,
    koja,
    list,
    act,
    tabs,
    shellPid,
    useLegacy,
    first: first?.id ?? '',
  };
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
  koja: KojaRunner,
  pane: string,
  ...flags: string[]
): Promise<z.infer<typeof paneReadSchema>> => {
  const result = await koja('pane', 'read', pane, ...flags, '--json');

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  return paneReadSchema.parse(JSON.parse(result.stdout));
};

export const waitForText = async (
  koja: KojaRunner,
  pane: string,
  text: string,
  source = 'visible',
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const read = await readJson(koja, pane, '--source', source, '--lines', '30');

    if (read.lines.includes(text)) {
      return;
    }

    await Bun.sleep(100);
  }

  throw new Error(`The pane never showed ${text}.`);
};
