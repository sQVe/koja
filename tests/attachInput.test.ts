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
import { accentWord, setup } from './paneAttachHarness.ts';

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

const eventually = async (condition: () => boolean | Promise<boolean>): Promise<void> => {
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

    await eventually(() => statusBar() === 'INSERT');
    type('\x02');
    await eventually(() => statusBar() === 'NORMAL');
    type('c');

    await eventually(async () => (await list()).length === 1);

    const created = (await list()).map((workspace) => ({
      root: workspace.root,
      label: workspace.label,
      focused: workspace.focused,
    }));

    expect(created).toEqual([{ root: startDirectory, label: 'start-here', focused: true }]);
    expect(statusBar()).toBe('NORMAL [1]');

    type('X');

    await eventually(async () => (await list()).length === 0);
    expect(statusBar()).toBe('NORMAL');
  },
  cliTestTimeoutMs,
);

const pollTimeoutMs = 10_000;

const pollIntervalMs = 50;

const listUntil = async (
  list: () => Promise<{ id: string; focused: boolean; columns: number; rows: number }[]>,
  condition: (panes: { id: string; focused: boolean; columns: number; rows: number }[]) => boolean,
) => {
  const deadline = Date.now() + pollTimeoutMs;
  let panes = await list();

  while (!condition(panes) && Date.now() < deadline) {
    await Bun.sleep(pollIntervalMs);
    panes = await list();
  }

  return panes;
};

const sizes = (panes: { columns: number; rows: number }[]) =>
  panes.map((pane) => [pane.columns, pane.rows]);

const region = (lines: string[], from: number, to: number): string[] =>
  lines.slice(0, 23).map((line) => line.slice(from, to).trimEnd());

it(
  'splits the focused pane below on Ctrl+B s and right on Ctrl+B v',
  async () => {
    const { list, type } = await setup();

    type('\x02s');

    const below = await listUntil(list, (panes) => panes.length === 2);

    expect(sizes(below)).toEqual([
      [78, 10],
      [78, 9],
    ]);

    type('v');

    const right = await listUntil(list, (panes) => panes.length === 3);

    expect(sizes(right)).toEqual([
      [78, 10],
      [38, 9],
      [37, 9],
    ]);
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

    await eventually(() => markedLine()?.startsWith('> beta') === true);
    await eventually(() => statusBar() === 'INSERT [1]');
    type('\x02');
    await eventually(() => statusBar() === 'NORMAL [1]');
    type('j');

    await eventually(() => markedLine()?.startsWith('> alpha') === true);
    expect(statusBar()).toBe('NORMAL [1]');
  },
  cliTestTimeoutMs,
);

it(
  'moves focus on Ctrl+B h and Ctrl+B l so typed keys reach the focused pane only',
  async () => {
    const { phi, list, lines, until, type, first } = await setup();

    await phi('pane', 'split', first, '--direction', 'right');
    await until(() => lines()[0]?.charAt(41) === '┌');

    const focusedId = async () => (await list()).find((pane) => pane.focused)?.id;
    const before = await focusedId();

    type('\x02h');
    await listUntil(list, (panes) => panes.find((pane) => pane.focused)?.id === first);
    type('iecho LEFTONLY\r');
    await until(() => lines().some((line) => line.slice(0, 40).includes('echo LEFTONLY')));

    expect(region(lines(), 42, 79).join('')).not.toContain('LEFTONLY');
    expect(before).not.toBe(first);

    type('\x02l');
    await listUntil(list, (panes) => panes.find((pane) => pane.focused)?.id === before);
    type('iecho RIGHTONLY\r');
    await until(() => lines().some((line) => line.slice(42).includes('echo RIGHTONLY')));

    expect(region(lines(), 1, 39).join('')).not.toContain('RIGHTONLY');
  },
  cliTestTimeoutMs,
);

