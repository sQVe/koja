import { expect, it, onTestFinished } from 'bun:test';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { startAttachTerminal } from '../scripts/attachTerminal.ts';
import { sideListColumns } from '../src/layout.ts';
import {
  createFrameDecoder,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../src/protocol/protocol.ts';
import {
  cliTestTimeoutMs,
  environmentFor,
  launchServer,
  root,
  runCli,
  temporaryDirectory,
} from './cliHarness.ts';
import { createWorkspaceAt, waitFor } from './serverProcesses.ts';

interface PasteSetup {
  clipboardText: string;
  // Shell lines that run before the shell prints ready, and before it starts recording.
  beforeReady?: string;
  afterReady?: string;
  environment?: Record<string, string | undefined>;
}

interface HeldProxy {
  // Whether the proxy holds the server's frames, from the pane's running-state change on.
  holding: () => boolean;
}

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

const bracketedOn = "printf '\\033[?2004h'\n";

// The pane's shell copies every byte it gets, untranslated, to a file. The clipboard is a fake
// wl-paste that prints a file.
const setupPaste = async (setup: PasteSetup) => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'koja.sock');
  const received = join(directory, 'received');
  const tools = join(directory, 'tools');
  const clipboard = join(directory, 'clipboard');

  await mkdir(tools);
  await writeFile(clipboard, setup.clipboardText);
  await executable(join(tools, 'wl-paste'), `#!/bin/sh\nexec cat '${clipboard}'\n`);

  const shell = await executable(
    join(directory, 'recording-shell.sh'),
    `#!/bin/sh\nstty raw -echo\n${setup.beforeReady ?? ''}echo ready\n${setup.afterReady ?? ''}` +
      `exec cat >> '${received}'\n`,
  );

  const environment = {
    ...environmentFor(directory),
    SHELL: shell,
    PATH: `${tools}:${process.env.PATH ?? ''}`,
    WAYLAND_DISPLAY: 'wayland-test',
    SSH_CONNECTION: undefined,
    SSH_TTY: undefined,
    ...setup.environment,
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

  const koja = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  await until(() => terminal.screen.text().includes('ready'));

  return {
    type: terminal.type,
    statusBar,
    until,
    koja,
    directory,
    received: () => readReceived(received),
  };
};

it(
  'pastes a one-line clipboard into the pane on p in normal mode',
  async () => {
    const { type, statusBar, until, received } = await setupPaste({ clipboardText: 'echo hi' });

    type('\x02p');

    expect(await waitFor(async () => (await received()) === 'echo hi')).toBe(true);
    await until(() => statusBar().startsWith('NORMAL'));
  },
  cliTestTimeoutMs,
);

it(
  'pastes a multiline clipboard with markers into a pane with bracketed paste',
  async () => {
    const { type, statusBar, until, received } = await setupPaste({
      clipboardText: 'one\ntwo',
      beforeReady: bracketedOn,
    });

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
    const { type, statusBar, until, received } = await setupPaste({ clipboardText: 'one\ntwo' });

    type('\x02p');
    await until(() => statusBar().includes('Paste 2 lines') && statusBar().endsWith('y/n'));

    expect(await received()).toBe('');

    type('y');

    expect(await waitFor(async () => (await received()) === 'one\rtwo')).toBe(true);
    await until(() => !statusBar().includes('y/n') && statusBar().startsWith('NORMAL'));
  },
  cliTestTimeoutMs,
);

it(
  'sends a multiline host paste into a pane with bracketed paste through the server, wrapped in markers',
  async () => {
    const { type, received } = await setupPaste({ clipboardText: '', beforeReady: bracketedOn });

    type('\x1b[200~one\ntwo\x1b[201~');

    expect(await waitFor(async () => (await received()) === '\x1b[200~one\rtwo\x1b[201~')).toBe(
      true,
    );
  },
  cliTestTimeoutMs,
);

it(
  'asks before a multiline host paste when the pane turned bracketed paste off after the client last drew it',
  async () => {
    const trigger = 'turn-off';

    // Synchronized output holds the frame that turns bracketed paste off, so the client keeps the
    // old modes.
    const { type, statusBar, until, koja, directory, received } = await setupPaste({
      clipboardText: '',
      beforeReady: bracketedOn,
      afterReady:
        `while [ ! -f '${trigger}' ]; do sleep 0.01; done\n` +
        "printf '\\033[?2026h\\033[?2004l'\ntouch turned-off\n",
    });

    await writeFile(join(directory, 'work', trigger), '');

    expect(await waitFor(() => Bun.file(join(directory, 'work', 'turned-off')).exists())).toBe(
      true,
    );

    // The server's own answer shows that it has seen the mode change.
    const asked = await koja('pane', 'paste', 'server\ncheck', '--pane', 'pane-1', '--json');

    expect(JSON.parse(asked.stdout)).toMatchObject({ status: 'confirmationRequired' });

    type('\x1b[200~host\npaste\x1b[201~');
    await until(() => statusBar().includes('Paste 2 lines') && statusBar().endsWith('y/n'));

    expect(await received()).toBe('');

    type('y');

    expect(await waitFor(async () => (await received()) === 'host\rpaste')).toBe(true);
  },
  cliTestTimeoutMs,
);

