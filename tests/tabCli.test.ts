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
    label: z.string().nullable(),
  }),
);

const workspaceListSchema = z.array(z.object({ id: z.string(), focused: z.boolean() }));

const paneListSchema = z.array(
  z.object({ id: z.string(), lifecycle: z.string(), cwd: z.string().nullable() }),
);

const doneSchema = z.object({ workspace: z.string() });

const tabDoneSchema = z.object({ tab: z.string() });

const setup = async () => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'koja.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const koja = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  expect((await koja('server', 'start')).exitCode).toBe(0);

  const createWorkspace = async (name: string): Promise<string> => {
    const path = join(directory, name);

    await mkdir(path);

    const created = await koja('workspace', 'create', path, '--focus', '--json');

    expect(created.exitCode).toBe(0);

    return doneSchema.parse(JSON.parse(created.stdout)).workspace;
  };

  const tabs = async () => {
    const listed = await koja('tab', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return tabListSchema.parse(JSON.parse(listed.stdout));
  };

  const workspaces = async () => {
    const listed = await koja('workspace', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return workspaceListSchema.parse(JSON.parse(listed.stdout));
  };

  const panes = async () => {
    const listed = await koja('pane', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return paneListSchema.parse(JSON.parse(listed.stdout));
  };

  return { directory, koja, createWorkspace, tabs, workspaces, panes };
};

it(
  'tab create adds a tab with a running pane and leaves the active tab alone',
  async () => {
    const { koja, createWorkspace, tabs, workspaces, panes } = await setup();
    const workspace = await createWorkspace('alpha');
    const [original] = await tabs();

    for (const flags of [[], ['--no-focus']]) {
      const created = await koja('tab', 'create', ...flags, '--json');

      expect(created.exitCode).toBe(0);
    }

    const listed = await tabs();

    expect(listed.map((known) => ({ workspace: known.workspace, number: known.number }))).toEqual([
      { workspace, number: 1 },
      { workspace, number: 2 },
      { workspace, number: 3 },
    ]);

    expect(listed.filter((known) => known.active).map((known) => known.id)).toEqual([
      original?.id ?? '',
    ]);

    expect((await workspaces()).map((known) => known.id)).toEqual([workspace]);

    let lifecycle: string | undefined;

    for (let attempt = 0; attempt < 50 && lifecycle !== 'running'; attempt += 1) {
      lifecycle = (await panes()).find((pane) => pane.id === listed[1]?.pane)?.lifecycle;
    }

    expect(lifecycle).toBe('running');
  },
  cliTestTimeoutMs,
);

it(
  'tab create --focus makes the new tab active and focuses its workspace',
  async () => {
    const { koja, createWorkspace, tabs, workspaces } = await setup();
    const first = await createWorkspace('alpha');
    const second = await createWorkspace('beta');
    const focusedBefore = (await workspaces()).filter((known) => known.focused);

    expect(focusedBefore.map((known) => known.id)).toEqual([second]);

    const created = await koja('tab', 'create', '--workspace', first, '--focus', '--json');

    expect(created.exitCode).toBe(0);

    const { tab } = tabDoneSchema.parse(JSON.parse(created.stdout));
    const listed = await tabs();

    expect(listed.find((known) => known.id === tab)).toMatchObject({
      workspace: first,
      active: true,
    });

    expect(listed.filter((known) => known.workspace === first && known.active)).toHaveLength(1);

    const focusedAfter = (await workspaces()).filter((known) => known.focused);

    expect(focusedAfter.map((known) => known.id)).toEqual([first]);
  },
  cliTestTimeoutMs,
);

it(
  'tab create and --no-focus keep the active tab and the focused workspace',
  async () => {
    const { koja, createWorkspace, tabs, workspaces } = await setup();
    const first = await createWorkspace('alpha');
    const second = await createWorkspace('beta');
    const activeBefore = (await tabs()).filter((known) => known.active);
    const focusedBefore = (await workspaces()).filter((known) => known.focused);

    expect(focusedBefore.map((known) => known.id)).toEqual([second]);

    const variants: string[][] = [
      [],
      ['--no-focus'],
      ['--workspace', first],
      ['--workspace', first, '--no-focus'],
    ];

    for (const flags of variants) {
      const created = await koja('tab', 'create', ...flags);

      expect(created.exitCode).toBe(0);
      expect((await tabs()).filter((known) => known.active)).toEqual(activeBefore);
      expect((await workspaces()).filter((known) => known.focused)).toEqual(focusedBefore);
    }

    expect(await tabs()).toHaveLength(2 + variants.length);
  },
  cliTestTimeoutMs,
);

it(
  'tab create --workspace targets a workspace that is not focused',
  async () => {
    const { koja, createWorkspace, tabs } = await setup();
    const first = await createWorkspace('alpha');

    await createWorkspace('beta');

    const created = await koja('tab', 'create', '--workspace', first);

    expect(created.exitCode).toBe(0);
    expect((await tabs()).filter((tab) => tab.workspace === first)).toHaveLength(2);
  },
  cliTestTimeoutMs,
);

it(
  'tab create exits 1 when there is no workspace to add to',
  async () => {
    const { koja, tabs } = await setup();
    const failed = await koja('tab', 'create');

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
    const { koja, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');
    await koja('tab', 'create');

    const [first] = await tabs();
    const focused = await koja('tab', 'focus', first?.id ?? '', '--json');

    expect(focused.exitCode).toBe(0);
    expect(JSON.parse(focused.stdout)).toEqual({ tab: first?.id });
    expect((await tabs()).map((tab) => tab.active)).toEqual([true, false]);
  },
  cliTestTimeoutMs,
);

it(
  'tab close on the only tab of a workspace removes the workspace',
  async () => {
    const { koja, createWorkspace, tabs, workspaces } = await setup();

    await createWorkspace('alpha');

    const [only] = await tabs();
    const closed = await koja('tab', 'close', only?.id ?? '');

    expect(closed.exitCode).toBe(0);
    expect(await workspaces()).toEqual([]);
    expect(await tabs()).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'tab close on the active tab activates its neighbor',
  async () => {
    const { koja, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');
    await koja('tab', 'create');

    const [first, second] = await tabs();
    const closed = await koja('tab', 'close', second?.id ?? '');

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
    const { koja, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');

    const before = await tabs();
    const failed = await koja('tab', action, 'tab-99');

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
    const { directory, koja, createWorkspace, tabs, panes } = await setup();

    await createWorkspace('alpha');

    const target = join(await realpath(directory), 'elsewhere');

    await mkdir(target);

    const [first] = await panes();

    expect((await koja('pane', 'send', `cd ${target}\n`)).exitCode).toBe(0);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await panes()).find((pane) => pane.id === first?.id)?.cwd === target) {
        break;
      }

      await Bun.sleep(100);
    }

    const created = await koja('tab', 'create', '--json');

    expect(created.exitCode).toBe(0);

    const { tab } = tabDoneSchema.parse(JSON.parse(created.stdout));
    const added = (await tabs()).find((known) => known.id === tab);

    expect((await panes()).find((pane) => pane.id === added?.pane)?.cwd).toBe(target);
  },
  cliTestTimeoutMs,
);

it(
  'tab create --cwd starts the new pane in that folder, resolving a relative path against the CLI folder',
  async () => {
    const { directory, koja, createWorkspace, tabs, panes } = await setup();

    await createWorkspace('alpha');

    const [first] = await panes();
    const moved = join(await realpath(directory), 'moved');
    const target = join(await realpath(directory), 'target');

    await mkdir(moved);
    await mkdir(target);

    expect((await koja('pane', 'send', `cd ${moved}\n`)).exitCode).toBe(0);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await panes()).find((pane) => pane.id === first?.id)?.cwd === moved) {
        break;
      }

      await Bun.sleep(100);
    }

    expect((await koja('tab', 'create', '--cwd', target)).exitCode).toBe(0);
    expect((await koja('tab', 'create', '--cwd', 'target')).exitCode).toBe(0);

    const created = new Set((await tabs()).filter((tab) => tab.number > 1).map((tab) => tab.pane));
    const folders = (await panes()).filter((pane) => created.has(pane.id));

    expect(folders.map((pane) => pane.cwd)).toEqual([target, target]);
  },
  cliTestTimeoutMs,
);

