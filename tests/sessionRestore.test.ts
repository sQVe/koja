import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };
import { connectAttach, shownView } from '../src/client/client.ts';
import { sessionPathFor } from '../src/server/sessionFile.ts';
import { ghosttyCommit } from '../src/vt/vt.ts';
import { cliTestTimeoutMs, environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';
import { isRunning, waitFor } from './serverProcesses.ts';

const startedSchema = z.object({ socket: z.string(), pid: z.number() });

const workspaceListSchema = z.array(z.object({ id: z.string() }));

const workspaceSchema = z.object({ workspace: z.string() });

const paneSchema = z.object({ pane: z.string() });

const paneListSchema = z.array(z.object({ id: z.string(), cwd: z.string().nullable() }));

const readText = (path: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

const setup = async () => {
  const directory = await temporaryDirectory();

  const environment: Record<string, string | undefined> = {
    ...environmentFor(directory),
    SHELL: '/bin/sh',
    PS1: '',
  };

  const serverAt = (name: string) => {
    const socketPath = join(directory, 'run', `${name}.sock`);

    const phi = async (commandArguments: string[]): Promise<string> => {
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
      startedSchema.parse(JSON.parse(await phi(['server', 'start', '--json']))).pid;

    const createWorkspace = async (folder: string): Promise<string> => {
      const root = join(directory, folder);

      await mkdir(root, { recursive: true });

      return workspaceSchema.parse(JSON.parse(await phi(['workspace', 'create', root, '--json'])))
        .workspace;
    };

    const split = async (pane: string): Promise<string> =>
      paneSchema.parse(
        JSON.parse(await phi(['pane', 'split', pane, '--direction', 'right', '--json'])),
      ).pane;

    const described = async (): Promise<string> => {
      const workspaces = await phi(['workspace', 'list', '--json']);
      const tabs = await phi(['tab', 'list', '--json']);
      const panes = await phi(['pane', 'list', '--json']);

      return [workspaces, tabs, panes].join('\n');
    };

    const folders = async (): Promise<Record<string, string | null>> => {
      const listed = paneListSchema.parse(JSON.parse(await phi(['pane', 'list', '--json'])));

      return Object.fromEntries(listed.map((pane) => [pane.id, pane.cwd]));
    };

    const workspaceIds = async (): Promise<string[]> => {
      const listed = workspaceListSchema.parse(
        JSON.parse(await phi(['workspace', 'list', '--json'])),
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
      phi,
      start,
      createWorkspace,
      split,
      described,
      folders,
      workspaceIds,
      sessionPath,
    };
  };

  const logText = (): Promise<string> =>
    readFile(join(directory, 'state', 'phi', 'server.log'), 'utf8');

  return { serverAt, logText };
};

type TestServer = ReturnType<Awaited<ReturnType<typeof setup>>['serverAt']>;

const buildSetup = async (server: TestServer): Promise<void> => {
  const first = await server.createWorkspace('one');
  const second = await server.createWorkspace('two');

  await server.phi(['workspace', 'rename', first, 'Renamed']);
  await server.phi(['tab', 'create', '--workspace', first]);

  const added = await server.split('pane-1');

  await server.phi(['pane', 'zoom', added]);
  await server.phi(['workspace', 'focus', second]);
  await server.phi(['workspace', 'focus', first]);
};

it(
  'brings the same workspaces, tabs, splits, zoom, and focus back after stop and start',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('phi');

    await server.start();
    await buildSetup(server);

    const before = await server.described();

    expect(before).toContain('"label":"Renamed"');
    expect(before).toContain('"zoomed":true');

    await server.phi(['server', 'stop']);
    await server.start();

    expect(await server.described()).toBe(before);
  },
  cliTestTimeoutMs,
);

it(
  'restores the setup as of the last change after the server is killed',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('phi');
    const pid = await server.start();

    await buildSetup(server);
    await server.phi(['workspace', 'rename', 'workspace-2', 'Last']);

    const before = await server.described();
    const path = await server.sessionPath();
    const saved = await waitFor(() => readText(path).includes('"label":"Last"'));

    expect(saved).toBe(true);

    process.kill(pid, 'SIGKILL');

    expect(await waitFor(() => !isRunning(pid))).toBe(true);

    await server.start();

    expect(await server.described()).toBe(before);
  },
  cliTestTimeoutMs,
);

it(
  'logs a broken save file and one with version 2, and starts with no workspace',
  async () => {
    const { serverAt, logText } = await setup();
    const server = serverAt('phi');

    await server.start();
    await server.createWorkspace('one');
    await server.phi(['server', 'stop']);

    const path = await server.sessionPath();

    await writeFile(path, '{"version":1,"session":');
    await server.start();

    expect(await server.workspaceIds()).toEqual([]);
    expect(await logText()).toContain(path);

    await server.phi(['server', 'stop']);
    await writeFile(path, '{"version":2,"session":{}}');
    await server.start();

    expect(await server.workspaceIds()).toEqual([]);

    const lines = (await logText()).split('\n').filter((line) => line.includes(path));

    expect(lines).toHaveLength(2);
    expect(lines.at(-1)).toContain('"version":2');
  },
  cliTestTimeoutMs,
);

it(
  'keeps a separate save file for each socket path under one state folder',
  async () => {
    const { serverAt } = await setup();
    const alpha = serverAt('alpha');
    const beta = serverAt('beta');

    await alpha.start();
    await beta.start();

    const alphaWorkspace = await alpha.createWorkspace('alpha');

    await beta.createWorkspace('first');
    await beta.createWorkspace('second');

    expect(await alpha.sessionPath()).not.toBe(await beta.sessionPath());

    await alpha.phi(['server', 'stop']);
    await beta.phi(['server', 'stop']);
    await alpha.start();
    await beta.start();

    expect(await alpha.workspaceIds()).toEqual([alphaWorkspace]);
    expect(await beta.workspaceIds()).toEqual(['workspace-1', 'workspace-2']);
  },
  cliTestTimeoutMs,
);

it(
  'starts with no workspace after every workspace was closed',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('phi');

    await server.start();

    const first = await server.createWorkspace('one');
    const second = await server.createWorkspace('two');

    await server.phi(['workspace', 'close', first]);
    await server.phi(['workspace', 'close', second]);
    await server.phi(['server', 'stop']);
    await server.start();

    expect(await server.workspaceIds()).toEqual([]);
  },
  cliTestTimeoutMs,
);

const attachedFocus = async (socketPath: string): Promise<string | undefined> => {
  const commit = ghosttyCommit();

  if (!commit.ok) {
    throw new Error(commit.detail);
  }

  const version = { version: packageJson.version, ghostty: commit.commit };
  const result = await connectAttach(socketPath, version, { columns: 80, rows: 24 });

  if (!result.ok) {
    throw new Error(`Attach failed: ${result.reason}`);
  }

  const { session } = result;

  const attached = await waitFor(() => {
    const { snapshot } = session.getState();

    return snapshot.attachedClientId !== undefined && snapshot.clients.length === 1;
  });

  expect(attached).toBe(true);

  const focused = shownView(session.getState().snapshot).focusedWorkspaceId;

  session.detach();
  await session.closed;

  return focused;
};

it(
  'shows the workspace a CLI focus chose with no client attached, and restores it after a restart',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('phi');

    await server.start();

    const first = await server.createWorkspace('one');
    const second = await server.createWorkspace('two');

    expect(await attachedFocus(server.socketPath)).toBe(second);

    await server.phi(['workspace', 'focus', first]);

    expect(await attachedFocus(server.socketPath)).toBe(first);

    await server.phi(['server', 'stop']);
    await server.start();

    expect(await attachedFocus(server.socketPath)).toBe(first);
  },
  cliTestTimeoutMs,
);

it(
  'starts each restored shell in its last folder',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('phi');

    await server.start();

    await server.createWorkspace('one');

    const second = await server.split('pane-1');

    const firstFolder = await realpath(await temporaryDirectory());
    const secondFolder = await realpath(await temporaryDirectory());

    await server.phi(['pane', 'focus', 'pane-1']);
    await server.phi(['pane', 'send', `cd ${firstFolder}\n`]);
    await server.phi(['pane', 'focus', second]);
    await server.phi(['pane', 'send', `cd ${secondFolder}\n`]);

    const deadline = performance.now() + 10_000;
    let folders = await server.folders();

    while (folders['pane-1'] !== firstFolder || folders[second] !== secondFolder) {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
      folders = await server.folders();
    }

    await server.phi(['server', 'stop']);
    await server.start();

    expect(await server.folders()).toEqual({ 'pane-1': firstFolder, [second]: secondFolder });
  },
  cliTestTimeoutMs,
);
