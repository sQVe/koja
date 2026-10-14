import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDetach, runPaneCommand, runWorkspaceCommand } from '../src/client/client.ts';
import { paneId, tabId, workspaceId } from '../src/ids.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../src/protocol/protocol.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';

const version = { version: 'test', ghostty: 'test-ghostty' };

const snapshot = (live: boolean): ControlMessage => ({
  type: 'snapshot',
  snapshot: {
    revision: 2,
    workspaces: live
      ? [
          {
            id: workspaceId(1),
            root: '/work/phi',
            label: 'phi',
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
            focusedPaneId: paneId(7),
            zoomedPaneId: undefined,
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
            folder: undefined,
          },
        ]
      : [],
    defaultView: {
      focusedWorkspaceId: live ? workspaceId(1) : undefined,
      activeTabs: live ? [{ workspaceId: workspaceId(1), tabId: tabId(1) }] : [],
    },
    attachedClientId: undefined,
    foregroundClientId: undefined,
    clients: [],
  },
});

const listen = async (respond: (message: ControlMessage) => ControlMessage[] | undefined) => {
  const directory = await mkdtemp(join(tmpdir(), 'phi-pane-client-'));
  const socketPath = join(directory, 'phi.sock');
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

          for (const message of responses) {
            socket.write(encodeFrame(FrameKind.control, encodeControl(message)));
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
  const result = await runPaneCommand(server.socketPath, version, { action: 'read' });

  expect(result).toEqual({ ok: false, reason: 'paneMissing' });
  expect(server.received).toEqual([{ type: 'hello', version, size: undefined }]);
  expect(server.failures).toEqual([]);
});

it.each(['read', 'send'] as const)(
  'uses the snapshot pane id and reports a pane lost before %s',
  async (action) => {
    const server = await listen((message) => {
      if (message.type === 'hello') {
        return [{ type: 'welcome' }, snapshot(true)];
      }

      return [{ type: 'paneMissing', paneId: paneId(7) }];
    });

    const command = action === 'read' ? { action } : { action, text: 'hello' };
    const result = await runPaneCommand(server.socketPath, version, command);

    const expected: ControlMessage =
      action === 'read'
        ? { type: 'paneRead', paneId: paneId(7) }
        : { type: 'paneSend', paneId: paneId(7), text: 'hello' };

    expect(result).toEqual({ ok: false, reason: 'paneMissing' });
    expect(server.received).toEqual([{ type: 'hello', version, size: undefined }, expected]);
    expect(server.failures).toEqual([]);
  },
);

it('returns a connection failure when the server closes before answering', async () => {
  const server = await listen(() => undefined);
  const result = await runPaneCommand(server.socketPath, version, { action: 'read' });

  expect(result).toEqual({ ok: false, reason: 'connectionFailed' });
  expect(server.received).toEqual([{ type: 'hello', version, size: undefined }]);
  expect(server.failures).toEqual([]);
});

it('rejects a snapshot sent before welcome without sending pane input', async () => {
  const server = await listen(() => [snapshot(true)]);

  const result = await runPaneCommand(server.socketPath, version, {
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
  expect(await runDetach('/nonexistent/phi.sock', version, undefined)).toEqual({
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

  const result = await runPaneCommand(server.socketPath, version, { action: 'send', text });

  expect(result).toEqual({ ok: true, kind: 'sent' });
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
        ? [{ type: 'paneRows', paneId: paneId(9), rows: ['hidden output'] }]
        : [{ type: 'paneSent', paneId: paneId(9) }];
    });

    const command =
      action === 'read' ? { action, pane: paneId(9) } : { action, text: 'ls', pane: paneId(9) };

    const result = await runPaneCommand(server.socketPath, version, command);

    const expectedRequest: ControlMessage =
      action === 'read'
        ? { type: 'paneRead', paneId: paneId(9) }
        : { type: 'paneSend', paneId: paneId(9), text: 'ls' };

    const expectedResult: Awaited<ReturnType<typeof runPaneCommand>> =
      action === 'read'
        ? { ok: true, kind: 'rows', paneId: paneId(9), rows: ['hidden output'] }
        : { ok: true, kind: 'sent' };

    expect(result).toEqual(expectedResult);

    expect(server.received).toEqual([{ type: 'hello', version, size: undefined }, expectedRequest]);

    expect(server.failures).toEqual([]);
  },
);

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
    background: false,
  });

  expect(result).toEqual({ ok: false, reason: 'paneFailedToStart', message: 'no shell' });
});