it(
  'closes the pane of the workspace that j selected when x arrives in the same write',
  async () => {
    const { createWorkspace, list, statusBar, type } = await setupServer();

    await createWorkspace('alpha');
    await createWorkspace('beta');

    await eventually(() => statusBar() === 'INSERT [1]');
    type('\x02jx');

    await eventually(async () => (await list()).length === 1);

    const remaining = (await list()).map((workspace) => workspace.label);

    expect(remaining).toEqual(['beta']);
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

    await eventually(() => labels().includes('> h'));
    expect(statusBar()).toBe('INSERT [1]');

    type('\x02');
    await eventually(() => statusBar() === 'NORMAL [1]');

    for (let step = 0; step < 4; step += 1) {
      type('k');
      await eventually(() => labels().includes(`> ${'gfed'[step]}`));
    }

    expect(statusBar()).toBe('NORMAL [1]');
    expect(labels().filter((label) => label.startsWith('>'))).toHaveLength(1);
  },
  cliTestTimeoutMs,
);

it(
  'closes the focused pane on Ctrl+B x so its sibling fills the area',
  async () => {
    const { list, type, first } = await setup();

    type('\x02s');
    await listUntil(list, (panes) => panes.length === 2);

    type('x');

    const remaining = await listUntil(list, (panes) => panes.length === 1);

    expect(remaining.map((pane) => pane.id)).toEqual([first]);
    expect(sizes(remaining)).toEqual([[80, 23]]);
  },
  cliTestTimeoutMs,
);

it(
  'hides the side list in a 40-column client and gives the pane the full width',
  async () => {
    const { phi, createWorkspace, screen, statusBar } = await setupServer(10, 40);

    await createWorkspace('alpha');
    await eventually(() => statusBar() === 'INSERT [1]');

    const sent = await phi('pane', 'send', 'echo narrow-ok\r');

    expect(sent.exitCode).toBe(0);

    await eventually(() => screen.text().split('\n').includes('narrow-ok'));
    expect(screen.text()).not.toContain('alpha');
  },
  cliTestTimeoutMs,
);

it(
  'runs a command typed in the same write as Ctrl+B h in the newly focused pane only',
  async () => {
    const { phi, lines, until, type, first } = await setup();

    await phi('pane', 'split', first, '--direction', 'right');
    await until(() => lines()[0]?.charAt(41) === '┌');

    type('\x02hiecho LEFTRACE\r');

    await until(() => lines().some((line) => line.slice(0, 40).includes('echo LEFTRACE')));
    await Bun.sleep(300);

    expect(region(lines(), 42, 79).join('')).not.toContain('LEFTRACE');
  },
  cliTestTimeoutMs,
);

it(
  'runs a command typed in the same write as Ctrl+B l in the newly focused pane only',
  async () => {
    const { phi, lines, foreground, until, type, first } = await setup();

    await phi('pane', 'split', first, '--direction', 'right');
    await phi('pane', 'focus', first);
    await until(() => foreground(0, 0) === accentWord && foreground(0, 41) !== accentWord);

    type('\x02liecho RIGHTRACE\r');

    await until(() => lines().some((line) => line.slice(42).includes('echo RIGHTRACE')));
    await Bun.sleep(300);

    expect(region(lines(), 1, 39).join('')).not.toContain('RIGHTRACE');
  },
  cliTestTimeoutMs,
);

it(
  'sends text typed in the same write as Ctrl+B s to the new pane',
  async () => {
    const { lines, until, type } = await setup();

    type('\x02siecho BELOWRACE\r');

    await until(() =>
      lines()
        .slice(12, 23)
        .some((line) => line.includes('echo BELOWRACE')),
    );

    await Bun.sleep(300);

    expect(lines().slice(0, 11).join('')).not.toContain('BELOWRACE');
  },
  cliTestTimeoutMs,
);

const withFlags = (flags: number) => flags << 9;

const countOf = (text: string, part: string) => text.split(part).length - 1;

