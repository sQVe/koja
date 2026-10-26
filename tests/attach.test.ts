import { expect, it, onTestFinished } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readVersions } from '../src/cli/versions.ts';
import { sideListColumns } from '../src/layout.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../src/protocol/protocol.ts';
import { CursorShape } from '../src/rows/rows.ts';
import { createTerminal } from '../src/vt/vt.ts';
import {
  cliTestTimeoutMs,
  environmentFor,
  launchServer,
  runCli,
  runCliProcess,
} from './cliHarness.ts';
import { createWorkspaceAt, endServersIn, serverProcessesIn, waitFor } from './serverProcesses.ts';

const attachClient = (
  socketPath: string,
  commandArguments = ['attach'],
  extraEnvironment: Record<string, string> = {},
) => {
  const result = createTerminal(80, 24, 0);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  const screen = result.terminal;

  const client = Bun.spawn(
    [process.execPath, 'src/index.ts', ...commandArguments, '--socket', socketPath],
    {
      env: { ...process.env, ...extraEnvironment, TERM: 'xterm-256color' },
      terminal: {
        cols: 80,
        rows: 24,
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

  return { client, screen };
};

const setup = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-attach-'));
  const socketPath = join(directory, 'koja.sock');

  const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: 'attach-prompt> ' };

  const commandWith =
    (runner: typeof runCli) =>
    async (...commandArguments: string[]) => {
      const run = await runner(
        [...commandArguments, '--socket', socketPath],
        directory,
        environment,
      );

      expect(run.exitCode).toBe(0);
      expect(run.stderr).toBe('');

      return run.stdout;
    };

  const command = commandWith(runCli);
  const processCommand = commandWith(runCliProcess);

  onTestFinished(async () => {
    await endServersIn(directory);
    await rm(directory, { recursive: true, force: true });
  });

  await launchServer(socketPath, directory, environment);
  await createWorkspaceAt(socketPath, directory);

  const { client, screen } = attachClient(socketPath);

  return { command, processCommand, client, screen, socketPath, directory };
};

// The pane area, without the side list columns.
const paneText = (screen: { text: () => string }): string =>
  screen
    .text()
    .split('\n')
    .map((row) => row.slice(sideListColumns))
    .join('\n');

const readPaneSizes = async (socketPath: string) => {
  const versions = readVersions();

  if (!versions.ok) {
    throw new Error(versions.message);
  }

  const answer = Promise.withResolvers<{ columns: number; rows: number }[]>();
  const decoder = createFrameDecoder();

  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data: (_socket, bytes) => {
        const decoded = decoder.push(bytes);

        if (!decoded.ok) {
          answer.reject(new Error(decoded.reason));

          return;
        }

        for (const frame of decoded.frames) {
          const parsed = parseControl(frame.payload);

          if (parsed.ok && parsed.message.type === 'snapshot') {
            answer.resolve(parsed.message.snapshot.panes.map((pane) => pane.size));
          }
        }
      },
      close: () => {
        answer.reject(new Error('Connection closed before snapshot.'));
      },
    },
  });

  const hello = encodeControl({ type: 'hello', version: versions.versions, size: undefined });

  socket.write(encodeFrame(FrameKind.control, hello));

  try {
    return await answer.promise;
  } finally {
    socket.end();
  }
};

const readPaneSize = async (socketPath: string) => (await readPaneSizes(socketPath))[0];

const lastLine = (text: string) => text.split('\n').findLast((line) => line.trim() !== '');

it('shows the shell screen and cursor', async () => {
  const { command, screen } = await setup();

  await command('pane', 'send', 'echo koja-attach-ok\r');

  expect(await waitFor(() => /^koja-attach-ok *$/m.test(paneText(screen)), 3000)).toBe(true);

  const rows = paneText(screen).split('\n');
  const outputRow = rows.findIndex((row) => row.startsWith('koja-attach-ok'));

  expect(rows[outputRow + 1]).toContain('attach-prompt>');
  expect(screen.text()).toContain('INSERT');

  const promptColumn = sideListColumns + 'attach-prompt> '.length;

  expect(screen.frame().cursor).toEqual({
    x: promptColumn,
    y: outputRow + 1,
    visible: true,
    shape: CursorShape.default,
    blinking: false,
  });
});

