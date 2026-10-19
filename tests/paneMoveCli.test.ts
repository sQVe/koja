import { expect, it } from 'bun:test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { pollUntil, readJson, setup } from './paneHarness.ts';
import type { PaneSetup } from './paneHarness.ts';
import { isRunning, waitFor } from './serverProcesses.ts';

const counterShell = 'i=0\nwhile true; do echo "count $i"; i=$((i + 1)); sleep 0.05; done &';

const workspaceListSchema = z.array(z.object({ id: z.string(), root: z.string() }));

const processInfoSchema = z.object({ shell_pid: z.number() });

const latestCount = async (koja: PaneSetup['koja'], pane: string): Promise<number> => {
  const read = await readJson(koja, pane, '--source', 'visible');

  const counts = read.lines.flatMap((line) => {
    const match = /^count (\d+)$/.exec(line);

    return match === null ? [] : [Number(match[1])];
  });

  return Math.max(-1, ...counts);
};

const expectKeepsCounting = async (koja: PaneSetup['koja'], pane: string): Promise<void> => {
  const before = await pollUntil(
    () => latestCount(koja, pane),
    (count) => count >= 0,
  );

  expect(before).toBeGreaterThanOrEqual(0);

  const after = await pollUntil(
    () => latestCount(koja, pane),
    (count) => count > before,
  );

  expect(after).toBeGreaterThan(before);
};

const createWorkspace = async (setupResult: PaneSetup, name: string): Promise<void> => {
  const folder = join(setupResult.directory, name);

  await mkdir(folder);

  const created = await setupResult.koja('workspace', 'create', folder, '--json');

  expect({ exitCode: created.exitCode, stderr: created.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });
};

const listWorkspaces = async (koja: PaneSetup['koja']) => {
  const listed = await koja('workspace', 'list', '--json');

  expect(listed.exitCode).toBe(0);

  return workspaceListSchema.parse(JSON.parse(listed.stdout));
};

it(
  'moves a running pane into a new tab and keeps its output arriving under the same id',
  async () => {
    const { koja, list, act, first } = await setup(counterShell);
    const [before] = await list();

    expect(await act('move', first, '--new-tab')).toBe(first);

    const after = await list();
    const moved = after.find((pane) => pane.id === first);

    expect(moved?.tab).not.toBe(before?.tab);
    expect(moved?.workspace).toBe(before?.workspace);
    expect(moved?.focused).toBe(true);

    await expectKeepsCounting(koja, first);
  },
  cliTestTimeoutMs,
);

it(
  'moves a running pane into another tab and keeps its output arriving under the same id',
  async () => {
    const { koja, list, first } = await setup(counterShell);
    const created = await koja('tab', 'create', '--json');

    expect(created.exitCode).toBe(0);

    const { tab } = z.object({ tab: z.string() }).parse(JSON.parse(created.stdout));
    const moved = await koja('pane', 'move', first, '--tab', tab, '--json');

    expect({ exitCode: moved.exitCode, stderr: moved.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    expect(JSON.parse(moved.stdout)).toEqual({ pane: first });

    const panes = await list();

    expect(panes.find((pane) => pane.id === first)?.tab).toBe(tab);
    expect(panes.filter((pane) => pane.tab === tab)).toHaveLength(2);

    await expectKeepsCounting(koja, first);
  },
  cliTestTimeoutMs,
);

it(
  'moves a running pane into a new workspace rooted at its folder',
  async () => {
    const { koja, list, act, first } = await setup(counterShell);
    const [before] = await list();

    await act('split', first, '--direction', 'below');

    expect(await act('move', first, '--new-workspace')).toBe(first);

    const after = await list();
    const moved = after.find((pane) => pane.id === first);
    const workspaces = await listWorkspaces(koja);

    expect(moved?.workspace).not.toBe(before?.workspace);
    expect(workspaces).toHaveLength(2);

    expect(workspaces.find((workspace) => workspace.id === moved?.workspace)?.root).toBe(
      before?.cwd ?? '',
    );

    await expectKeepsCounting(koja, first);
  },
  cliTestTimeoutMs,
);

it(
  'shows the moved shell its own screen when it reads its pane through KOJA_PANE_ID',
  async () => {
    const harness = await setup();
    const { koja, list, first, directory } = harness;

    await createWorkspace(harness, 'other');

    const panes = await list();
    const other = panes.find((pane) => pane.id !== first);

    expect((await koja('pane', 'send', 'echo marker-first\n', '--pane', first)).exitCode).toBe(0);

    expect(
      (await koja('pane', 'send', 'echo marker-other\n', '--pane', other?.id ?? '')).exitCode,
    ).toBe(0);

    const moved = await koja('pane', 'move', first, '--tab', other?.tab ?? '');

    expect(moved.exitCode).toBe(0);

    const output = join(directory, 'read.json');
    const command = `bun "$KOJA_BIN_PATH" pane read "$KOJA_PANE_ID" --json > ${output}.tmp && mv ${output}.tmp ${output}\n`;

    expect((await koja('pane', 'send', command, '--pane', first)).exitCode).toBe(0);

    const read = await pollUntil(
      async () => readFile(output, 'utf8').catch(() => ''),
      (text) => text !== '',
    );

    const parsed = z
      .object({ pane: z.string(), lines: z.array(z.string()) })
      .parse(JSON.parse(read));

    expect(parsed.pane).toBe(first);
    expect(parsed.lines).toContain('marker-first');
    expect(parsed.lines).not.toContain('marker-other');
  },
  cliTestTimeoutMs,
);

it(
  'removes the workspace of the only pane that moves out, and ends the pane with the server',
  async () => {
    const harness = await setup(counterShell);
    const { koja, list, first } = harness;
    const [source] = await list();

    await createWorkspace(harness, 'other');

    const panes = await list();
    const other = panes.find((pane) => pane.id !== first);
    const moved = await koja('pane', 'move', first, '--tab', other?.tab ?? '');

    expect(moved.exitCode).toBe(0);

    const workspaces = await listWorkspaces(koja);

    expect(workspaces.map((workspace) => workspace.id)).not.toContain(source?.workspace);
    expect(workspaces).toHaveLength(1);

    const info = await koja('pane', 'process-info', first, '--json');
    const { shell_pid: shellPid } = processInfoSchema.parse(JSON.parse(info.stdout));

    expect(isRunning(shellPid)).toBe(true);
    expect((await koja('server', 'stop')).exitCode).toBe(0);
    expect(await waitFor(() => !isRunning(shellPid))).toBe(true);
  },
  cliTestTimeoutMs,
);

const structureOf = async (koja: PaneSetup['koja'], list: PaneSetup['list']) => {
  const tabs = await koja('tab', 'list', '--json');

  expect(tabs.exitCode).toBe(0);

  return { panes: await list(), tabs: tabs.stdout, workspaces: await listWorkspaces(koja) };
};

it(
  'refuses a move into the tab the pane is already in and changes nothing',
  async () => {
    const { koja, list, first } = await setup();
    const [pane] = await list();
    const before = await structureOf(koja, list);
    const same = await koja('pane', 'move', first, '--tab', pane?.tab ?? '');

    expect(same.exitCode).not.toBe(0);
    expect(same.stderr).toContain('already in');
    expect(await structureOf(koja, list)).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'refuses a move of an unknown pane and changes nothing',
  async () => {
    const { koja, list } = await setup();
    const before = await structureOf(koja, list);
    const missing = await koja('pane', 'move', 'pane-99', '--new-tab');

    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr).toContain('There is no pane pane-99.');
    expect(await structureOf(koja, list)).toEqual(before);
  },
  cliTestTimeoutMs,
);
