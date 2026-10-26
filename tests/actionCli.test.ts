import { expect, it } from 'bun:test';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { pollUntil, setup } from './paneHarness.ts';
import type { KojaRunner } from './paneHarness.ts';

const workspaceListSchema = z.array(
  z.object({ id: z.string(), focused: z.boolean(), root: z.string() }),
);

const tabListSchema = z.array(z.object({ id: z.string(), active: z.boolean() }));

const ranCleanly = (ran: { exitCode: number; stderr: string }) => ({
  exitCode: ran.exitCode,
  stderr: ran.stderr,
});

const cleanRun = { exitCode: 0, stderr: '' };

const listWorkspaces = async (koja: KojaRunner) => {
  const listed = await koja('workspace', 'list', '--json');

  return workspaceListSchema.parse(JSON.parse(listed.stdout));
};

const focusedOf = (workspaces: z.infer<typeof workspaceListSchema>) =>
  workspaces.find((workspace) => workspace.focused)?.id;

const actionListSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    keys: z.array(z.string()),
    cli: z.boolean(),
    available: z.boolean(),
  }),
);

it(
  'runs a catalog action by name and splits the focused pane',
  async () => {
    const { koja, list } = await setup();

    expect(await list()).toHaveLength(1);

    const ran = await koja('action', 'run', 'pane.splitRight', '--json');

    expect({ exitCode: ran.exitCode, stderr: ran.stderr }).toEqual({ exitCode: 0, stderr: '' });
    expect(await list()).toHaveLength(2);
  },
  cliTestTimeoutMs,
);

