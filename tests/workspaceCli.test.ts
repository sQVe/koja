import { expect, it } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs, environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';

const workspaceListSchema = z.array(
  z.object({ id: z.string(), root: z.string(), label: z.string(), focused: z.boolean() }),
);

const workspaceDoneSchema = z.object({ workspace: z.string() });

const paneListSchema = z.array(
  z.object({
    id: z.string(),
    workspace: z.string(),
    tab: z.string(),
    lifecycle: z.string(),
    focused: z.boolean(),
  }),
);

const paneReadSchema = z.object({ pane: z.string(), rows: z.array(z.string()) });

const setup = async () => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'phi.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const phi = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  const started = await phi('server', 'start');

  expect(started.exitCode).toBe(0);

  const createDirectory = async (name: string): Promise<string> => {
    const path = join(directory, name);

    await mkdir(path);

    return path;
  };

  const create = async (name: string): Promise<string> => {
    const created = await phi('workspace', 'create', await createDirectory(name), '--json');

    expect({ exitCode: created.exitCode, stderr: created.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    return workspaceDoneSchema.parse(JSON.parse(created.stdout)).workspace;
  };

  const list = async () => {
    const listed = await phi('workspace', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return workspaceListSchema.parse(JSON.parse(listed.stdout));
  };

  return { directory, phi, create, list };
};

it(
  'lists the workspaces that workspace create made, with root, label, and focus',
  async () => {
    const { directory, phi, create, list } = await setup();

    expect(await list()).toEqual([]);

    const first = await create('alpha');
    const second = await create('beta');

    expect(await list()).toEqual([
      { id: first, root: join(directory, 'alpha'), label: 'alpha', focused: false },
      { id: second, root: join(directory, 'beta'), label: 'beta', focused: true },
    ]);

    const text = await phi('workspace', 'list');

    expect(text.stdout).toContain(`* ${second}\tbeta\t${join(directory, 'beta')}`);
    expect(text.stdout).toContain(`  ${first}\talpha\t${join(directory, 'alpha')}`);
  },
  cliTestTimeoutMs,
);

it(
  'uses --label and resolves a relative directory against the working directory',
  async () => {
    const { directory, phi, list } = await setup();

    await mkdir(join(directory, 'nested'));

    const created = await phi('workspace', 'create', 'nested', '--label', 'Custom');

    expect(created.exitCode).toBe(0);

    const [workspace] = await list();

    expect(workspace).toMatchObject({ root: join(directory, 'nested'), label: 'Custom' });
  },
  cliTestTimeoutMs,
);

it(
  'runs a command in a workspace that is not focused and reads its output by pane id',
  async () => {
    const { phi, create } = await setup();

    const hidden = await create('hidden');

    await create('shown');

    const panes = paneListSchema.parse(JSON.parse((await phi('pane', 'list', '--json')).stdout));

    const hiddenPane = panes.find((pane) => pane.workspace === hidden);

    expect(hiddenPane).toBeDefined();
    expect(panes.filter((pane) => pane.focused)).toHaveLength(1);
    expect(hiddenPane?.focused).toBe(false);

    const paneArguments = ['--pane', hiddenPane?.id ?? ''];
    const sent = await phi('pane', 'send', 'echo hidden-$((20+22))\n', ...paneArguments);

    expect(sent.exitCode).toBe(0);

    let output = '';

    for (let attempt = 0; attempt < 50 && !output.includes('hidden-42'); attempt += 1) {
      const read = await phi('pane', 'read', '--json', ...paneArguments);

      output = paneReadSchema.parse(JSON.parse(read.stdout)).rows.join('\n');
    }

    expect(output).toContain('hidden-42');
  },
  cliTestTimeoutMs,
);

it(
  'focus, rename, and close change the workspace list',
  async () => {
    const { phi, create, list } = await setup();

    const first = await create('alpha');
    const second = await create('beta');

    const focused = await phi('workspace', 'focus', first, '--json');

    expect(focused.exitCode).toBe(0);
    expect(JSON.parse(focused.stdout)).toEqual({ workspace: first });
    expect((await list()).map((workspace) => workspace.focused)).toEqual([true, false]);

    const renamed = await phi('workspace', 'rename', second, 'renamed');

    expect(renamed.exitCode).toBe(0);
    expect((await list()).map((workspace) => workspace.label)).toEqual(['alpha', 'renamed']);

    const closed = await phi('workspace', 'close', first);

    expect(closed.exitCode).toBe(0);

    const remaining = await list();

    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: second, label: 'renamed', focused: true });
  },
  cliTestTimeoutMs,
);

it.each(['focus', 'close'])(
  'workspace %s exits 1 for an unknown id and changes nothing',
  async (action) => {
    const { phi, create, list } = await setup();

    await create('alpha');

    const before = await list();
    const failed = await phi('workspace', action, 'workspace-99');

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('workspace-99');
    expect(await list()).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'workspace rename exits 1 for an unknown id and changes nothing',
  async () => {
    const { phi, create, list } = await setup();

    await create('alpha');

    const before = await list();
    const failed = await phi('workspace', 'rename', 'workspace-99', 'x');

    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain('workspace-99');
    expect(await list()).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'workspace create exits 1 for a missing directory and creates no workspace',
  async () => {
    const { directory, phi, list } = await setup();
    const missing = join(directory, 'missing');
    const failed = await phi('workspace', 'create', missing);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain(missing);
    expect(await list()).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'exits 1 with a message when no server listens',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'phi.sock');
    const failed = await runCli(['workspace', 'list', '--socket', socketPath], directory);

    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain(socketPath);
  },
  cliTestTimeoutMs,
);