it('resizes the pane to the client size less the side list and the status bar', async () => {
  const { client, screen, socketPath, command } = await setup();

  expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);
  screen.resize(100, 30);
  client.terminal?.resize(100, 30);
  await command('pane', 'send', 'echo resized-screen\r');

  expect(await waitFor(() => screen.text().split('\n')[29] === 'INSERT [1]')).toBe(true);
  expect(await readPaneSize(socketPath)).toEqual({ columns: 100 - sideListColumns, rows: 29 });
  expect(await waitFor(() => screen.text().includes('resized-screen'))).toBe(true);
});

it.each(['SIGTERM', 'SIGINT', 'SIGHUP'] as const)(
  'restores the terminal and leaves the shell running on %s',
  async (signal) => {
    const { client, screen, command } = await setup();

    expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);
    expect(screen.stableRows().alternate).toBe(true);
    client.kill(signal);

    expect(await client.exited).toBe(0);
    expect(await waitFor(() => !screen.stableRows().alternate)).toBe(true);
    expect(screen.frame().cursor.visible).toBe(true);
    await command('pane', 'send', 'echo still-running\r');

    const echoed = async () => (await command('pane', 'read', 'pane-1')).includes('still-running');

    expect(await waitFor(echoed)).toBe(true);
  },
);

it('exits with code one and reports a connection failure after the handshake', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-attach-failure-'));
  const socketPath = join(directory, 'koja.sock');
  const stderrPath = join(directory, 'stderr');
  const decoder = createFrameDecoder();
  let receivedResize = false;

  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      data: (socket, bytes) => {
        const decoded = decoder.push(bytes);

        if (!decoded.ok) {
          socket.end();

          return;
        }

        for (const frame of decoded.frames) {
          const parsed = parseControl(frame.payload);

          if (!parsed.ok) {
            socket.end();

            return;
          }

          if (parsed.message.type === 'hello') {
            socket.write(encodeFrame(FrameKind.control, encodeControl({ type: 'welcome' })));

            socket.write(
              encodeFrame(
                FrameKind.control,
                encodeControl({
                  type: 'snapshot',
                  snapshot: {
                    revision: 0,
                    workspaces: [],
                    tabs: [],
                    panes: [],
                    defaultView: { focusedWorkspaceId: undefined, activeTabs: [], scrolls: [] },
                    attachedClientId: undefined,
                    foregroundClientId: undefined,
                    clients: [],
                  },
                }),
              ),
            );
          }

          if (parsed.message.type === 'resize') {
            receivedResize = true;
            socket.write(encodeFrame(FrameKind.control, new TextEncoder().encode('{')));
          }
        }
      },
    },
  });

  const client = Bun.spawn(
    [
      '/bin/sh',
      '-c',
      'exec "$1" src/index.ts attach --socket "$2" 2>"$3"',
      'koja-attach-test',
      process.execPath,
      socketPath,
      stderrPath,
    ],
    {
      env: { ...process.env, TERM: 'xterm-256color' },
      terminal: { cols: 80, rows: 24, data: () => undefined },
    },
  );

  onTestFinished(async () => {
    client.kill();
    await client.exited;
    client.terminal?.close();
    listener.stop(true);
    await rm(directory, { recursive: true, force: true });
  });

  expect(await client.exited).toBe(1);
  expect(receivedResize).toBe(true);

  const error = await readFile(stderrPath, 'utf8');

  expect(error).toContain(socketPath);
  expect(error).toContain('failed');
});

it('exits with code zero when the server stops', async () => {
  const { client, screen, command } = await setup();

  expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);
  await command('server', 'stop');

  expect(await client.exited).toBe(0);
  expect(await waitFor(() => !screen.stableRows().alternate)).toBe(true);
  expect(screen.frame().cursor.visible).toBe(true);
});

const pressDetach = async (
  client: ReturnType<typeof attachClient>['client'],
  screen: ReturnType<typeof attachClient>['screen'],
) => {
  client.terminal?.write('\x02');
  expect(await waitFor(() => screen.text().includes('NORMAL'))).toBe(true);
  client.terminal?.write('d');
};

