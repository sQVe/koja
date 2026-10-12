import { expect, it, onTestFinished } from 'bun:test';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { ModeFlag } from '../src/rows/rows.ts';
import { createTerminal } from '../src/vt/vt.ts';
import { setupAttach } from './attachHarness.ts';
import {
  cliTestTimeoutMs,
  environmentFor,
  root,
  runCli,
  temporaryDirectory,
} from './cliHarness.ts';

it('shows the input mode in the status bar as the keys change it', async () => {
  const { statusBar, type, until } = await setupAttach(0);

  await until(() => statusBar() === 'INSERT [1]');

  type('\x02');

  await until(() => statusBar() === 'NORMAL [1]');

  type('i');

  await until(() => statusBar() === 'INSERT [1]');
});

it('sends a bracketed paste with markers when the pane asks for them', async () => {
  const { statusBar, type, receivedText, until } = await setupAttach(ModeFlag.bracketedPaste);

  await until(() => statusBar() === 'INSERT [1]');

  type('\x1b[200~one\ntwo\x1b[201~');

  await until(() => receivedText().endsWith('\x1b[201~'));
  expect(receivedText()).toBe('\x1b[200~one\ntwo\x1b[201~');
});

it('sends a paste without markers when the pane does not ask for them', async () => {
  const { statusBar, type, receivedText, until } = await setupAttach(0);

  await until(() => statusBar() === 'INSERT [1]');

  type('\x1b[200~one\ntwo\x1b[201~');

  await until(() => receivedText().length >= 'one\ntwo'.length);
  expect(receivedText()).toBe('one\ntwo');
});

const workspaceListSchema = z.array(
  z.object({ id: z.string(), root: z.string(), label: z.string(), focused: z.boolean() }),
);

const until = async (condition: () => boolean | Promise<boolean>): Promise<void> => {
  const deadline = performance.now() + cliTestTimeoutMs / 2;

  while (!(await condition())) {
    if (performance.now() > deadline) {
      throw new Error('The condition did not hold in time.');
    }

    await Bun.sleep(20);
  }
};

const setupServer = async (terminalRows = 24, terminalColumns = 80) => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'phi.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const phi = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  const started = await phi('server', 'start');

  expect(started.exitCode).toBe(0);

  const createWorkspace = async (name: string): Promise<void> => {
    const path = join(directory, name);

    await mkdir(path);

    const created = await phi('workspace', 'create', path, '--json');

    expect(created.exitCode).toBe(0);
  };

  const list = async () => {
    const listed = await phi('workspace', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    const parsed: unknown = JSON.parse(listed.stdout);

    return workspaceListSchema.parse(parsed);
  };

  const startDirectory = join(directory, 'start-here');

  await mkdir(startDirectory);

  const result = createTerminal(terminalColumns, terminalRows, 0);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  const screen = result.terminal;

  const client = Bun.spawn(
    [process.execPath, join(root, 'src/index.ts'), 'attach', '--socket', socketPath],
    {
      cwd: startDirectory,
      env: { ...environment, TERM: 'xterm-256color' },
      terminal: {
        cols: terminalColumns,
        rows: terminalRows,
        data: (terminal, bytes) => {
          const reply = screen.write(bytes);

          if (reply !== undefined) {
            terminal.write(reply);
          }
        },
      },
    },
  );

  onTestFinished(async () => {
    client.kill();
    await client.exited;
    client.terminal?.close();
    screen[Symbol.dispose]();
  });

  const statusBar = () =>
    screen
      .text()
      .split('\n')
      .findLast((line) => line.trim() !== '');

  return {
    phi,
    list,
    createWorkspace,
    screen,
    statusBar,
    type: (input: string) => client.terminal?.write(input),
    startDirectory: await realpath(startDirectory),
  };
};

it(
  'creates a workspace at the start directory on c and closes it on X, staying in normal mode',
  async () => {
    const { list, statusBar, type, startDirectory } = await setupServer();

    await until(() => statusBar() === 'INSERT');
    type('\x02');
    await until(() => statusBar() === 'NORMAL');
    type('c');

    await until(async () => (await list()).length === 1);

    const created = (await list()).map((workspace) => ({
      root: workspace.root,
      label: workspace.label,
      focused: workspace.focused,
    }));

    expect(created).toEqual([{ root: startDirectory, label: 'start-here', focused: true }]);
    expect(statusBar()).toBe('NORMAL [1]');

    type('X');

    await until(async () => (await list()).length === 0);
    expect(statusBar()).toBe('NORMAL');
  },
  cliTestTimeoutMs,
);

it(
  'focuses the other workspace on j and marks it in the side list',
  async () => {
    const { createWorkspace, screen, statusBar, type } = await setupServer();

    await createWorkspace('alpha');
    await createWorkspace('beta');

    const markedLine = () =>
      screen
        .text()
        .split('\n')
        .find((line) => line.startsWith('>'));

    await until(() => markedLine()?.startsWith('> beta') === true);
    await until(() => statusBar() === 'INSERT [1]');
    type('\x02');
    await until(() => statusBar() === 'NORMAL [1]');
    type('j');

    await until(() => markedLine()?.startsWith('> alpha') === true);
    expect(statusBar()).toBe('NORMAL [1]');
  },
  cliTestTimeoutMs,
);

it(
  'clips the side list to its rows and keeps the focused workspace visible',
  async () => {
    const { createWorkspace, screen, statusBar, type } = await setupServer(6);

    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      await createWorkspace(name);
    }

    const labels = () =>
      screen
        .text()
        .split('\n')
        .slice(0, -1)
        .map((line) => line.slice(0, 20).trim());

    await until(() => labels().includes('> h'));
    expect(statusBar()).toBe('INSERT [1]');

    type('\x02');
    await until(() => statusBar() === 'NORMAL [1]');

    for (let step = 0; step < 4; step += 1) {
      type('k');
      await until(() => labels().includes(`> ${'gfed'[step]}`));
    }

    expect(statusBar()).toBe('NORMAL [1]');
    expect(labels().filter((label) => label.startsWith('>'))).toHaveLength(1);
  },
  cliTestTimeoutMs,
);

it(
  'hides the side list in a 40-column client and gives the pane the full width',
  async () => {
    const { phi, createWorkspace, screen, statusBar } = await setupServer(10, 40);

    await createWorkspace('alpha');
    await until(() => statusBar() === 'INSERT [1]');

    const sent = await phi('pane', 'send', 'echo narrow-ok\r');

    expect(sent.exitCode).toBe(0);

    await until(() => screen.text().split('\n').includes('narrow-ok'));
    expect(screen.text()).not.toContain('alpha');
  },
  cliTestTimeoutMs,
);
