import { expect } from 'bun:test';
import { mkdir, readdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { sessionPathFor } from '../src/server/sessionFile.ts';
import { environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';

export interface TestServer {
  socketPath: string;
  koja: (commandArguments: string[]) => Promise<string>;
  start: () => Promise<number>;
  createWorkspace: (folder: string) => Promise<string>;
  split: (pane: string) => Promise<string>;
  described: () => Promise<string>;
  folders: () => Promise<Record<string, string | null>>;
  states: () => Promise<Record<string, { lifecycle: string; error: string | null }>>;
  workspaceIds: () => Promise<string[]>;
  sessionPath: () => Promise<string>;
}

export interface TestSetup {
  serverAt: (name: string) => TestServer;
  logText: () => Promise<string>;
  environment: Record<string, string | undefined>;
}

const startedSchema = z.object({ socket: z.string(), pid: z.number() });

const workspaceListSchema = z.array(z.object({ id: z.string() }));

const workspaceSchema = z.object({ workspace: z.string() });

const paneSchema = z.object({ pane: z.string() });

const paneListSchema = z.array(z.object({ id: z.string(), cwd: z.string().nullable() }));

const paneStatesSchema = z.array(
  z.object({ id: z.string(), lifecycle: z.string(), restore_error: z.string().nullable() }),
);

export const setup = async (): Promise<TestSetup> => {
  const directory = await temporaryDirectory();

  const environment: Record<string, string | undefined> = {
    ...environmentFor(directory),
    SHELL: '/bin/sh',
    PS1: '',
  };

  const serverAt = (name: string) => {
    const socketPath = join(directory, 'run', `${name}.sock`);

    const koja = async (commandArguments: string[]): Promise<string> => {
      const run = await runCli(
        [...commandArguments, '--socket', socketPath],
        directory,
        environment,
      );

      expect(run.stderr).toBe('');
      expect(run.exitCode).toBe(0);

      return run.stdout;
    };

    const start = async (): Promise<number> =>
      startedSchema.parse(JSON.parse(await koja(['server', 'start', '--json']))).pid;

    const createWorkspace = async (folder: string): Promise<string> => {
      const root = join(directory, folder);

      await mkdir(root, { recursive: true });

      return workspaceSchema.parse(
        JSON.parse(await koja(['workspace', 'create', root, '--focus', '--json'])),
      ).workspace;
    };

    const split = async (pane: string): Promise<string> =>
      paneSchema.parse(
        JSON.parse(await koja(['pane', 'split', pane, '--direction', 'right', '--json'])),
      ).pane;

    const described = async (): Promise<string> => {
      const workspaces = await koja(['workspace', 'list', '--json']);
      const tabs = await koja(['tab', 'list', '--json']);
      const panes = await koja(['pane', 'list', '--json']);

      return [workspaces, tabs, panes].join('\n');
    };

    const folders = async (): Promise<Record<string, string | null>> => {
      const listed = paneListSchema.parse(JSON.parse(await koja(['pane', 'list', '--json'])));

      return Object.fromEntries(listed.map((pane) => [pane.id, pane.cwd]));
    };

    const states = async (): Promise<
      Record<string, { lifecycle: string; error: string | null }>
    > => {
      const listed = paneStatesSchema.parse(JSON.parse(await koja(['pane', 'list', '--json'])));

      return Object.fromEntries(
        listed.map((pane) => [pane.id, { lifecycle: pane.lifecycle, error: pane.restore_error }]),
      );
    };

    const workspaceIds = async (): Promise<string[]> => {
      const listed = workspaceListSchema.parse(
        JSON.parse(await koja(['workspace', 'list', '--json'])),
      );

      return listed.map((workspace) => workspace.id);
    };

    const sessionPath = async (): Promise<string> =>
      sessionPathFor(
        environment.XDG_STATE_HOME,
        homedir(),
        join(await realpath(directory), 'run', `${name}.sock`),
      );

    return {
      socketPath,
      koja,
      start,
      createWorkspace,
      split,
      described,
      folders,
      states,
      workspaceIds,
      sessionPath,
    };
  };

  const logText = async (): Promise<string> => {
    const logDirectory = join(directory, 'state', 'koja', 'logs');
    const names = await readdir(logDirectory);
    const logNames = names.filter((name) => name.endsWith('.log')).toSorted();

    const texts = await Promise.all(
      logNames.map((name) => readFile(join(logDirectory, name), 'utf8')),
    );

    return texts.join('');
  };

  return { serverAt, logText, environment };
};

export const buildSetup = async (server: TestServer): Promise<void> => {
  const first = await server.createWorkspace('one');
  const second = await server.createWorkspace('two');

  await server.koja(['workspace', 'rename', first, 'Renamed']);
  await server.koja(['tab', 'create', '--workspace', first]);

  const added = await server.split('pane-1');

  await server.koja(['pane', 'zoom', added]);
  await server.koja(['workspace', 'focus', second]);
  await server.koja(['workspace', 'focus', first]);
};
