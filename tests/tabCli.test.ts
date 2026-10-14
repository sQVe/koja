import { expect, it } from 'bun:test';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs, environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';

const tabListSchema = z.array(
  z.object({
    id: z.string(),
    workspace: z.string(),
    number: z.number(),
    active: z.boolean(),
    pane: z.string(),
  }),
);

const workspaceListSchema = z.array(z.object({ id: z.string() }));

const paneListSchema = z.array(
  z.object({ id: z.string(), lifecycle: z.string(), cwd: z.string().nullable() }),
);

const doneSchema = z.object({ workspace: z.string() });

const tabDoneSchema = z.object({ tab: z.string() });

const setup = async () => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'phi.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const phi = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  expect((await phi('server', 'start')).exitCode).toBe(0);

  const createWorkspace = async (name: string): Promise<string> => {
    const path = join(directory, name);

    await mkdir(path);

    const created = await phi('workspace', 'create', path, '--json');

    expect(created.exitCode).toBe(0);

    return doneSchema.parse(JSON.parse(created.stdout)).workspace;
  };

  const tabs = async () => {
    const listed = await phi('tab', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return tabListSchema.parse(JSON.parse(listed.stdout));
  };

  const workspaces = async () => {
    const listed = await phi('workspace', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return workspaceListSchema.parse(JSON.parse(listed.stdout));
  };

  const panes = async () => {
    const listed = await phi('pane', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return paneListSchema.parse(JSON.parse(listed.stdout));
  };

  return { directory, phi, createWorkspace, tabs, workspaces, panes };
};

it(
  'tab create adds an active tab with a running pane',
  async () => {
    const { phi, createWorkspace, tabs, panes } = await setup();
    const workspace = await createWorkspace('alpha');
    const created = await phi('tab', 'create', '--json');

    expect(created.exitCode).toBe(0);

    const { tab } = tabDoneSchema.parse(JSON.parse(created.stdout));
    const listed = await tabs();

    expect(listed.map((known) => ({ workspace: known.workspace, number: known.number }))).toEqual([
      { workspace, number: 1 },
      { workspace, number: 2 },
    ]);

    const added = listed.find((known) => known.id === tab);

    expect(added).toMatchObject({ number: 2, active: true });
    expect(listed.filter((known) => known.active)).toHaveLength(1);

    let lifecycle: string | undefined;

    for (let attempt = 0; attempt < 50 && lifecycle !== 'running'; attempt += 1) {
      lifecycle = (await panes()).find((pane) => pane.id === added?.pane)?.lifecycle;
    }

    expect(lifecycle).toBe('running');
  },
  cliTestTimeoutMs,
);

it(
  'tab create --workspace targets a workspace that is not focused',
  async () => {
    const { phi, createWorkspace, tabs } = await setup();
    const first = await createWorkspace('alpha');

    await createWorkspace('beta');

    const created = await phi('tab', 'create', '--workspace', first);

    expect(created.exitCode).toBe(0);
    expect((await tabs()).filter((tab) => tab.workspace === first)).toHaveLength(2);
  },
  cliTestTimeoutMs,
);

it(
  'tab create exits 1 when there is no workspace to add to',
  async () => {
    const { phi, tabs } = await setup();
    const failed = await phi('tab', 'create');

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('workspace');
    expect(await tabs()).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'tab focus makes an earlier tab active again',
  async () => {
    const { phi, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');
    await phi('tab', 'create');

    const [first] = await tabs();
    const focused = await phi('tab', 'focus', first?.id ?? '', '--json');

    expect(focused.exitCode).toBe(0);
    expect(JSON.parse(focused.stdout)).toEqual({ tab: first?.id });
    expect((await tabs()).map((tab) => tab.active)).toEqual([true, false]);
  },
  cliTestTimeoutMs,
);

it(
  'tab close on the only tab of a workspace removes the workspace',
  async () => {
    const { phi, createWorkspace, tabs, workspaces } = await setup();

    await createWorkspace('alpha');

    const [only] = await tabs();
    const closed = await phi('tab', 'close', only?.id ?? '');

    expect(closed.exitCode).toBe(0);
    expect(await workspaces()).toEqual([]);
    expect(await tabs()).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'tab close on the active tab activates its neighbor',
  async () => {
    const { phi, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');
    await phi('tab', 'create');

    const [first, second] = await tabs();
    const closed = await phi('tab', 'close', second?.id ?? '');

    expect(closed.exitCode).toBe(0);
    const remaining = await tabs();

    expect(remaining.map((tab) => ({ id: tab.id, active: tab.active }))).toEqual([
      { id: first?.id ?? '', active: true },
    ]);
  },
  cliTestTimeoutMs,
);

it.each(['focus', 'close'])(
  'tab %s exits 1 for an unknown id and changes nothing',
  async (action) => {
    const { phi, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');

    const before = await tabs();
    const failed = await phi('tab', action, 'tab-99');

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('tab-99');
    expect(await tabs()).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'tab create starts the new pane in the folder of the focused pane of the active tab',
  async () => {
    const { directory, phi, createWorkspace, tabs, panes } = await setup();

    await createWorkspace('alpha');

    const target = join(await realpath(directory), 'elsewhere');

    await mkdir(target);

    const [first] = await panes();

    expect((await phi('pane', 'send', `cd ${target}\n`)).exitCode).toBe(0);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await panes()).find((pane) => pane.id === first?.id)?.cwd === target) {
        break;
      }

      await Bun.sleep(100);
    }

    expect((await phi('tab', 'create')).exitCode).toBe(0);

    const added = (await tabs()).find((tab) => tab.active);

    expect((await panes()).find((pane) => pane.id === added?.pane)?.cwd).toBe(target);
  },
  cliTestTimeoutMs,
);

it(
  'tab create --cwd starts the new pane in that folder, resolving a relative path against the CLI folder',
  async () => {
    const { directory, phi, createWorkspace, tabs, panes } = await setup();

    await createWorkspace('alpha');

    const [first] = await panes();
    const moved = join(await realpath(directory), 'moved');
    const target = join(await realpath(directory), 'target');

    await mkdir(moved);
    await mkdir(target);

    expect((await phi('pane', 'send', `cd ${moved}\n`)).exitCode).toBe(0);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await panes()).find((pane) => pane.id === first?.id)?.cwd === moved) {
        break;
      }

      await Bun.sleep(100);
    }

    expect((await phi('tab', 'create', '--cwd', target)).exitCode).toBe(0);
    expect((await phi('tab', 'create', '--cwd', 'target')).exitCode).toBe(0);

    const created = new Set((await tabs()).filter((tab) => tab.number > 1).map((tab) => tab.pane));
    const folders = (await panes()).filter((pane) => created.has(pane.id));

    expect(folders.map((pane) => pane.cwd)).toEqual([target, target]);
  },
  cliTestTimeoutMs,
);

it(
  'tab create --cwd refuses a folder that is not a directory and creates no tab',
  async () => {
    const { directory, phi, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');

    const missing = join(directory, 'missing');
    const before = await tabs();
    const failed = await phi('tab', 'create', '--cwd', missing);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain(`${missing} is not a directory.`);
    expect(await tabs()).toEqual(before);
  },
  cliTestTimeoutMs,
);
