import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runPaneAction } from '../src/cli/paneCommands.ts';
import { runDetach, runPaneRead, runPaneSend, runWorkspaceCommand } from '../src/client/client.ts';
import { paneId, tabId, workspaceId } from '../src/ids.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../src/protocol/protocol.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';
import {
  cellWords,
  encodePaneRows,
  PaneRowsSource,
  rowHeaderWords,
  rowWords,
} from '../src/rows/rows.ts';
import type { PaneRows } from '../src/rows/rows.ts';
import { runCli, temporaryDirectory } from './cliHarness.ts';

type Reply = ControlMessage | PaneRows;

const version = { version: 'test', ghostty: 'test-ghostty' };

const snapshot = (live: boolean): ControlMessage => ({
  type: 'snapshot',
  snapshot: {
    revision: 2,
    workspaces: live
      ? [
          {
            id: workspaceId(1),
            root: '/work/koja',
            label: 'koja',
            tabIds: [tabId(1)],
          },
        ]
      : [],
    tabs: live
      ? [
          {
            id: tabId(1),
            workspaceId: workspaceId(1),
            layout: { kind: 'pane', paneId: paneId(7) },
            arrangement: { choice: 'legacy', order: [paneId(7)] },
            focusedPaneId: paneId(7),
            zoomedPaneId: undefined,
            label: undefined,
          },
        ]
      : [],
    panes: live
      ? [
          {
            id: paneId(7),
            tabId: tabId(1),
            lifecycle: 'running',
            generation: 1,
            size: { columns: 80, rows: 24 },
            exitCode: undefined,
            startFolder: undefined,
            restored: false,
            error: undefined,
          },
        ]
      : [],
    defaultView: {
      focusedWorkspaceId: live ? workspaceId(1) : undefined,
      activeTabs: live ? [{ workspaceId: workspaceId(1), tabId: tabId(1) }] : [],
      scrolls: [],
    },
    attachedClientId: undefined,
    foregroundClientId: undefined,
    clients: [],
  },
});

// One row of text as a rows reply to the request.
const readCommand = {
  action: 'read',
  pane: paneId(7),
  source: 'visible',
  lines: undefined,
  range: undefined,
} as const;

const rowsReply = (text: string, requestId: number): PaneRows => {
  const cells = new Uint32Array(rowWords(text.length));

  for (let column = 0; column < text.length; column += 1) {
    cells[rowHeaderWords + column * cellWords] = text.charCodeAt(column);
  }

  return {
    pane: 9,
    requestId,
    source: PaneRowsSource.recent,
    columns: text.length,
    epoch: 0,
    screen: 0,
    remaining: 0,
    oldest: 0,
    first: 0,
    rowCount: 1,
    cells,
    graphemes: new Uint32Array(),
  };
};

const listen = async (respond: (message: ControlMessage) => Reply[] | undefined) => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-pane-client-'));
  const socketPath = join(directory, 'koja.sock');
  const received: ControlMessage[] = [];
  const failures: string[] = [];
  const decoder = createFrameDecoder();

  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      data: (socket, bytes) => {
        const decoded = decoder.push(bytes);

        if (!decoded.ok) {
          failures.push(decoded.reason);
          socket.end();

          return;
        }

        for (const frame of decoded.frames) {
          const parsed = parseControl(frame.payload);

          if (!parsed.ok) {
            failures.push(parsed.reason);
            socket.end();

            return;
          }

          received.push(parsed.message);

          const responses = respond(parsed.message);

          if (responses === undefined) {
            socket.end();

            return;
          }

          for (const reply of responses) {
            const sent =
              'type' in reply
                ? encodeFrame(FrameKind.control, encodeControl(reply))
                : encodeFrame(FrameKind.paneRows, encodePaneRows(reply));

            socket.write(sent);
          }
        }
      },
    },
  });

  onTestFinished(async () => {
    listener.stop(true);
    await rm(directory, { recursive: true, force: true });
  });

  return { socketPath, received, failures };
};

