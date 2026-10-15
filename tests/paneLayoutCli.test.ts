import { expect, it } from 'bun:test';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { paneListSchema, paneReadSchema, setup } from './paneHarness.ts';
import { isRunning } from './serverProcesses.ts';

const splitDoneSchema = z.object({ pane: z.string() });

const waitForFile = async (path: string): Promise<string> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const text = await readFile(path, 'utf8').catch(() => '');

    if (text.endsWith('\n')) {
      return text.trim();
    }

    await Bun.sleep(100);
  }

  return '';
};

it(
  'splits a pane below and to the right, and lists both with their sizes',
  async () => {
    const { list, act, first } = await setup();
    const [whole] = await list();

    const below = await act('split', first, '--direction', 'below');

    const afterBelow = await list();

    expect(afterBelow.map((pane) => pane.id)).toEqual([first, below]);
    expect(afterBelow.map((pane) => pane.focused)).toEqual([false, true]);
    expect(afterBelow[0]?.tab).toBe(afterBelow[1]?.tab);
    expect(afterBelow.every((pane) => pane.lifecycle === 'running')).toBe(true);
    expect(afterBelow.every((pane) => pane.columns === (whole?.columns ?? 0) - 2)).toBe(true);
    expect(afterBelow.reduce((sum, pane) => sum + pane.rows, 0)).toBeLessThan(whole?.rows ?? 0);

    const right = await act('split', below, '--direction', 'right');

    const afterRight = await list();
    const lower = afterRight.filter((pane) => pane.id === below || pane.id === right);

    expect(afterRight).toHaveLength(3);
    expect(afterRight.find((pane) => pane.id === right)?.focused).toBe(true);
    expect(lower[0]?.rows).toBe(lower[1]?.rows);

    expect((lower[0]?.columns ?? 0) + (lower[1]?.columns ?? 0)).toBeLessThan(
      afterBelow[1]?.columns ?? 0,
    );
  },
  cliTestTimeoutMs,
);

it(
  'prints JSON for pane list and pane split without --json',
  async () => {
    const { phi, list, first } = await setup();

    const listed = await phi('pane', 'list');

    expect(listed.exitCode).toBe(0);
    expect(paneListSchema.parse(JSON.parse(listed.stdout))).toEqual(await list());

    const split = await phi('pane', 'split', first, '--direction', 'below');

    expect(split.exitCode).toBe(0);
    expect(splitDoneSchema.parse(JSON.parse(split.stdout)).pane).toBeString();
  },
  cliTestTimeoutMs,
);

it(
  'zooms a pane over the whole tab and restores the split on a second zoom',
  async () => {
    const { list, act, first } = await setup();
    const [whole] = await list();
    const second = await act('split', first, '--direction', 'right');
    const split = await list();

    expect(split.map((pane) => pane.zoomed)).toEqual([false, false]);
    expect(await act('zoom', first)).toBe(first);

    const zoomed = await list();

    expect(zoomed.find((pane) => pane.id === first)).toMatchObject({
      zoomed: true,
      focused: true,
      columns: whole?.columns,
      rows: whole?.rows,
    });

    expect(zoomed.find((pane) => pane.id === second)?.zoomed).toBe(false);
    expect(await act('zoom', first)).toBe(first);

    const restored = await list();

    expect(restored.map((pane) => pane.zoomed)).toEqual([false, false]);

    expect(restored.map((pane) => [pane.columns, pane.rows])).toEqual(
      split.map((pane) => [pane.columns, pane.rows]),
    );
  },
  cliTestTimeoutMs,
);

const columnsOf = (panes: z.infer<typeof paneListSchema>, id: string) =>
  panes.find((pane) => pane.id === id)?.columns ?? 0;