it(
  'lists the catalog with each action keys, CLI support, and availability',
  async () => {
    const { koja } = await setup();

    const listed = await koja('action', 'list', '--json');

    expect({ exitCode: listed.exitCode, stderr: listed.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    const actions = actionListSchema.parse(JSON.parse(listed.stdout));

    expect(actions.find((action) => action.id === 'pane.zoom')).toMatchObject({
      keys: ['z'],
      cli: true,
      available: true,
    });
  },
  cliTestTimeoutMs,
);

it(
  'refuses tab.next with one tab and leaves the tabs unchanged',
  async () => {
    const { koja } = await setup();

    const tabsBefore = await koja('tab', 'list', '--json');
    const ran = await koja('action', 'run', 'tab.next');
    const tabsAfter = await koja('tab', 'list', '--json');

    expect(ran.exitCode).toBe(1);
    expect(ran.stderr).toContain('tab.next is not available here.');
    expect(tabsBefore.exitCode).toBe(0);
    expect(tabsAfter.exitCode).toBe(0);
    expect(JSON.parse(tabsAfter.stdout)).toEqual(JSON.parse(tabsBefore.stdout));
  },
  cliTestTimeoutMs,
);

it(
  'refuses view.search in the CLI because it runs only in an attached client',
  async () => {
    const { koja } = await setup();

    const ran = await koja('action', 'run', 'view.search');

    expect(ran.exitCode).toBe(1);
    expect(ran.stderr).toContain('view.search runs only in an attached client.');
  },
  cliTestTimeoutMs,
);

it(
  'exits 2 with usage for an unknown action id',
  async () => {
    const { koja } = await setup();

    const ran = await koja('action', 'run', 'pane.unknown');

    expect(ran.exitCode).toBe(2);
    expect(ran.stderr).toContain('Usage:');
    expect(ran.stderr).toContain('koja action run <id>');

    const create = await koja('action', 'run', 'workspace.create', '--workspace', 'workspace-1');

    expect(create.exitCode).toBe(2);
    expect(create.stderr).toContain('Usage:');
  },
  cliTestTimeoutMs,
);

it(
  'runs client.detach the way koja detach runs with no --client',
  async () => {
    const { koja } = await setup();

    const direct = await koja('detach');
    const viaAction = await koja('action', 'run', 'client.detach');

    expect(direct.exitCode).toBe(1);
    expect(viaAction).toEqual(direct);
  },
  cliTestTimeoutMs,
);

it(
  'steps to the next and previous workspace through action run without closing any',
  async () => {
    const { koja, directory } = await setup();

    expect(ranCleanly(await koja('action', 'run', 'workspace.create'))).toEqual(cleanRun);
    expect(ranCleanly(await koja('action', 'run', 'workspace.create'))).toEqual(cleanRun);

    const created = await listWorkspaces(koja);
    const ids = created.map((workspace) => workspace.id);
    const [first, , third] = ids;

    expect(ids).toHaveLength(3);

    expect(created.map((workspace) => workspace.root)).toEqual([
      join(directory, 'work'),
      directory,
      directory,
    ]);

    expect(focusedOf(created)).toBe(third);

    expect(ranCleanly(await koja('action', 'run', 'workspace.next'))).toEqual(cleanRun);

    const afterNext = await listWorkspaces(koja);

    expect(focusedOf(afterNext)).toBe(first);
    expect(afterNext.map((workspace) => workspace.id)).toEqual(ids);

    expect(ranCleanly(await koja('action', 'run', 'workspace.next'))).toEqual(cleanRun);
    expect(ranCleanly(await koja('action', 'run', 'workspace.previous'))).toEqual(cleanRun);
    expect(ranCleanly(await koja('action', 'run', 'workspace.previous'))).toEqual(cleanRun);

    const afterPrevious = await listWorkspaces(koja);

    expect(focusedOf(afterPrevious)).toBe(third);
    expect(afterPrevious.map((workspace) => workspace.id)).toEqual(ids);
  },
  cliTestTimeoutMs,
);

it(
  'closes the focused workspace through action run',
  async () => {
    const { koja } = await setup();

    expect(ranCleanly(await koja('action', 'run', 'workspace.create'))).toEqual(cleanRun);

    const created = await listWorkspaces(koja);
    const other = created.find((workspace) => !workspace.focused)?.id;

    expect(created).toHaveLength(2);

    expect(ranCleanly(await koja('action', 'run', 'workspace.close'))).toEqual(cleanRun);

    const remaining = await pollUntil(
      async () => listWorkspaces(koja),
      (workspaces) => workspaces.length === 1,
    );

    expect(remaining.map((workspace) => workspace.id)).toEqual([other ?? 'no other workspace']);
  },
  cliTestTimeoutMs,
);

it(
  'creates a tab and focuses the previous one through action run',
  async () => {
    const { koja } = await setup();

    const tabs = async () => {
      const listed = await koja('tab', 'list', '--json');

      return tabListSchema.parse(JSON.parse(listed.stdout));
    };

    const [first] = await tabs();

    expect(ranCleanly(await koja('action', 'run', 'tab.create'))).toEqual({
      exitCode: 0,
      stderr: '',
    });

    const created = await tabs();

    expect(created).toHaveLength(2);
    expect(created.find((tab) => tab.active)?.id).not.toBe(first?.id);

    expect(ranCleanly(await koja('action', 'run', 'tab.previous'))).toEqual({
      exitCode: 0,
      stderr: '',
    });

    expect((await tabs()).find((tab) => tab.active)?.id).toBe(first?.id);
  },
  cliTestTimeoutMs,
);

it(
  'closes the pane that --pane names instead of the focused pane',
  async () => {
    const { koja, list, act, first } = await setup();

    await act('split', first, '--direction', 'right');

    const split = await list();
    const unfocused = split.find((pane) => !pane.focused);
    const focused = split.find((pane) => pane.focused);

    const ran = await koja('action', 'run', 'pane.close', '--pane', unfocused?.id ?? '');

    expect(ranCleanly(ran)).toEqual({ exitCode: 0, stderr: '' });

    const remaining = await pollUntil(list, (panes) => panes.length === 1);

    expect(remaining.map((pane) => pane.id)).toEqual([focused?.id ?? 'no focused pane']);
  },
  cliTestTimeoutMs,
);

it(
  'refuses a pane or workspace target that does not exist and changes nothing',
  async () => {
    const { koja, list } = await setup();

    const panesBefore = await list();
    const workspacesBefore = await koja('workspace', 'list', '--json');

    const pane = await koja('action', 'run', 'pane.close', '--pane', 'pane-99');
    const workspace = await koja('action', 'run', 'workspace.close', '--workspace', 'workspace-9');

    expect(pane.exitCode).toBe(1);
    expect(pane.stderr).toContain('pane-99');
    expect(workspace.exitCode).toBe(1);
    expect(workspace.stderr).toContain('workspace-9');

    expect(await list()).toEqual(panesBefore);
    expect((await koja('workspace', 'list', '--json')).stdout).toBe(workspacesBefore.stdout);
  },
  cliTestTimeoutMs,
);
