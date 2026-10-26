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
  const socketPath = join(directory, 'run', 'koja.sock');
  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

  const koja = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  const started = await koja('server', 'start');

  expect(started.exitCode).toBe(0);

  const createWorkspace = async (name: string): Promise<void> => {
    const path = join(directory, name);

    await mkdir(path);

    const created = await koja('workspace', 'create', path, '--focus', '--json');

    expect(created.exitCode).toBe(0);
  };

  const list = async () => {
    const listed = await koja('workspace', 'list', '--json');

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
          const { reply } = screen.write(bytes);

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
    koja,
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

it(
  'draws the shortcut help over the panes on ? and removes it on Escape, staying in normal mode',
  async () => {
    const { createWorkspace, screen, statusBar, type } = await setupServer();

    await createWorkspace('alpha');
    await eventually(() => statusBar() === 'INSERT [1]');

    type('\x02');
    await eventually(() => statusBar() === 'NORMAL [1]');

    type('?');
    await eventually(() => screen.text().includes('Shortcuts'));
    expect(screen.text()).toContain('Next workspace');

    type('\x1b');
    await eventually(() => !screen.text().includes('Shortcuts'));
    expect(statusBar()).toBe('NORMAL [1]');
  },
  cliTestTimeoutMs,
);

const pollTimeoutMs = 10_000;

const pollIntervalMs = 50;

const listUntil = async (
  list: () => Promise<
    { id: string; tab: string; focused: boolean; columns: number; rows: number }[]
  >,
  condition: (
    panes: { id: string; tab: string; focused: boolean; columns: number; rows: number }[],
  ) => boolean,
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
  'moves the focused pane alone into a new tab on Ctrl+B !',
  async () => {
    const { koja, list, lines, foreground, until, type, first } = await setup();
    const second = await koja('pane', 'split', first, '--direction', 'right', '--json');
    const secondId = z.object({ pane: z.string() }).parse(JSON.parse(second)).pane;

    await until(() => lines()[0]?.charAt(41) === '┌' && foreground(0, 41) === accentWord);
    type('\x02!');
    await until(() => lines()[0]?.charAt(0) !== '┌');

    const moved = await list();
    const lone = moved.find((pane) => pane.id === secondId);
    const rest = moved.find((pane) => pane.id === first);

    expect(moved.map((pane) => pane.id).toSorted()).toEqual([first, secondId].toSorted());
    expect(lone?.focused).toBe(true);
    expect(moved.filter((pane) => pane.tab === lone?.tab)).toHaveLength(1);
    expect(rest?.tab).not.toBe(lone?.tab);
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
    const { koja, list, lines, until, type, first } = await setup();

    await koja('pane', 'split', first, '--direction', 'right');
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
    const { koja, createWorkspace, screen, statusBar } = await setupServer(10, 40);

    await createWorkspace('alpha');
    await eventually(() => statusBar() === 'INSERT [1]');

    const sent = await koja('pane', 'send', 'echo narrow-ok\r');

    expect(sent.exitCode).toBe(0);

    await eventually(() => screen.text().split('\n').includes('narrow-ok'));
    expect(screen.text()).not.toContain('alpha');
  },
  cliTestTimeoutMs,
);

it(
  'runs a command typed in the same write as Ctrl+B h in the newly focused pane only',
  async () => {
    const { koja, lines, until, type, first } = await setup();

    await koja('pane', 'split', first, '--direction', 'right');
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
    const { koja, lines, foreground, until, type, first } = await setup();

    await koja('pane', 'split', first, '--direction', 'right');
    await koja('pane', 'focus', first);
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

it('leaves the outer terminal kitty stack as it was after attach, 7, 31, 7, and hangup', async () => {
  const { setModes, outputText, hangUp, until } = await setupAttach(0);

  await until(() => outputText().includes('\x1b[>7u'));
  setModes(1, withFlags(8));
  await until(() => outputText().includes('\x1b[>31u'));
  setModes(1, 0);
  await until(() => countOf(outputText(), '\x1b[>7u') === 2);
  hangUp();
  await until(() => countOf(outputText(), '\x1b[<u') === 3);

  const sequences = outputText().match(new RegExp(String.raw`\u001b\[[<>]\d*u`, 'g')) ?? [];
  const stack: string[] = [];

  for (const sequence of sequences) {
    if (sequence.startsWith('\x1b[>')) {
      stack.push(sequence);
    } else {
      stack.pop();
    }
  }

  expect(sequences[0]).toBe('\x1b[>7u');
  expect(stack).toEqual([]);
});

const sgrClick = (column: number, row: number) =>
  `\x1b[<0;${column};${row}M\x1b[<0;${column};${row}m`;

// The side list takes 20 columns of the 80-column test terminal. A lone pane has no frame.
it('sends a click to a pane with mouse mode 1000 at its local SGR coordinates', async () => {
  const { type, receivedText, until } = await setupAttach(ModeFlag.normalMouse | ModeFlag.sgrMouse);

  type(sgrClick(25, 5));

  await until(() => receivedText().includes('m'));
  expect(receivedText()).toBe('\x1b[<0;5;5M\x1b[<0;5;5m');
});

it('sends a click in legacy encoding when the pane does not ask for SGR', async () => {
  const { type, receivedBytes, until } = await setupAttach(ModeFlag.normalMouse);

  type(sgrClick(25, 5));

  await until(() => receivedBytes().length >= 12);

  expect([...receivedBytes()]).toEqual([
    0x1b, 0x5b, 0x4d, 32, 37, 37, 0x1b, 0x5b, 0x4d, 35, 37, 37,
  ]);
});

const drag = '\x1b[<32;25;5M';
const motion = '\x1b[<35;25;5M';

it('sends a drag only to a pane with mode 1002, and plain motion only with 1003', async () => {
  const buttons = await setupAttach(ModeFlag.normalMouse | ModeFlag.sgrMouse);

  buttons.type(drag + motion + 'x');
  await buttons.until(() => buttons.receivedText().endsWith('x'));
  expect(buttons.receivedText()).toBe('x');

  const drags = await setupAttach(ModeFlag.buttonMouse | ModeFlag.sgrMouse);

  drags.type(drag + motion + 'x');
  await drags.until(() => drags.receivedText().endsWith('x'));
  expect(drags.receivedText()).toBe('\x1b[<32;5;5Mx');

  const everything = await setupAttach(ModeFlag.anyMouse | ModeFlag.sgrMouse);

  everything.type(drag + motion + 'x');
  await everything.until(() => everything.receivedText().endsWith('x'));
  expect(everything.receivedText()).toBe('\x1b[<32;5;5M\x1b[<35;5;5Mx');
});

it('sends nothing for a click or the wheel to a pane without a mouse mode', async () => {
  const { type, receivedText, until } = await setupAttach(0);

  type(sgrClick(25, 5) + '\x1b[<64;25;5M\x1b[<65;25;5Mx');

  await until(() => receivedText().endsWith('x'));
  expect(receivedText()).toBe('x');
});

it('sends a click only to the pane under the pointer, at its own coordinates', async () => {
  const { type, receivedBy, until } = await setupAttach(ModeFlag.normalMouse | ModeFlag.sgrMouse, {
    secondPane: true,
  });

  // The second pane's first cell is outer column 53, inside a one-cell frame.
  type(sgrClick(54, 4));

  await until(() => receivedBy(2).endsWith('m'));
  expect(receivedBy(1)).toBe('');
  expect(receivedBy(2)).toBe('\x1b[<0;2;3M\x1b[<0;2;3m');
});

it('focuses an unfocused pane that reports the mouse and sends it the click', async () => {
  const { type, receivedBy, statusBar, until } = await setupAttach(
    ModeFlag.normalMouse | ModeFlag.sgrMouse,
    { secondPane: true },
  );

  type(sgrClick(54, 4) + 'x');

  await until(() => receivedBy(2).endsWith('x'));
  expect(receivedBy(2)).toBe('\x1b[<0;2;3M\x1b[<0;2;3mx');
  expect(receivedBy(1)).toBe('');
  expect(statusBar()).toBe('INSERT [1]');
});

it('focuses a pane without a mouse mode, sends it nothing, and sends later keys to it', async () => {
  const { type, receivedBy, until } = await setupAttach(0, { secondPane: true });

  type(sgrClick(54, 4) + 'x');

  await until(() => receivedBy(2).endsWith('x'));
  expect(receivedBy(2)).toBe('x');
  expect(receivedBy(1)).toBe('');
});

it('turns the outer mouse modes on at attach and off after detach', async () => {
  const { outputText, hangUp, until } = await setupAttach(0);
  const on = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
  const off = '\x1b[?1006l\x1b[?1016l\x1b[?1015l\x1b[?1005l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

  await until(() => outputText().includes(on));

  hangUp();

  await until(() => outputText().includes(off));
});

it('turns the outer mouse modes off after a key-driven detach', async () => {
  const { outputText, type, until } = await setupAttach(0);
  const on = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
  const off = '\x1b[?1006l\x1b[?1016l\x1b[?1015l\x1b[?1005l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

  await until(() => outputText().includes(on));

  type('\x02d');

  await until(() => outputText().includes(off));
  expect(outputText().indexOf(off)).toBeGreaterThan(outputText().indexOf(on));
});

it('sends only the press of a click to a pane with mouse mode 9', async () => {
  const { type, receivedText, until } = await setupAttach(ModeFlag.x10Mouse | ModeFlag.sgrMouse);

  type(sgrClick(25, 5));
  type(sgrClick(26, 5));

  await until(() => receivedText().includes('\x1b[<0;6;5M'));
  expect(receivedText()).toBe('\x1b[<0;5;5M\x1b[<0;6;5M');
});
