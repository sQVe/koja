import { expect, it } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs, environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';
import { createWorkspaceAt } from './serverProcesses.ts';

const readSchema = z.object({ pane: z.string() });

const listSchema = z.array(z.object({ id: z.string(), workspace: z.string() }));

const setup = async () => {
  const directory = await temporaryDirectory();
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const startServerAt = async (name: string): Promise<string> => {
    const socketPath = join(directory, name, 'phi.sock');

    const started = await runCli(
      ['server', 'start', '--socket', socketPath],
      directory,
      environment,
    );

    expect(started.exitCode).toBe(0);

    return socketPath;
  };

  const phi = (extra: Record<string, string>, ...commandArguments: string[]) =>
    runCli(commandArguments, directory, { ...environment, ...extra });

  const listed = async (extra: Record<string, string>, ...commandArguments: string[]) => {
    const result = await phi(extra, ...commandArguments, '--json');

    expect(result.exitCode).toBe(0);

    return listSchema.parse(JSON.parse(result.stdout));
  };

  return { directory, startServerAt, phi, listed };
};

it(
  'PHI_SOCKET_PATH picks the server when --socket is absent, and --socket wins',
  async () => {
    const { directory, startServerAt, listed } = await setup();
    const first = await startServerAt('first');
    const second = await startServerAt('second');

    await createWorkspaceAt(first, directory);
    await createWorkspaceAt(second, directory);
    await createWorkspaceAt(second, directory);

    expect(await listed({ PHI_SOCKET_PATH: second }, 'pane', 'list')).toHaveLength(2);

    expect(
      await listed({ PHI_SOCKET_PATH: second }, 'pane', 'list', '--socket', first),
    ).toHaveLength(1);
  },
  cliTestTimeoutMs,
);

it(
  'PHI_PANE_ID and PHI_WORKSPACE_ID are not defaults for pane read and tab create',
  async () => {
    const { directory, startServerAt, phi } = await setup();
    const socketPath = await startServerAt('run');
    const other = join(directory, 'other');

    await mkdir(other);
    await createWorkspaceAt(socketPath, directory);
    await createWorkspaceAt(socketPath, other);

    const inPane = {
      PHI_SOCKET_PATH: socketPath,
      PHI_PANE_ID: 'pane-1',
      PHI_WORKSPACE_ID: 'workspace-1',
    };

    const read = await phi(inPane, 'pane', 'read', '--json');

    expect(read.exitCode).toBe(0);
    expect(readSchema.parse(JSON.parse(read.stdout)).pane).toBe('pane-2');

    const created = await phi(inPane, 'tab', 'create', '--json');

    expect(created.exitCode).toBe(0);

    const tabs = z
      .array(z.object({ workspace: z.string() }))
      .parse(JSON.parse((await phi(inPane, 'tab', 'list', '--json')).stdout));

    expect(tabs.map((tab) => tab.workspace)).toEqual(['workspace-1', 'workspace-2', 'workspace-2']);
  },
  cliTestTimeoutMs,
);