it(
  'resizes a split by cells, and keeps the other pane at one cell past the minimum',
  async () => {
    const { phi, list, act, first } = await setup();
    const second = await act('split', first, '--direction', 'right');
    const before = await list();

    expect(await act('resize', first, '--direction', 'right', '--cells', '5')).toBe(first);

    const grown = await list();

    expect(columnsOf(grown, first)).toBe(columnsOf(before, first) + 5);
    expect(columnsOf(grown, second)).toBe(columnsOf(before, second) - 5);

    await act('resize', first, '--direction', 'left', '--cells', '2');

    const shrunk = await list();

    expect(columnsOf(shrunk, first)).toBe(columnsOf(grown, first) - 2);
    expect(columnsOf(shrunk, second)).toBe(columnsOf(grown, second) + 2);

    await act('resize', first, '--direction', 'right', '--cells', '100000');

    const squeezed = await list();

    expect(columnsOf(squeezed, second)).toBe(1);
    expect(columnsOf(squeezed, first)).toBeGreaterThan(columnsOf(before, first));

    const vertical = await phi('pane', 'resize', first, '--direction', 'down', '--cells', '1');

    expect(vertical.exitCode).toBe(1);
    expect(vertical.stderr).toContain(first);
    expect(await list()).toEqual(squeezed);
  },
  cliTestTimeoutMs,
);

it(
  'moves focus with pane focus, and pane send reaches only the focused pane',
  async () => {
    const { directory, phi, list, act, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    expect((await list()).find((pane) => pane.focused)?.id).toBe(second);

    expect(await act('focus', first)).toBe(first);
    expect((await list()).find((pane) => pane.focused)?.id).toBe(first);

    const marker = join(directory, 'marker');
    const sent = await phi('pane', 'send', `echo reached > ${marker}\n`);

    expect(sent.exitCode).toBe(0);
    expect(await waitForFile(marker)).toBe('reached');

    const read = async (id: string): Promise<string> => {
      const result = await phi('pane', 'read', '--pane', id, '--json');

      return paneReadSchema.parse(JSON.parse(result.stdout)).lines.join('\n');
    };

    let firstOutput = '';

    for (let attempt = 0; attempt < 50 && !firstOutput.includes('reached'); attempt += 1) {
      firstOutput = await read(first);
    }

    expect(firstOutput).toContain('echo reached');
    expect(await read(second)).not.toContain('echo reached');
  },
  cliTestTimeoutMs,
);

it(
  'closes a pane, ends its process, and gives its area to the sibling',
  async () => {
    const { directory, phi, list, act, first } = await setup();
    const [whole] = await list();
    const second = await act('split', first, '--direction', 'below');
    const pidFile = join(directory, 'pid');
    const sent = await phi('pane', 'send', `echo $$ > ${pidFile}\n`);

    expect(sent.exitCode).toBe(0);

    const processId = Number(await waitForFile(pidFile));

    expect(isRunning(processId)).toBe(true);
    expect(await act('close', second)).toBe(second);

    const remaining = await list();

    expect(remaining.map((pane) => pane.id)).toEqual([first]);

    expect(remaining[0]).toMatchObject({
      focused: true,
      columns: whole?.columns,
      rows: whole?.rows,
    });

    for (let attempt = 0; attempt < 100 && isRunning(processId); attempt += 1) {
      await Bun.sleep(100);
    }

    expect(isRunning(processId)).toBe(false);
  },
  cliTestTimeoutMs,
);

it.each([
  ['split', ['--direction', 'right']],
  ['focus', []],
  ['close', []],
  ['zoom', []],
  ['resize', ['--direction', 'left', '--cells', '2']],
])(
  'pane %s exits 1 for an unknown pane and changes nothing',
  async (action, extra) => {
    const { phi, list } = await setup();
    const before = await list();
    const failed = await phi('pane', action, 'pane-99', ...extra);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('pane-99');
    expect(await list()).toEqual(before);
  },
  cliTestTimeoutMs,
);

const withoutFolders = (panes: z.infer<typeof paneListSchema>) =>
  panes.map(({ cwd: _cwd, foreground_cwd: _foregroundCwd, ...rest }) => rest);

it(
  'leaves the focus where it was when a split pane fails to start',
  async () => {
    const { directory, phi, list, act, first } = await setup();

    await act('split', first, '--direction', 'right');

    const before = await list();

    await rm(join(directory, 'work'), { recursive: true });

    const failure = await phi('pane', 'split', first, '--direction', 'below');

    expect(failure.exitCode).toBe(1);

    expect(withoutFolders(await list())).toEqual(withoutFolders(before));
  },
  cliTestTimeoutMs,
);