it('returns a missing pane without sending a command when the snapshot has no live pane', async () => {
  const server = await listen(() => [{ type: 'welcome' }, snapshot(false)]);
  const result = await runPaneSend(server.socketPath, version, { action: 'send', text: 'hello' });

  expect(result).toEqual({ ok: false, reason: 'paneMissing' });
  expect(server.received).toEqual([{ type: 'hello', version, size: undefined }]);
  expect(server.failures).toEqual([]);
});

it.each(['read', 'send'] as const)('reports a pane lost before %s', async (action) => {
  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }, snapshot(true)];
    }

    return [{ type: 'paneMissing', paneId: paneId(7) }];
  });

  const result =
    action === 'read'
      ? await runPaneRead(server.socketPath, version, readCommand)
      : await runPaneSend(server.socketPath, version, { action, text: 'hello' });

  const expected: ControlMessage =
    action === 'read'
      ? {
          type: 'paneRead',
          paneId: paneId(7),
          requestId: 1,
          selection: { source: 'visible', lines: undefined },
        }
      : { type: 'paneSend', paneId: paneId(7), text: 'hello' };

  expect(result).toEqual({ ok: false, reason: 'paneMissing' });
  expect(server.received).toEqual([{ type: 'hello', version, size: undefined }, expected]);
  expect(server.failures).toEqual([]);
});

it('returns a connection failure when the server closes before answering', async () => {
  const server = await listen(() => undefined);
  const result = await runPaneRead(server.socketPath, version, readCommand);

  expect(result).toEqual({ ok: false, reason: 'connectionFailed' });
  expect(server.received).toEqual([{ type: 'hello', version, size: undefined }]);
  expect(server.failures).toEqual([]);
});

it('rejects a snapshot sent before welcome without sending pane input', async () => {
  const server = await listen(() => [snapshot(true)]);

  const result = await runPaneSend(server.socketPath, version, {
    action: 'send',
    text: 'not-sent',
  });

  expect(result).toEqual({ ok: false, reason: 'connectionFailed' });
  expect(server.received).toEqual([{ type: 'hello', version, size: undefined }]);
  expect(server.failures).toEqual([]);
});

it.each([
  ['succeeds', { ok: true }],
  ['fails with noClient', { ok: false, reason: 'noClient' }],
  ['fails with unknownClient', { ok: false, reason: 'unknownClient' }],
] as const)('returns a detach that %s after sending detach', async (_name, answer) => {
  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }, snapshot(true)];
    }

    return [{ type: 'detachResult', result: answer }];
  });

  const result = await runDetach(server.socketPath, version, undefined);

  expect(result).toEqual(answer);

  expect(server.received).toEqual([
    { type: 'hello', version, size: undefined },
    { type: 'detach', clientId: undefined },
  ]);

  expect(server.failures).toEqual([]);
});

it('returns noServer from detach when no server listens', async () => {
  expect(await runDetach('/nonexistent/koja.sock', version, undefined)).toEqual({
    ok: false,
    reason: 'noServer',
  });
});

it('delivers a command larger than the socket buffer in full', async () => {
  const text = 'x'.repeat(2_000_000);

  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }, snapshot(true)];
    }

    return message.type === 'paneSend' ? [{ type: 'paneSent', paneId: message.paneId }] : [];
  });

  const result = await runPaneSend(server.socketPath, version, { action: 'send', text });

  expect(result).toEqual({ ok: true });
  expect(server.received.at(-1)).toEqual({ type: 'paneSend', paneId: paneId(7), text });
  expect(server.failures).toEqual([]);
});

