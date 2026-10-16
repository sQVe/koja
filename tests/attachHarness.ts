import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clientId, paneId, tabId, workspaceId } from '../src/ids.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../src/protocol/protocol.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';
import { decodePaneInput, encodeRowUpdate, rowWords } from '../src/rows/rows.ts';
import { createTerminal } from '../src/vt/vt.ts';

export interface AttachHarness {
  statusBar: () => string | undefined;
  type: (input: string | Uint8Array) => void;
  receivedBytes: () => Buffer;
  receivedText: () => string;
  until: (condition: () => boolean) => Promise<undefined>;
  // The client reports its theme once the outer terminal has answered its color queries.
  themeReported: () => boolean;
  // What the outer terminal answered the client's queries, such as its palette colors.
  repliesText: () => string;
  // Updates a pane's mode word, as a pane does when it pushes or pops kitty flags.
  setModes: (pane: number, modes: number) => void;
  // Moves the focus to a pane of the tab.
  focusPane: (pane: number) => void;
  // The bytes the client sent to one pane.
  receivedBy: (pane: number) => string;
  // Everything the client wrote to the outer terminal.
  outputText: () => string;
  // Ends the client the way a terminal hangup does.
  hangUp: () => void;
}

interface AttachOptions {
  // Without truecolor, OpenTUI also asks for the palette on its own, at a time the tests do not
  // control, so the default keeps those replies out of tests that time their reads.
  truecolor?: boolean;
  // Adds a second pane to the tab. The first pane has the focus.
  secondPane?: boolean;
}

const makePane = (number: number) => ({
  id: paneId(number),
  tabId: tabId(1),
  lifecycle: 'running' as const,
  generation: 1,
  size: { columns: 80, rows: 23 },
  exitCode: undefined,
  startFolder: undefined,
  restored: false,
  error: undefined,
});

const makeTab = (panes: number, focused: number) => ({
  id: tabId(1),
  workspaceId: workspaceId(1),
  layout:
    panes === 1
      ? { kind: 'pane' as const, paneId: paneId(1) }
      : {
          kind: 'split' as const,
          direction: 'right' as const,
          ratio: 0.5,
          first: { kind: 'pane' as const, paneId: paneId(1) },
          second: { kind: 'pane' as const, paneId: paneId(2) },
        },
  focusedPaneId: paneId(focused),
  zoomedPaneId: undefined,
  label: undefined,
});

const workspace = {
  id: workspaceId(1),
  root: '/work/phi',
  label: 'phi',
  tabIds: [tabId(1)],
} as const;

const view = {
  focusedWorkspaceId: workspace.id,
  activeTabs: [{ workspaceId: workspace.id, tabId: tabId(1) }],
};

const failureTimeoutMs = 10_000;

const control = (message: ControlMessage) => encodeFrame(FrameKind.control, encodeControl(message));

const paneRows = (pane: number, sequence: number, modes: number) => {
  const columns = 80;
  const cells = new Uint32Array(rowWords(columns));

  return encodeFrame(
    FrameKind.rowUpdate,
    encodeRowUpdate({
      pane,
      sequence,
      size: { columns, rows: 23 },
      cursor: { x: 0, y: 0, visible: true },
      modes,
      epoch: 1,
      first: 0,
      activeTop: 0,
      rowCount: 1,
      cells,
      graphemes: new Uint32Array(),
      colors: new Uint32Array(),
    }),
  );
};