it(
  'shows a clipboard failure in the status bar when the tab labels are wider than the terminal',
  async () => {
    const { type, statusBar, until, koja } = await setupPaste({
      clipboardText: '',
      environment: { SSH_CONNECTION: '10.0.0.1 1 10.0.0.2 22' },
    });

    const renamed = await koja('tab', 'rename', 'tab-1', 'x'.repeat(120));

    expect(renamed.exitCode).toBe(0);
    // The label does not fit, so the status bar shows only its start.
    await until(() => statusBar().startsWith('INSERT [1:'));

    type('\x02p');
    await until(() => statusBar().includes('Paste failed: no clipboard is available here.'));

    expect(statusBar()).not.toContain('[1:');
  },
  cliTestTimeoutMs,
);

const controlOf = (frame: { kind: FrameKind; payload: Uint8Array }) => {
  const parsed = frame.kind === FrameKind.control ? parseControl(frame.payload) : undefined;

  return parsed?.ok === true ? parsed.message : undefined;
};

const isRunningChange = (frame: { kind: FrameKind; payload: Uint8Array }): boolean => {
  const message = controlOf(frame);
  const change = message?.type === 'change' ? message.change : undefined;

  return change?.type === 'paneStateChanged' && change.lifecycle === 'running';
};

// Sits between one client and the server. It holds the server's frames from the pane's
// running-state change on, so the client keeps seeing the pane as starting while the server runs
// it. The first paste request from the client releases them.
const holdRunningChange = (proxyPath: string, socketPath: string): HeldProxy => {
  const held: Uint8Array[] = [];
  const early: Uint8Array[] = [];
  const serverFrames = createFrameDecoder();
  const clientFrames = createFrameDecoder();
  let holding = false;
  let released = false;
  let upstream: Bun.Socket | undefined;
  let downstream: Bun.Socket | undefined;

  const fromServer = (bytes: Uint8Array): void => {
    const decoded = serverFrames.push(bytes);

    if (!decoded.ok) {
      return;
    }

    for (const frame of decoded.frames) {
      holding ||= !released && isRunningChange(frame);

      const encoded = encodeFrame(frame.kind, frame.payload);

      if (holding) {
        held.push(encoded);
      } else {
        downstream?.write(encoded);
      }
    }
  };

  const fromClient = (bytes: Uint8Array): void => {
    const decoded = clientFrames.push(bytes);

    const pastes =
      decoded.ok && decoded.frames.some((frame) => controlOf(frame)?.type === 'panePaste');

    if (upstream === undefined) {
      early.push(bytes.slice());
    } else {
      upstream.write(bytes);
    }

    if (pastes && holding) {
      holding = false;
      released = true;

      for (const frame of held.splice(0)) {
        downstream?.write(frame);
      }
    }
  };

  const proxy = Bun.listen({
    unix: proxyPath,
    socket: {
      open: (socket) => {
        downstream = socket;

        Bun.connect({
          unix: socketPath,
          socket: {
            open: (server) => {
              upstream = server;

              for (const bytes of early.splice(0)) {
                server.write(bytes);
              }
            },
            data: (_server, bytes) => {
              fromServer(bytes);
            },
          },
        }).catch(() => {
          socket.end();
        });
      },
      data: (_socket, bytes) => {
        fromClient(bytes);
      },
    },
  });

  onTestFinished(() => {
    upstream?.end();
    proxy.stop(true);
  });

  return { holding: () => holding };
};

it(
  'asks before a multiline host paste while the client still sees the pane starting',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'koja.sock');
    const proxyPath = join(directory, 'proxy.sock');
    const received = join(directory, 'received');
    const workspaceRoot = join(directory, 'work');

    const shell = await executable(
      join(directory, 'recording-shell.sh'),
      `#!/bin/sh\nstty raw -echo\necho ready\nexec cat >> '${received}'\n`,
    );

    const environment = { ...environmentFor(directory), SHELL: shell };

    await mkdir(workspaceRoot);
    await launchServer(socketPath, directory, environment);

    const proxy = holdRunningChange(proxyPath, socketPath);

    const terminal = startAttachTerminal({
      command: [process.execPath, 'src/index.ts', 'attach', '--socket', proxyPath],
      cwd: root,
      environment,
      columns: 80 + sideListColumns,
      rows: 24,
    });

    onTestFinished(terminal.stop);

    const until = async (condition: () => boolean): Promise<void> => {
      await terminal.waitFor(condition, failureTimeoutMs, () => terminal.screen.text());
    };

    const statusBar = (): string =>
      terminal.screen
        .text()
        .split('\n')
        .findLast((line) => line.trim() !== '') ?? '';

    await until(() => terminal.screen.text().includes('No workspace'));
    await createWorkspaceAt(socketPath, workspaceRoot);

    expect(await waitFor(proxy.holding)).toBe(true);

    // The server's own answer shows that it already runs the pane.
    const asked = await runCli(
      ['pane', 'paste', 'server\ncheck', '--pane', 'pane-1', '--json', '--socket', socketPath],
      directory,
      environment,
    );

    expect(JSON.parse(asked.stdout)).toMatchObject({ status: 'confirmationRequired' });

    await until(() => statusBar().startsWith('INSERT [1]'));
    terminal.type('\x1b[200~host\npaste\x1b[201~');
    await until(() => statusBar().includes('Paste 2 lines') && statusBar().endsWith('y/n'));

    expect(await readReceived(received)).toBe('');

    terminal.type('y');

    expect(await waitFor(async () => (await readReceived(received)) === 'host\rpaste')).toBe(true);
  },
  cliTestTimeoutMs,
);
