import { expect, onTestFinished } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { sideListColumns } from '../src/layout.ts';
import { cellWords, rowHeaderWords } from '../src/rows/rows.ts';
import { createTerminal } from '../src/vt/vt.ts';
import { environmentFor, root, temporaryDirectory } from './cliHarness.ts';

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
  // The whole screen, side list included.
  screenText: () => string;
  foreground: (row: number, column: number) => number | undefined;
  until: (condition: () => boolean) => Promise<undefined>;
  resize: (columns: number, rows: number) => void;
  type: (input: string) => void;
  first: string;
}

export const setup = async (): Promise<PaneAttachHarness> => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'koja.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const koja = async (...commandArguments: string[]): Promise<string> => {
    const child = Bun.spawn(
      ['bun', join(root, 'src/index.ts'), ...commandArguments, '--socket', socketPath],
      { cwd: directory, env: environment, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    );

    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

    expect(exitCode).toBe(0);

    return stdout;
  };

  await koja('server', 'start');

  const workspaceRoot = join(directory, 'work');

  await mkdir(workspaceRoot);
  await koja('workspace', 'create', workspaceRoot, '--focus');

  const list = async () => paneListSchema.parse(JSON.parse(await koja('pane', 'list', '--json')));

  const act = async (...commandArguments: string[]): Promise<string> =>
    paneDoneSchema.parse(JSON.parse(await koja('pane', ...commandArguments, '--json'))).pane;

  const created = createTerminal(80 + sideListColumns, 24, 0);

  if (!created.ok) {
    throw new Error(created.reason);
  }

  const screen = created.terminal;
  const waiters = new Set<() => void>();

  const client = Bun.spawn([process.execPath, 'src/index.ts', 'attach', '--socket', socketPath], {
    cwd: root,
    env: { ...environment, COLORTERM: 'truecolor', TERM: 'xterm-256color' },
    terminal: {
      cols: 80 + sideListColumns,
      rows: 24,
      data: (terminal, bytes) => {
        const { reply } = screen.write(bytes);

        if (reply !== undefined) {
          terminal.write(reply);
        }

        for (const waiter of waiters) {
          waiter();
        }
      },
    },
  });

  onTestFinished(async () => {
    client.kill();
    await client.exited;
    client.terminal?.close();
    screen[Symbol.dispose]();
  });

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

  const until = (condition: () => boolean): Promise<undefined> => {
    const done = Promise.withResolvers<undefined>();

    const check = () => {
      if (condition()) {
        waiters.delete(check);
        done.resolve(undefined);
      }
    };

    const timer = setTimeout(() => {
      waiters.delete(check);

      done.reject(
        new Error(
          `The condition did not hold in time. Screen:\n${screen
            .text()
            .split('\n')
            .map((l, i) => `${i}|${l}`)
            .join('\n')}`,
        ),
      );
    }, failureTimeoutMs);

    waiters.add(check);
    check();

    return done.promise.finally(() => {
      clearTimeout(timer);
    });
  };

  const resize = (columns: number, rows: number): void => {
    screen.resize(columns, rows);
    client.terminal?.resize(columns, rows);
  };

  const type = (input: string): void => {
    client.terminal?.write(input);
  };

  const [first] = await list();

  const screenText = (): string => screen.text();

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
    first: first?.id ?? '',
  };
};