it('detaches on Ctrl+B then d and leaves the shell running', async () => {
  const { client, screen, command } = await setup();

  expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);
  await command('pane', 'send', 'echo before-$((1+1))\r');
  expect(await waitFor(() => screen.text().includes('before-2'))).toBe(true);
  await pressDetach(client, screen);

  expect(await client.exited).toBe(0);
  expect(await waitFor(() => !screen.stableRows().alternate)).toBe(true);
  expect(screen.text()).toContain('Detached from');
  expect(await command('pane', 'read', 'pane-1')).toContain('before-2');
});

it('shows the same screen text when a new client attaches after a detach', async () => {
  const { client, screen, command, socketPath } = await setup();

  expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);
  await command('pane', 'send', 'echo same-$((1+1))\r');

  const finished = () => /^same-2 *\nattach-prompt>/m.test(paneText(screen));

  expect(await waitFor(finished)).toBe(true);
  const before = screen.text().split('\n').slice(0, -1).join('\n');
  await pressDetach(client, screen);
  expect(await client.exited).toBe(0);

  const next = attachClient(socketPath);

  expect(await waitFor(() => next.screen.text().includes('INSERT'))).toBe(true);
  expect(next.screen.text().split('\n').slice(0, -1).join('\n')).toBe(before);
});

it('detaches the attached client when koja detach runs in another process', async () => {
  const { client, screen, processCommand } = await setup();

  expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);
  expect(await processCommand('detach')).toContain('Detached');

  expect(await client.exited).toBe(0);
  expect(await waitFor(() => !screen.stableRows().alternate)).toBe(true);
  expect(screen.text()).toContain('Detached from');
});

it('lets a second client take over and tells the first one', async () => {
  const { client, screen, socketPath } = await setup();

  expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);

  const second = attachClient(socketPath);

  expect(await client.exited).toBe(0);
  expect(await waitFor(() => !screen.stableRows().alternate)).toBe(true);
  expect(screen.text()).toContain('Another client took over');
  expect(await waitFor(() => second.screen.text().includes('INSERT'))).toBe(true);
});

const runKoja = async (directory: string, ...commandArguments: string[]) => {
  const run = await runCli(commandArguments, directory);

  return { code: run.exitCode, stdout: run.stdout, stderr: run.stderr };
};

it('reports when no client is attached to koja detach', async () => {
  const { client, screen, command, socketPath, directory } = await setup();

  expect(await waitFor(() => screen.text().includes('INSERT'))).toBe(true);
  await command('detach');
  expect(await client.exited).toBe(0);

  const plain = await runKoja(directory, 'detach', '--socket', socketPath);

  expect(plain.code).toBe(1);
  expect(plain.stderr).toContain('No client is attached');

  const json = await runKoja(directory, 'detach', '--json', '--socket', socketPath);

  expect(json.code).toBe(1);
  expect(JSON.parse(json.stdout)).toEqual({ detached: false, reason: 'noClient' });
});

const setupWithoutServer = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-default-'));
  const socketPath = join(directory, 'koja.sock');

  const environment = {
    SHELL: '/bin/sh',
    PS1: 'attach-prompt> ',
    XDG_STATE_HOME: join(directory, 'state'),
  };

  onTestFinished(async () => {
    await endServersIn(directory);
    await rm(directory, { recursive: true, force: true });
  });

  return { directory, socketPath, environment };
};

it('starts a server and attaches when koja runs with no server', async () => {
  const { directory, socketPath, environment } = await setupWithoutServer();
  const { screen } = attachClient(socketPath, [], environment);

  expect(await waitFor(() => serverProcessesIn(directory).length === 1)).toBe(true);
  expect(await waitFor(() => existsSync(socketPath))).toBe(true);
  await createWorkspaceAt(socketPath, directory);
  expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);

  const read = await runCli(['pane', 'read', 'pane-1', '--socket', socketPath], directory, {
    ...environmentFor(directory),
    ...environment,
  });

  expect(read.exitCode).toBe(0);
  expect(read.stdout).toContain('attach-prompt>');
});

it('attaches to the running server without starting another', async () => {
  const { directory, socketPath, environment } = await setupWithoutServer();
  const first = attachClient(socketPath, [], environment);

  expect(await waitFor(() => existsSync(socketPath))).toBe(true);
  await createWorkspaceAt(socketPath, directory);
  expect(await waitFor(() => first.screen.text().includes('INSERT'))).toBe(true);

  const before = serverProcessesIn(directory);
  const second = attachClient(socketPath, [], environment);

  expect(await first.client.exited).toBe(0);
  expect(await waitFor(() => second.screen.text().includes('INSERT'))).toBe(true);
  expect(serverProcessesIn(directory)).toEqual(before);
});