it('asks the outer terminal for kitty keys and puts it back on exit', async () => {
  const { setModes, outputText, hangUp, until } = await setupAttach(0);

  await until(() => outputText().includes('\x1b[>7u'));

  setModes(1, withFlags(8));

  await until(() => outputText().includes('\x1b[<u\x1b[>31u'));

  setModes(1, 0);

  await until(() => countOf(outputText(), '\x1b[<u\x1b[>7u') === 1);

  const before = outputText().length;

  hangUp();

  await until(() => outputText().slice(before).includes('\x1b[<u'));
});

it('gives a pane kitty keys while it holds flags, and its neighbor legacy keys', async () => {
  const { setModes, focusPane, type, receivedBy, outputText, until } = await setupAttach(0, {
    secondPane: true,
  });

  const ctrlA = '\x1b[97;5u';

  type(ctrlA);
  type('\x1b');
  await until(() => receivedBy(1) === '\x01\x1b');

  // Flags 9 make the client ask the outer terminal for 31, which shows it has read the update.
  setModes(1, withFlags(9));
  await until(() => outputText().includes('\x1b[>31u'));

  type(ctrlA);
  type('\x1b');
  await until(() => receivedBy(1) === `\x01\x1b${ctrlA}\x1b[27u`);

  setModes(1, 0);
  await until(() => countOf(outputText(), '\x1b[<u\x1b[>7u') === 1);

  type(ctrlA);
  await until(() => receivedBy(1) === `\x01\x1b${ctrlA}\x1b[27u\x01`);

  setModes(1, withFlags(9));
  await until(() => countOf(outputText(), '\x1b[>31u') === 2);

  focusPane(2);
  await until(() => countOf(outputText(), '\x1b[<u\x1b[>7u') === 2);

  type(ctrlA);
  type('\x1b');
  await until(() => receivedBy(2) === '\x01\x1b');
});

// Flags 9 make the client ask the outer terminal for 31, so each switch to 9 and back to the flags
// under test shows that the client has read the update.
const setFlags = async (
  attached: Awaited<ReturnType<typeof setupAttach>>,
  flags: number,
  round: number,
) => {
  attached.setModes(1, withFlags(9));
  await attached.until(() => countOf(attached.outputText(), '\x1b[>31u') === round);
  attached.setModes(1, withFlags(flags));
  await attached.until(() => countOf(attached.outputText(), '\x1b[<u\x1b[>7u') === round);
};

it('sends a release to a pane with flags 3, and not to a pane with flags 1', async () => {
  const attached = await setupAttach(0);
  const { type, receivedBy, until } = attached;

  const release = '\x1b[97;5:3u';
  const press = '\x1b[97;5u';

  await setFlags(attached, 3, 1);
  type(release);
  type(press);
  await until(() => receivedBy(1) === release + press);

  await setFlags(attached, 1, 2);
  type(release);
  type(press);
  await until(() => receivedBy(1) === release + press + press);
});

const kittyCases = [
  { flags: 0, literal: '\x02', letter: 'a' },
  { flags: 1, literal: '\x1b[98;5u', letter: 'a' },
  { flags: 31, literal: '\x1b[98;5u', letter: '\x1b[97;1;97u' },
];

for (const { flags, literal, letter } of kittyCases) {
  it(`runs Ctrl+B and then a pane key with kitty input under pane flags ${flags}`, async () => {
    const { type, receivedBy, statusBar, until } = await setupAttach(withFlags(flags));

    await until(() => statusBar() === 'INSERT [1]');

    type('\x1b[98;5u');
    await until(() => statusBar() === 'NORMAL [1]');

    type('\x1b[105u');
    await until(() => statusBar() === 'INSERT [1]');

    type('\x1b[98;5u');
    type('\x1b[98;5u');
    type('\x1b[97u');
    await until(() => receivedBy(1) === literal + letter);
  });
}
