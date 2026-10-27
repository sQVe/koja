import { expect, it, onTestFinished } from 'bun:test';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { startAttachTerminal } from '../scripts/attachTerminal.ts';
import { sideListColumns } from '../src/layout.ts';
import {
  cliTestTimeoutMs,
  environmentFor,
  launchServer,
  root,
  temporaryDirectory,
} from './cliHarness.ts';
import { createWorkspaceAt, waitFor } from './serverProcesses.ts';

const failureTimeoutMs = 20_000;

const readReceived = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
};

const executable = async (path: string, script: string): Promise<string> => {
  await writeFile(path, script);
  await chmod(path, 0o755);

  return path;
};

// The pane's shell copies every byte it gets, untranslated, to a file. The clipboard is a fake
// wl-paste that prints a file.
const setupPaste = async (bracketed: boolean, clipboardText: string) => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'koja.sock');
  const received = join(directory, 'received');
  const tools = join(directory, 'tools');
  const clipboard = join(directory, 'clipboard');
  const bracketedStart = bracketed ? "printf '\\033[?2004h'\n" : '';

  await mkdir(tools);
  await writeFile(clipboard, clipboardText);
  await executable(join(tools, 'wl-paste'), `#!/bin/sh\nexec cat '${clipboard}'\n`);

  const shell = await executable(
    join(directory, 'recording-shell.sh'),
    `#!/bin/sh\nstty raw -echo\n${bracketedStart}echo ready\nexec cat >> '${received}'\n`,
  );

  const environment = {
    ...environmentFor(directory),
    SHELL: shell,
    PATH: `${tools}:${process.env.PATH ?? ''}`,
    WAYLAND_DISPLAY: 'wayland-test',
    SSH_CONNECTION: undefined,
    SSH_TTY: undefined,
  };

  const workspaceRoot = join(directory, 'work');

  await mkdir(workspaceRoot);
  await launchServer(socketPath, directory, environment);
  await createWorkspaceAt(socketPath, workspaceRoot);

  const terminal = startAttachTerminal({
    command: [process.execPath, 'src/index.ts', 'attach', '--socket', socketPath],
    cwd: root,
    environment,
    columns: 80 + sideListColumns,
    rows: 24,
  });

  onTestFinished(terminal.stop);

  const statusBar = (): string =>
    terminal.screen
      .text()
      .split('\n')
      .findLast((line) => line.trim() !== '') ?? '';

  const until = async (condition: () => boolean): Promise<void> => {
    await terminal.waitFor(condition, failureTimeoutMs, () => terminal.screen.text());
  };

  await until(() => terminal.screen.text().includes('ready'));

  return { type: terminal.type, statusBar, until, received: () => readReceived(received) };
};

it(
  'pastes a one-line clipboard into the pane on p in normal mode',
  async () => {
    const { type, statusBar, until, received } = await setupPaste(false, 'echo hi');

    type('\x02p');

    expect(await waitFor(async () => (await received()) === 'echo hi')).toBe(true);
    await until(() => statusBar().startsWith('NORMAL'));
  },
  cliTestTimeoutMs,
);

it(
  'pastes a multiline clipboard with markers into a pane with bracketed paste',
  async () => {
    const { type, statusBar, until, received } = await setupPaste(true, 'one\ntwo');

    type('\x02p');

    expect(await waitFor(async () => (await received()) === '\x1b[200~one\rtwo\x1b[201~')).toBe(
      true,
    );

    await until(() => statusBar().startsWith('NORMAL'));
  },
  cliTestTimeoutMs,
);

it(
  'asks before a multiline clipboard reaches a pane without bracketed paste, then pastes on y',
  async () => {
    const { type, statusBar, until, received } = await setupPaste(false, 'one\ntwo');

    type('\x02p');
    await until(() => statusBar().includes('Paste 2 lines') && statusBar().endsWith('y/n'));

    expect(await received()).toBe('');

    type('y');

    expect(await waitFor(async () => (await received()) === 'one\rtwo')).toBe(true);
    await until(() => !statusBar().includes('y/n') && statusBar().startsWith('NORMAL'));
  },
  cliTestTimeoutMs,
);