it('attaches both koja runs to one server when they start together', async () => {
  const { directory, socketPath, environment } = await setupWithoutServer();
  const first = attachClient(socketPath, [], environment);
  const second = attachClient(socketPath, [], environment);

  expect(await waitFor(() => existsSync(socketPath))).toBe(true);
  await createWorkspaceAt(socketPath, directory);

  expect(
    await waitFor(
      () => first.screen.text().includes('INSERT') || second.screen.text().includes('INSERT'),
    ),
  ).toBe(true);

  expect(await waitFor(() => serverProcessesIn(directory).length === 1)).toBe(true);
  await Bun.sleep(300);
  expect(serverProcessesIn(directory)).toHaveLength(1);

  const running = () => [first, second].filter((koja) => koja.client.exitCode === null);

  expect(await waitFor(() => running().length === 1)).toBe(true);

  expect(
    [first, second].map((koja) => koja.client.exitCode).filter((code) => code !== null),
  ).toEqual([0]);
});

it('keeps the server running after the only shell exits', async () => {
  const { directory, socketPath, environment } = await setupWithoutServer();
  const { client, screen } = attachClient(socketPath, [], environment);

  expect(await waitFor(() => existsSync(socketPath))).toBe(true);
  await createWorkspaceAt(socketPath, directory);
  expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);
  client.terminal?.write('exit\r');

  const exitedEarly = await Promise.race([client.exited, Bun.sleep(1000).then(() => 'running')]);

  expect(exitedEarly).toBe('running');
  expect(existsSync(socketPath)).toBe(true);
  expect(serverProcessesIn(directory)).toHaveLength(1);
});

const emptyHint = 'koja workspace create <dir>';

it('switches to the pane of the workspace that koja workspace focus names', async () => {
  const { directory, screen, command } = await setup();

  expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);
  await command('pane', 'send', 'echo first-$((1+1))\r');
  expect(await waitFor(() => screen.text().includes('first-2'))).toBe(true);

  const listed = JSON.parse(await command('workspace', 'list', '--json')) as { id: string }[];
  const firstWorkspace = listed[0]?.id ?? '';

  await mkdir(join(directory, 'second'));
  await command('workspace', 'create', join(directory, 'second'), '--focus');
  await command('pane', 'send', 'echo second-$((2+3))\r');
  expect(await waitFor(() => screen.text().includes('second-5'))).toBe(true);
  expect(screen.text()).not.toContain('first-2');

  await command('workspace', 'focus', firstWorkspace);

  expect(await waitFor(() => screen.text().includes('first-2'))).toBe(true);
  expect(screen.text()).not.toContain('second-5');
});

it('shows the empty screen when the only pane exits and the server keeps running', async () => {
  const { directory, screen, command } = await setup();

  expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);
  await command('pane', 'send', 'exit\r');

  expect(await waitFor(() => screen.text().includes(emptyHint))).toBe(true);
  expect(screen.text()).not.toContain('attach-prompt>');
  expect(JSON.parse(await command('workspace', 'list', '--json'))).toEqual([]);
  expect(serverProcessesIn(directory)).toHaveLength(1);
});

it('shows the empty screen when koja starts with no server', async () => {
  const { socketPath, environment } = await setupWithoutServer();
  const { screen } = attachClient(socketPath, [], environment);

  expect(await waitFor(() => screen.text().includes(emptyHint))).toBe(true);
});

it('creates a tab on Ctrl+B then t and lists both tabs in the status bar', async () => {
  const { client, screen, command } = await setup();

  expect(await waitFor(() => lastLine(screen.text()) === 'INSERT [1]')).toBe(true);
  client.terminal?.write('\x02t');

  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 [2]')).toBe(true);

  const tabs = JSON.parse(await command('tab', 'list', '--json')) as {
    number: number;
    active: boolean;
  }[];

  expect(tabs.map((tab) => ({ number: tab.number, active: tab.active }))).toEqual([
    { number: 1, active: false },
    { number: 2, active: true },
  ]);
});

