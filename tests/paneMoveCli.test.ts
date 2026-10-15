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

const latestCount = async (phi: PaneSetup['phi'], pane: string): Promise<number> => {
  const read = await readJson(phi, '--pane', pane, '--source', 'visible');

  const counts = read.lines.flatMap((line) => {
    const match = /^count (\d+)$/.exec(line);

    return match === null ? [] : [Number(match[1])];
  });

  return Math.max(-1, ...counts);
};

const expectKeepsCounting = async (phi: PaneSetup['phi'], pane: string): Promise<void> => {
  const before = await pollUntil(
    () => latestCount(phi, pane),
    (count) => count >= 0,
  );

  expect(before).toBeGreaterThanOrEqual(0);

  const after = await pollUntil(
    () => latestCount(phi, pane),
    (count) => count > before,
  );

  expect(after).toBeGreaterThan(before);
};

const createWorkspace = async (setupResult: PaneSetup, name: string): Promise<void> => {
  const folder = join(setupResult.directory, name);

  await mkdir(folder);

  const created = await setupResult.phi('workspace', 'create', folder, '--json');

  expect({ exitCode: created.exitCode, stderr: created.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });
};

const listWorkspaces = async (phi: PaneSetup['phi']) => {
  const listed = await phi('workspace', 'list', '--json');

  expect(listed.exitCode).toBe(0);

  return workspaceListSchema.parse(JSON.parse(listed.stdout));
};

it(
  'moves a running pane into a new tab and keeps its output arriving under the same id',
  async () => {
    const { phi, list, act, first } = await setup(counterShell);
    const [before] = await list();

    expect(await act('move', first, '--new-tab')).toBe(first);

    const after = await list();
    const moved = after.find((pane) => pane.id === first);

    expect(moved?.tab).not.toBe(before?.tab);
    expect(moved?.workspace).toBe(before?.workspace);
    expect(moved?.focused).toBe(true);

    await expectKeepsCounting(phi, first);
  },
  cliTestTimeoutMs,
);

it(
  'moves a running pane into another tab and keeps its output arriving under the same id',
  async () => {
    const { phi, list, first } = await setup(counterShell);
    const created = await phi('tab', 'create', '--json');

    expect(created.exitCode).toBe(0);

    const { tab } = z.object({ tab: z.string() }).parse(JSON.parse(created.stdout));
    const moved = await phi('pane', 'move', first, '--tab', tab, '--json');

    expect({ exitCode: moved.exitCode, stderr: moved.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    expect(JSON.parse(moved.stdout)).toEqual({ pane: first });

    const panes = await list();

    expect(panes.find((pane) => pane.id === first)?.tab).toBe(tab);
    expect(panes.filter((pane) => pane.tab === tab)).toHaveLength(2);

    await expectKeepsCounting(phi, first);
  },
  cliTestTimeoutMs,
);

it(
  'moves a running pane into a new workspace rooted at its folder',
  async () => {
    const { phi, list, act, first } = await setup(counterShell);
    const [before] = await list();

    await act('split', first, '--direction', 'below');

    expect(await act('move', first, '--new-workspace')).toBe(first);

    const after = await list();
    const moved = after.find((pane) => pane.id === first);
    const workspaces = await listWorkspaces(phi);

    expect(moved?.workspace).not.toBe(before?.workspace);
    expect(workspaces).toHaveLength(2);

    expect(workspaces.find((workspace) => workspace.id === moved?.workspace)?.root).toBe(
      before?.cwd ?? '',
    );

    await expectKeepsCounting(phi, first);
  },
  cliTestTimeoutMs,
);

it(
  'shows the moved shell its own screen when it reads its pane through PHI_PANE_ID',
  async () => {
    const harness = await setup();
    const { phi, list, first, directory } = harness;

    await createWorkspace(harness, 'other');

    const panes = await list();
    const other = panes.find((pane) => pane.id !== first);

    expect((await phi('pane', 'send', 'echo marker-first\n', '--pane', first)).exitCode).toBe(0);

    expect(
      (await phi('pane', 'send', 'echo marker-other\n', '--pane', other?.id ?? '')).exitCode,
    ).toBe(0);

    const moved = await phi('pane', 'move', first, '--tab', other?.tab ?? '');

    expect(moved.exitCode).toBe(0);

    const output = join(directory, 'read.json');
    const command = `bun "$PHI_BIN_PATH" pane read --pane "$PHI_PANE_ID" --json > ${output}.tmp && mv ${output}.tmp ${output}\n`;

    expect((await phi('pane', 'send', command, '--pane', first)).exitCode).toBe(0);

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
    const { phi, list, first } = harness;
    const [source] = await list();

    await createWorkspace(harness, 'other');

    const panes = await list();
    const other = panes.find((pane) => pane.id !== first);
    const moved = await phi('pane', 'move', first, '--tab', other?.tab ?? '');

    expect(moved.exitCode).toBe(0);

    const workspaces = await listWorkspaces(phi);

    expect(workspaces.map((workspace) => workspace.id)).not.toContain(source?.workspace);
    expect(workspaces).toHaveLength(1);

    const info = await phi('pane', 'process-info', first, '--json');
    const { shell_pid: shellPid } = processInfoSchema.parse(JSON.parse(info.stdout));

    expect(isRunning(shellPid)).toBe(true);
    expect((await phi('server', 'stop')).exitCode).toBe(0);
    expect(await waitFor(() => !isRunning(shellPid))).toBe(true);
  },
  cliTestTimeoutMs,
);

const structureOf = async (phi: PaneSetup['phi'], list: PaneSetup['list']) => {
  const tabs = await phi('tab', 'list', '--json');

  expect(tabs.exitCode).toBe(0);

  return { panes: await list(), tabs: tabs.stdout, workspaces: await listWorkspaces(phi) };
};

it(
  'refuses a move into the tab the pane is already in and changes nothing',
  async () => {
    const { phi, list, first } = await setup();
    const [pane] = await list();
    const before = await structureOf(phi, list);
    const same = await phi('pane', 'move', first, '--tab', pane?.tab ?? '');

    expect(same.exitCode).not.toBe(0);
    expect(same.stderr).toContain('already in');
    expect(await structureOf(phi, list)).toEqual(before);
  },
  cliTestTimeoutMs,
);

it(
  'refuses a move of an unknown pane and changes nothing',
  async () => {
    const { phi, list } = await setup();
    const before = await structureOf(phi, list);
    const missing = await phi('pane', 'move', 'pane-99', '--new-tab');

    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr).toContain('There is no pane pane-99.');
    expect(await structureOf(phi, list)).toEqual(before);
  },
  cliTestTimeoutMs,
);