export const setupAttach = async (
  modes: number,
  options: AttachOptions = {},
): Promise<AttachHarness> => {
  const directory = await mkdtemp(join(tmpdir(), 'phi-attach-input-'));
  const socketPath = join(directory, 'phi.sock');
  const decoder = createFrameDecoder();
  const received: Uint8Array[] = [];
  const receivedPanes: number[] = [];
  const output: Uint8Array[] = [];
  const paneCount = options.secondPane === true ? 2 : 1;
  let connection: { write: (data: Uint8Array) => unknown } | undefined;
  let revision = 1;
  let focused = 1;
  let sequence = 1;
  let themeReported = false;
  const waiters = new Set<() => void>();

  const changed = () => {
    for (const waiter of waiters) {
      waiter();
    }
  };

  const snapshotFrame = () =>
    control({
      type: 'snapshot',
      snapshot: {
        revision,
        workspaces: [workspace],
        tabs: [makeTab(paneCount, focused)],
        panes: Array.from({ length: paneCount }, (_, index) => makePane(index + 1)),
        defaultView: view,
        attachedClientId: clientId(1),
        foregroundClientId: undefined,
        clients: [],
      },
    });

  const focusPane = (pane: number) => {
    revision += 1;
    focused = pane;
    connection?.write(snapshotFrame());
  };

  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      data: (socket, bytes) => {
        const decoded = decoder.push(bytes);

        if (!decoded.ok) {
          return;
        }

        for (const frame of decoded.frames) {
          if (frame.kind === FrameKind.input) {
            const input = decodePaneInput(frame.payload);

            if (input.ok) {
              received.push(input.input.bytes);
              receivedPanes.push(input.input.pane);
              changed();
            }

            continue;
          }

          const parsed = parseControl(frame.payload);

          if (parsed.ok && parsed.message.type === 'theme') {
            themeReported = true;
            changed();
          }

          if (parsed.ok && parsed.message.type === 'paneFocus') {
            focusPane(Number(parsed.message.paneId.slice('pane-'.length)));
            socket.write(control({ type: 'paneDone', paneId: parsed.message.paneId }));
          }

          if (parsed.ok && parsed.message.type === 'detach') {
            socket.write(control({ type: 'detached' }));
          }

          if (parsed.ok && parsed.message.type === 'hello') {
            socket.write(control({ type: 'welcome' }));
            connection = socket;

            for (let number = 1; number <= paneCount; number++) {
              socket.write(paneRows(number, sequence, modes));
            }

            socket.write(snapshotFrame());
          }
        }
      },
    },
  });

  const result = createTerminal(80, 24, 0);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  const screen = result.terminal;
  const replies: Uint8Array[] = [];
  const { COLORTERM: _colorTerm, ...environment } = process.env;
  const colorTerm = options.truecolor === false ? {} : { COLORTERM: 'truecolor' };

  const client = Bun.spawn([process.execPath, 'src/index.ts', 'attach', '--socket', socketPath], {
    env: { ...environment, ...colorTerm, TERM: 'xterm-256color' },
    terminal: {
      cols: 80,
      rows: 24,
      data: (terminal, bytes) => {
        output.push(bytes.slice());

        const { reply } = screen.write(bytes);

        if (reply !== undefined) {
          replies.push(reply);
          terminal.write(reply);
        }

        changed();
      },
    },
  });

  onTestFinished(async () => {
    client.kill();
    await client.exited;
    client.terminal?.close();
    screen[Symbol.dispose]();
    listener.stop(true);
    await rm(directory, { recursive: true, force: true });
  });

  const statusBar = () =>
    screen
      .text()
      .split('\n')
      .findLast((line) => line.trim() !== '');

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
      done.reject(new Error('The condition did not hold in time.'));
    }, failureTimeoutMs);

    waiters.add(check);
    check();

    return done.promise.finally(() => {
      clearTimeout(timer);
    });
  };

  const type = (input: string | Uint8Array) => {
    client.terminal?.write(input);
  };

  const setModes = (pane: number, next: number) => {
    sequence += 1;
    connection?.write(paneRows(pane, sequence, next));
  };

  const receivedBy = (pane: number) =>
    Buffer.concat(received.filter((_, index) => receivedPanes[index] === pane)).toString();

  const outputText = () => Buffer.concat(output).toString();

  const receivedBytes = () => Buffer.concat(received);

  const receivedText = () => receivedBytes().toString();

  const repliesText = () => Buffer.concat(replies).toString();

  // Typing before the color replies arrive would race them through the client's stdin.
  await until(() => themeReported);

  return {
    statusBar,
    type,
    receivedBytes,
    receivedText,
    setModes,
    focusPane,
    receivedBy,
    outputText,
    hangUp: () => {
      client.kill('SIGHUP');
    },
    until,
    repliesText,
    themeReported: () => themeReported,
  };
};