it('shows the first tab again after H and 1 without resizing a pane', async () => {
  const { client, screen, command, socketPath } = await setup();

  expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);
  await command('pane', 'send', 'echo tab-one-marker\r');
  expect(await waitFor(() => paneText(screen).includes('\ntab-one-marker\n'))).toBe(true);
  client.terminal?.write('\x02t');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 [2]')).toBe(true);
  expect(await waitFor(() => !screen.text().includes('tab-one-marker'))).toBe(true);

  const sizes = await readPaneSizes(socketPath);

  client.terminal?.write('H');
  expect(await waitFor(() => screen.text().includes('tab-one-marker'))).toBe(true);
  expect(lastLine(screen.text())).toBe('NORMAL [1] 2');
  client.terminal?.write('2');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 [2]')).toBe(true);
  client.terminal?.write('1');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL [1] 2')).toBe(true);
  expect(await waitFor(() => screen.text().includes('tab-one-marker'))).toBe(true);
  expect((await readPaneSizes(socketPath)).slice(0, sizes.length)).toEqual(sizes);
});

it('closes the workspace and shows the empty screen when the only pane of the only tab exits', async () => {
  const { client, screen, command } = await setup();

  expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);
  client.terminal?.write('exit\r');

  expect(await waitFor(() => screen.text().includes(emptyHint))).toBe(true);
  expect(JSON.parse(await command('workspace', 'list', '--json'))).toEqual([]);
  expect(JSON.parse(await command('tab', 'list', '--json'))).toEqual([]);
});

it('sends text typed in the same read as a tab key to the newly shown pane', async () => {
  const { client, screen } = await setup();

  expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);
  client.terminal?.write('\x02t');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 [2]')).toBe(true);
  client.terminal?.write('1');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL [1] 2')).toBe(true);
  client.terminal?.write('Liecho same-read-text\r');
  expect(await waitFor(() => lastLine(screen.text()) === 'INSERT 1 [2]')).toBe(true);
  expect(await waitFor(() => paneText(screen).includes('\nsame-read-text\n'))).toBe(true);
  client.terminal?.write('\x02H');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL [1] 2')).toBe(true);
  expect(screen.text()).not.toContain('same-read-text');
});

it('shows the tab from the new-tab key and keeps the view on a tab from koja tab create', async () => {
  const { client, screen, command } = await setup();

  expect(await waitFor(() => lastLine(screen.text()) === 'INSERT [1]')).toBe(true);
  await command('tab', 'create');
  expect(await waitFor(() => lastLine(screen.text()) === 'INSERT [1] 2')).toBe(true);
  client.terminal?.write('\x02t');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 2 [3]')).toBe(true);
});

it('reaches the third tab when two next-tab presses arrive in one read', async () => {
  const { client, screen } = await setup();

  expect(await waitFor(() => lastLine(screen.text()) === 'INSERT [1]')).toBe(true);
  client.terminal?.write('\x02t');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 [2]')).toBe(true);
  client.terminal?.write('t');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 2 [3]')).toBe(true);
  client.terminal?.write('1');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL [1] 2 3')).toBe(true);
  client.terminal?.write('LL');
  expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 2 [3]')).toBe(true);
});

it(
  'encodes a paste in the same read as a tab key with the modes of the newly shown pane',
  async () => {
    const { client, screen, command } = await setup();

    expect(await waitFor(() => screen.text().includes('attach-prompt>'))).toBe(true);
    client.terminal?.write('\x02t');
    expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 [2]')).toBe(true);
    client.terminal?.write('H');
    expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL [1] 2')).toBe(true);

    await command(
      'pane',
      'send',
      "printf '\\033[?2004h'; echo paste-$((1+1)); cat -v\r",
      '--pane',
      'pane-2',
    );

    expect(
      await waitFor(async () => (await command('pane', 'read', 'pane-2')).includes('paste-2')),
    ).toBe(true);

    client.terminal?.write('L\x1b[200~xy\nz\x1b[201~');
    expect(await waitFor(() => lastLine(screen.text()) === 'NORMAL 1 [2]')).toBe(true);
    expect(await waitFor(() => screen.text().includes('^[[200~xy'))).toBe(true);
  },
  cliTestTimeoutMs,
);