it(
  'prints JSON for tab list and tab create without --json',
  async () => {
    const { koja, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');

    const created = await koja('tab', 'create');

    expect(created.exitCode).toBe(0);
    expect(tabDoneSchema.parse(JSON.parse(created.stdout)).tab).toBeString();

    const listed = await koja('tab', 'list');

    expect(listed.exitCode).toBe(0);
    expect(tabListSchema.parse(JSON.parse(listed.stdout))).toEqual(await tabs());
  },
  cliTestTimeoutMs,
);

it(
  'tab create --cwd refuses a folder that is not a directory and creates no tab',
  async () => {
    const { directory, koja, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');

    const missing = join(directory, 'missing');
    const before = await tabs();
    const failed = await koja('tab', 'create', '--cwd', missing);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain(`${missing} is not a directory.`);
    expect(await tabs()).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'tab rename prints JSON by default and shows the label in tab list',
  async () => {
    const { koja, createWorkspace, tabs } = await setup();

    await createWorkspace('alpha');

    const [original] = await tabs();

    expect(original?.label).toBeNull();

    const renamed = await koja('tab', 'rename', original?.id ?? '', 'build');

    expect(renamed.exitCode).toBe(0);
    expect(tabDoneSchema.parse(JSON.parse(renamed.stdout))).toEqual({ tab: original?.id ?? '' });

    const listed = await koja('tab', 'list');

    expect(listed.exitCode).toBe(0);

    const found = tabListSchema
      .parse(JSON.parse(listed.stdout))
      .find((known) => known.id === original?.id);

    expect(found?.label).toBe('build');
  },
  cliTestTimeoutMs,
);
