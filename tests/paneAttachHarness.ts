import { expect, onTestFinished } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { startAttachTerminal } from '../scripts/attachTerminal.ts';
import { sideListColumns } from '../src/layout.ts';
import { cellWords, rowHeaderWords } from '../src/rows/rows.ts';
import { environmentFor, launchServer, root, runCli, temporaryDirectory } from './cliHarness.ts';

const paneListSchema = z.array(
  z.object({
    id: z.string(),
    tab: z.string(),
    focused: z.boolean(),
    columns: z.number(),
    rows: z.number(),
    cwd: z.string().nullable(),
  }),
);

const paneDoneSchema = z.object({ pane: z.string() });

// The 0x5fafff accent of the focused frame as a color word.
export const accentWord = 0x1_00_00_00 + 0x5f_af_ff;

const failureTimeoutMs = 20_000;

interface PaneAttachHarness {
  koja: (...commandArguments: string[]) => Promise<string>;
  list: () => Promise<z.infer<typeof paneListSchema>>;
  act: (...commandArguments: string[]) => Promise<string>;
  lines: () => string[];
  screenText: () => string;
  foreground: (row: number, column: number) => number | undefined;
  until: (condition: () => boolean) => Promise<undefined>;
  resize: (columns: number, rows: number) => void;
  type: (input: string) => void;
  // Switches the tab of the first pane to legacy layout, so its panes split and resize.
  useLegacy: () => Promise<void>;
  first: string;
}

export const setup = async (): Promise<PaneAttachHarness> => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'koja.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const koja = async (...commandArguments: string[]): Promise<string> => {
    const run = await runCli([...commandArguments, '--socket', socketPath], directory, environment);

    expect(run.exitCode).toBe(0);

    return run.stdout;
  };

  await launchServer(socketPath, directory, environment);

  const workspaceRoot = join(directory, 'work');

  await mkdir(workspaceRoot);
  await koja('workspace', 'create', workspaceRoot, '--focus');

  const list = async () => paneListSchema.parse(JSON.parse(await koja('pane', 'list', '--json')));

  const act = async (...commandArguments: string[]): Promise<string> =>
    paneDoneSchema.parse(JSON.parse(await koja('pane', ...commandArguments, '--json'))).pane;

  const terminal = startAttachTerminal({
    command: [process.execPath, 'src/index.ts', 'attach', '--socket', socketPath],
    cwd: root,
    environment,
    columns: 80 + sideListColumns,
    rows: 24,
  });

  const { screen } = terminal;

  onTestFinished(terminal.stop);

  // The rows of the pane area, without the side list. The status bar row keeps its full width.
  const lines = (): string[] => {
    const rows = screen.text().split('\n');

    return rows.map((row, index) => (index === rows.length - 1 ? row : row.slice(sideListColumns)));
  };

  // The foreground color word of a cell, as rows.ts defines it, or undefined outside the screen.
  const foreground = (row: number, column: number): number | undefined => {
    const stable = screen.stableRows();
    const read = screen.readRows(stable.epoch, stable.activeTop + row, 1);

    if (!read.ok) {
      return undefined;
    }

    return read.rows.cells[rowHeaderWords + (column + sideListColumns) * cellWords + 1];
  };

  const until = async (condition: () => boolean): Promise<undefined> => {
    await terminal.waitFor(
      condition,
      failureTimeoutMs,
      () =>
        `The condition did not hold in time. Screen:\n${screen
          .text()
          .split('\n')
          .map((l, i) => `${i}|${l}`)
          .join('\n')}`,
    );

    return undefined;
  };

  const { resize, type } = terminal;

  const [first] = await list();

  const screenText = (): string => screen.text();

  const useLegacy = async (): Promise<void> => {
    await koja('tab', 'layout', first?.tab ?? '', 'legacy');
  };

  return {
    koja,
    list,
    act,
    lines,
    screenText,
    foreground,
    until,
    resize,
    type,
    useLegacy,
    first: first?.id ?? '',
  };
};