it.each(['read', 'send'] as const)(
  'sends %s to the given pane without waiting for the snapshot',
  async (action) => {
    const server = await listen((message) => {
      if (message.type === 'hello') {
        return [{ type: 'welcome' }];
      }

      return message.type === 'paneRead'
        ? [rowsReply('hidden output', 1)]
        : [{ type: 'paneSent', paneId: paneId(9) }];
    });

    const result =
      action === 'read'
        ? await runPaneRead(server.socketPath, version, { ...readCommand, pane: paneId(9) })
        : await runPaneSend(server.socketPath, version, { action, text: 'ls', pane: paneId(9) });

    const expectedRequest: ControlMessage =
      action === 'read'
        ? {
            type: 'paneRead',
            paneId: paneId(9),
            requestId: 1,
            selection: { source: 'visible', lines: undefined },
          }
        : { type: 'paneSend', paneId: paneId(9), text: 'ls' };

    const expectedResult =
      action === 'read'
        ? ({
            ok: true,
            paneId: paneId(9),
            epoch: 0,
            oldest: 0,
            from: 0,
            to: 0,
            lines: ['hidden output'],
          } as const)
        : ({ ok: true } as const);

    expect(result).toEqual(expectedResult);

    expect(server.received).toEqual([{ type: 'hello', version, size: undefined }, expectedRequest]);

    expect(server.failures).toEqual([]);
  },
);

it('reports a read the server refuses with its reason', async () => {
  const server = await listen((message) =>
    message.type === 'hello'
      ? [{ type: 'welcome' }]
      : [
          {
            type: 'paneReadFailed',
            paneId: paneId(9),
            requestId: 1,
            failure: { reason: 'pruned', oldest: 40 },
          },
        ],
  );

  const result = await runPaneRead(server.socketPath, version, {
    ...readCommand,
    pane: paneId(9),
  });

  expect(result).toEqual({ ok: false, reason: 'pruned', oldest: 40 });
});

it('prints read overload on stderr and exits without retrying', async () => {
  const server = await listen((message) => {
    if (message.type === 'hello') {
      return [{ type: 'welcome' }];
    }

    if (message.type === 'paneRead') {
      return [
        {
          type: 'paneReadFailed',
          paneId: message.paneId,
          requestId: message.requestId,
          failure: { reason: 'tooManyPendingReads', limit: 64 },
        },
      ];
    }

    return [];
  });

  const directory = await temporaryDirectory();
  const result = await runCli(['pane', 'read', 'pane-9', '--socket', server.socketPath], directory);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('64');
  expect(result.stderr).toContain('waiting');
  expect(server.received.filter((message) => message.type === 'paneRead')).toHaveLength(1);
  expect(server.failures).toEqual([]);
});

it('reports the workspace the server answers a request with', async () => {
  const server = await listen((message) =>
    message.type === 'hello'
      ? [{ type: 'welcome' }]
      : [{ type: 'workspaceDone', workspaceId: workspaceId(4) }],
  );

  const result = await runWorkspaceCommand(server.socketPath, version, {
    action: 'rename',
    workspaceId: workspaceId(4),
    label: 'docs',
  });

  expect(result).toEqual({ ok: true, workspaceId: workspaceId(4) });

  expect(server.received).toEqual([
    { type: 'hello', version, size: undefined },
    { type: 'workspaceRename', workspaceId: workspaceId(4), label: 'docs' },
  ]);
});

it('reports a failed workspace request with its reason', async () => {
  const server = await listen((message) =>
    message.type === 'hello'
      ? [{ type: 'welcome' }]
      : [{ type: 'workspaceFailed', reason: 'paneFailedToStart', message: 'no shell' }],
  );

  const result = await runWorkspaceCommand(server.socketPath, version, {
    action: 'create',
    root: '/work',
    label: 'work',
    focus: true,
  });

  expect(result).toEqual({ ok: false, reason: 'paneFailedToStart', message: 'no shell' });
});

it('prints a clear message and fails when the pane switched screens during a read', async () => {
  const server = await listen((message) =>
    message.type === 'hello'
      ? [{ type: 'welcome' }]
      : [
          {
            type: 'paneReadFailed',
            paneId: paneId(9),
            requestId: 1,
            failure: { reason: 'screenChanged', screen: 1 },
          },
        ],
  );

  const outcome = await runPaneAction(
    {
      kind: 'pane',
      pane: { ...readCommand, pane: paneId(9) },
      json: false,
      socket: server.socketPath,
    },
    version,
    {},
  );

  expect(outcome).toEqual({
    ok: false,
    message:
      'The pane switched between its primary and alternate screens during the read. Read again.',
  });
});
