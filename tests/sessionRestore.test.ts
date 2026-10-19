import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import packageJson from '../package.json' with { type: 'json' };
import { connectAttach, shownView } from '../src/client/client.ts';
import { ghosttyCommit } from '../src/vt/vt.ts';
import { cliTestTimeoutMs } from './cliHarness.ts';
import { isRunning, waitFor } from './serverProcesses.ts';
import { setup, buildSetup } from './sessionHarness.ts';

const readText = (path: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

it(
  'brings the same workspaces, tabs, splits, zoom, and focus back after stop and start',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();
    await buildSetup(server);

    const before = await server.described();

    expect(before).toContain('"label":"Renamed"');
    expect(before).toContain('"zoomed":true');

    await server.koja(['server', 'stop']);
    await server.start();

    expect(await server.described()).toBe(before);
  },
  cliTestTimeoutMs,
);

it(
  'restores the setup as of the last change after the server is killed',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');
    const pid = await server.start();

    await buildSetup(server);
    await server.koja(['workspace', 'rename', 'workspace-2', 'Last']);

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
    const server = serverAt('koja');

    await server.start();
    await server.createWorkspace('one');
    await server.koja(['server', 'stop']);

    const path = await server.sessionPath();

    await writeFile(path, '{"version":1,"session":');
    await server.start();

    expect(await server.workspaceIds()).toEqual([]);
    expect(await logText()).toContain(path);

    await server.koja(['server', 'stop']);
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

    await alpha.koja(['server', 'stop']);
    await beta.koja(['server', 'stop']);
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
    const server = serverAt('koja');

    await server.start();

    const first = await server.createWorkspace('one');
    const second = await server.createWorkspace('two');

    await server.koja(['workspace', 'close', first]);
    await server.koja(['workspace', 'close', second]);
    await server.koja(['server', 'stop']);
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
    const server = serverAt('koja');

    await server.start();

    const first = await server.createWorkspace('one');
    const second = await server.createWorkspace('two');

    expect(await attachedFocus(server.socketPath)).toBe(second);

    await server.koja(['workspace', 'focus', first]);

    expect(await attachedFocus(server.socketPath)).toBe(first);

    await server.koja(['server', 'stop']);
    await server.start();

    expect(await attachedFocus(server.socketPath)).toBe(first);
  },
  cliTestTimeoutMs,
);
