import { expect, it, onTestFinished } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { createTerminal } from '../src/vt/vt.ts';
import { cliTestTimeoutMs, environmentFor, root, temporaryDirectory } from './cliHarness.ts';

const paneListSchema = z.array(
  z.object({ id: z.string(), focused: z.boolean(), columns: z.number(), rows: z.number() }),
);

const paneDoneSchema = z.object({ pane: z.string() });

const failureTimeoutMs = 20_000;

const setup = async () => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'phi.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const phi = async (...commandArguments: string[]): Promise<string> => {
    const child = Bun.spawn(
      ['bun', join(root, 'src/index.ts'), ...commandArguments, '--socket', socketPath],
      { cwd: directory, env: environment, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    );

    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

    expect(exitCode).toBe(0);

    return stdout;
  };

  await phi('server', 'start');

  const workspaceRoot = join(directory, 'work');

  await mkdir(workspaceRoot);
  await phi('workspace', 'create', workspaceRoot);

  const list = async () => paneListSchema.parse(JSON.parse(await phi('pane', 'list', '--json')));

  const act = async (...commandArguments: string[]): Promise<string> =>
    paneDoneSchema.parse(JSON.parse(await phi('pane', ...commandArguments, '--json'))).pane;

  const created = createTerminal(80, 24, 0);

  if (!created.ok) {
    throw new Error(created.reason);
  }

  const screen = created.terminal;
  const waiters = new Set<() => void>();

  const client = Bun.spawn([process.execPath, 'src/index.ts', 'attach', '--socket', socketPath], {
    cwd: root,
    env: { ...environment, COLORTERM: 'truecolor', TERM: 'xterm-256color' },
    terminal: {
      cols: 80,
      rows: 24,
      data: (terminal, bytes) => {
        const reply = screen.write(bytes);

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

  const lines = (): string[] => screen.text().split('\n');

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

  return { phi, list, act, lines, until, resize, type, first: first?.id ?? '' };
};

const region = (lines: string[], from: number, to: number): string[] =>
  lines.slice(0, 23).map((line) => line.slice(from, to).trimEnd());

it(
  'draws split panes at their layout rectangles with a border that marks the focused pane',
  async () => {
    const { phi, act, lines, until, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await phi('pane', 'send', 'echo LEFTTEXT\n', '--pane', first);
    await phi('pane', 'send', 'echo RIGHTTEXT\n', '--pane', second);

    await until(() => lines().some((line) => line.includes('echo RIGHTTEXT')));

    const rows = lines();
    const leftRow = rows.find((line) => line.includes('echo LEFTTEXT')) ?? '';
    const rightRow = rows.find((line) => line.includes('echo RIGHTTEXT')) ?? '';

    expect(leftRow.startsWith('echo LEFTTEXT')).toBe(true);
    expect(rightRow.slice(41).startsWith('echo RIGHTTEXT')).toBe(true);

    const border = rows.slice(0, 23).map((line) => line.padEnd(80).charAt(40));

    expect(border.every((glyph) => glyph === '┝')).toBe(true);
  },
  cliTestTimeoutMs,
);

it(
  'sends typed keys only to the focused pane after pane focus',
  async () => {
    const { phi, act, lines, until, type, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await phi('pane', 'send', 'echo RIGHTTEXT\n', '--pane', second);
    await until(() => lines().some((line) => line.includes('echo RIGHTTEXT')));

    expect(await act('focus', first)).toBe(first);

    await until(() => lines()[0]?.charAt(40) === '┥');

    const rightBefore = region(lines(), 41, 80);

    type('echo TYPED\r');

    await until(() => lines().some((line) => line.slice(0, 40).includes('echo TYPED')));

    expect(region(lines(), 41, 80)).toEqual(rightBefore);
  },
  cliTestTimeoutMs,
);

it(
  'sizes every pane to its layout rectangle on resize and fills the area of a closed pane',
  async () => {
    const { list, act, lines, until, resize, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await until(() => lines()[0]?.charAt(40) === '┝');
    resize(100, 30);
    await until(() => lines()[0]?.charAt(50) === '┝');

    const resized = await list();

    expect(resized.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([
      [first, 50, 29],
      [second, 49, 29],
    ]);

    expect(
      lines()
        .slice(0, 29)
        .map((line) => line.padEnd(100).charAt(50)),
    ).toEqual(Array.from({ length: 29 }, () => '┝'));

    expect(await act('close', second)).toBe(second);
    await until(() => !lines().some((line) => line.includes('┝') || line.includes('┥')));

    const remaining = await list();

    expect(remaining.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([[first, 100, 29]]);
  },
  cliTestTimeoutMs,
);
