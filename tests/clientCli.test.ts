import { expect, it, onTestFinished } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs, environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';
import { waitFor } from './serverProcesses.ts';

const clientListSchema = z.array(
  z.object({
    id: z.string(),
    foreground: z.boolean(),
    size: z.object({ columns: z.number(), rows: z.number() }),
    view: z.object({ workspace: z.string().nullable(), tabs: z.record(z.string(), z.string()) }),
  }),
);

const workspaceDoneSchema = z.object({ workspace: z.string() });

const setup = async () => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'phi.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '', TERM: 'xterm' };

  const phi = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  expect((await phi('server', 'start')).exitCode).toBe(0);

  const createWorkspace = async (): Promise<string> => {
    const root = join(directory, 'project');

    await mkdir(root);

    const created = await phi('workspace', 'create', root, '--focus', '--json');

    expect(created.exitCode).toBe(0);

    return workspaceDoneSchema.parse(JSON.parse(created.stdout)).workspace;
  };

  const list = async () => {
    const listed = await phi('client', 'list', '--json');

    expect({ exitCode: listed.exitCode, stderr: listed.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    return clientListSchema.parse(JSON.parse(listed.stdout));
  };

  const attach = async () => {
    const child = Bun.spawn(
      ['bun', join(import.meta.dir, '../src/index.ts'), 'attach', '--socket', socketPath],
      {
        env: environment,
        terminal: { cols: 80, rows: 24, data: () => undefined },
      },
    );

    onTestFinished(async () => {
      child.kill();
      await child.exited;
      child.terminal?.close();
    });

    const attached = await waitFor(() => child.exitCode === null);

    expect(attached).toBe(true);

    return child;
  };

  const untilClients = async (count: number) => {
    let clients = await list();

    for (let attempt = 0; attempt < 100 && clients.length !== count; attempt += 1) {
      await Bun.sleep(100);
      clients = await list();
    }

    return clients;
  };

  return { phi, createWorkspace, list, attach, untilClients };
};

it(
  'lists the attached client as the foreground client with its view',
  async () => {
    const { phi, createWorkspace, attach, untilClients } = await setup();
    const workspace = await createWorkspace();

    await attach();

    const clients = await untilClients(1);

    const [client] = clients;

    expect(clients).toEqual([
      {
        id: client?.id ?? '',
        foreground: true,
        size: { columns: 80, rows: 24 },
        view: { workspace, tabs: { [workspace]: 'tab-1' } },
      },
    ]);

    const text = await phi('client', 'list');

    expect(text.stdout).toStartWith(`* ${client?.id}\t`);
  },
  cliTestTimeoutMs,
);

it(
  'lists no clients as an empty array and succeeds',
  async () => {
    const { phi, createWorkspace } = await setup();

    await createWorkspace();

    const listed = await phi('client', 'list', '--json');

    expect(listed.exitCode).toBe(0);
    expect(JSON.parse(listed.stdout)).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'detaches the client named by --client',
  async () => {
    const { phi, createWorkspace, attach, untilClients } = await setup();

    await createWorkspace();
    await attach();

    const [client] = await untilClients(1);
    const detached = await phi('detach', '--client', client?.id ?? '', '--json');

    expect(detached.exitCode).toBe(0);
    expect(JSON.parse(detached.stdout)).toEqual({ detached: true });
    expect(await untilClients(0)).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'detaches the foreground client without --client',
  async () => {
    const { phi, createWorkspace, attach, untilClients } = await setup();

    await createWorkspace();
    await attach();
    await untilClients(1);

    const detached = await phi('detach', '--json');

    expect(detached.exitCode).toBe(0);
    expect(JSON.parse(detached.stdout)).toEqual({ detached: true });
    expect(await untilClients(0)).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'fails with unknownClient for an unknown id and keeps the client attached',
  async () => {
    const { phi, createWorkspace, attach, untilClients, list } = await setup();

    await createWorkspace();
    await attach();

    const before = await untilClients(1);
    const refused = await phi('detach', '--client', 'client-999', '--json');

    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout)).toEqual({ detached: false, reason: 'unknownClient' });
    expect(await list()).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'fails with noClient when detach finds no client',
  async () => {
    const { phi, createWorkspace } = await setup();

    await createWorkspace();

    const refused = await phi('detach', '--json');

    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout)).toEqual({ detached: false, reason: 'noClient' });
  },
  cliTestTimeoutMs,
);
