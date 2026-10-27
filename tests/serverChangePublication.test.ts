import { expect, it, onTestFinished } from 'bun:test';
import { once } from 'node:events';
import { createConnection } from 'node:net';

import { paneId, tabId, workspaceId } from '../src/ids.ts';
import { encodeFrame, FrameKind } from '../src/protocol/frames.ts';
import { encodeControl } from '../src/protocol/messages.ts';
import {
  build,
  temporaryDirectory,
  waitFor,
  connect,
  startServer,
  nextPaneResize,
} from './serverHarness.ts';

it('sends a snapshot after welcome and each later change in revision order', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'welcome' });

  const initial = await client.nextMessage();

  expect(initial.type).toBe('snapshot');

  if (initial.type !== 'snapshot') {
    throw new Error('Expected a snapshot.');
  }

  expect(initial.snapshot.panes[0]?.id).toBe(paneId(1));

  server.writeToPane('exit\n');
  await waitFor(() => client.messages.length >= 5);

  expect(client.messages.slice(2)).toEqual([
    {
      type: 'change',
      revision: initial.snapshot.revision + 1,
      change: { type: 'paneRemoved', paneId: paneId(1) },
    },
    {
      type: 'change',
      revision: initial.snapshot.revision + 2,
      change: { type: 'tabRemoved', tabId: tabId(1) },
    },
    {
      type: 'change',
      revision: initial.snapshot.revision + 3,
      change: {
        type: 'workspaceRemoved',
        workspaceId: workspaceId(1),
        focusedWorkspaceId: undefined,
      },
    },
  ]);

  server.stop();
  await server.stopped;
});

it('resyncs after dropping a change inside a multi-change transition', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  server.writeToPane("trap '' HUP; echo ready-$((6 * 7))\n");
  await waitFor(() => server.paneText()?.includes('ready-42') === true);
  client.send({ type: 'hello', version: build, size: undefined });
  await client.nextMessage();

  const initial = await client.nextMessage();

  if (initial.type !== 'snapshot') {
    throw new Error('Expected a snapshot.');
  }

  server.stop();

  const dropped = await client.nextMessage();
  const received = await client.nextMessage();

  expect(dropped).toMatchObject({ type: 'change', change: { type: 'paneStateChanged' } });

  if (received.type !== 'change') {
    throw new Error('Expected a change.');
  }

  const hasGap = received.revision > initial.snapshot.revision + 1;

  expect(hasGap).toBe(true);

  if (hasGap) {
    client.send({ type: 'resync' });
  }

  const recovered = await client.nextMessage();

  expect(recovered).toEqual({ type: 'snapshot', snapshot: server.snapshot() });

  expect(recovered).toMatchObject({
    snapshot: { revision: received.revision, panes: [{ lifecycle: 'closing' }] },
  });

  server.writeToPane('exit\n');
  await server.stopped;
});

it('broadcasts changes to every welcomed client but not a connection waiting for hello', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const first = await connect(socketPath);
  const second = await connect(socketPath);
  const waiting = await connect(socketPath);

  first.send({ type: 'hello', version: build, size: undefined });
  second.send({ type: 'hello', version: build, size: undefined });
  await first.nextMessage();
  await second.nextMessage();

  const initial = await first.nextMessage();

  expect(await second.nextMessage()).toEqual(initial);

  server.writeToPane('exit\n');
  await waitFor(() => first.messages.length >= 5 && second.messages.length >= 5);
  server.stop();
  await server.stopped;
  await Promise.all([first.closed, second.closed, waiting.closed]);

  expect(first.messages.slice(2, 5).map((message) => message.type)).toEqual([
    'change',
    'change',
    'change',
  ]);

  expect(second.messages).toEqual(first.messages);
  expect(waiting.messages).toEqual([]);
});

it('sends a stop-only connection its stop result and no snapshot or changes', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'stop' });
  await server.stopped;
  await client.closed;

  expect(client.messages).toEqual([{ type: 'stopResult', result: { ok: true } }]);
});

it('keeps change revisions consecutive when a stalled terminal overflows its write queue', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const stalled = createConnection(socketPath);

  stalled.on('error', () => undefined);
  onTestFinished(() => stalled.destroy());
  await once(stalled, 'connect');
  stalled.pause();

  stalled.write(
    encodeFrame(
      FrameKind.control,
      encodeControl({
        type: 'hello',
        version: build,
        size: { columns: 80, rows: 1 },
      }),
    ),
  );

  await waitFor(() => server.snapshot().clients.length === 1);

  const observer = await connect(socketPath);

  observer.send({ type: 'hello', version: build, size: undefined });
  await observer.nextMessage();

  const initial = await observer.nextMessage();

  if (initial.type !== 'snapshot') {
    throw new Error('Expected the initial snapshot.');
  }

  const frames = Array.from({ length: 100 }, (_, index) =>
    encodeFrame(
      FrameKind.control,
      encodeControl({ type: 'resize', size: { columns: 80, rows: (index % 2) + 1 } }),
    ),
  );

  const batch = Buffer.concat(frames);
  let latest = initial.snapshot;

  for (let sent = 0; sent < 40_000 && latest.clients.length > 0; sent += frames.length) {
    stalled.write(batch);
    observer.send({ type: 'resync' });

    for (;;) {
      const message = await observer.nextMessage();

      if (message.type === 'snapshot') {
        latest = message.snapshot;

        break;
      }
    }
  }

  expect(latest.clients).toEqual([]);
  expect(latest.attachedClientId).toBeUndefined();

  const changes = observer.messages.flatMap((message) =>
    message.type === 'change' ? [message] : [],
  );

  const revisions = changes.map((message) => message.revision);
  const expected = revisions.map((_, index) => initial.snapshot.revision + index + 1);

  expect(revisions).toEqual(expected);
  expect(changes.at(-1)?.change).toMatchObject({ type: 'clientDetached', reason: 'requested' });
  expect(revisions.at(-1)).toBe(latest.revision);
});

it('removes a closed terminal client from subsequent snapshots', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const first = await connect(socketPath);

  first.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(first);
  first.close();
  await first.closed;

  const second = await connect(socketPath);

  second.send({ type: 'hello', version: build, size: undefined });
  expect(await second.nextMessage()).toEqual({ type: 'welcome' });

  expect(await second.nextMessage()).toMatchObject({
    type: 'snapshot',
    snapshot: { attachedClientId: undefined, clients: [] },
  });
});

it('attaches after a closed terminal without a takeover change', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const first = await connect(socketPath);

  first.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
  await nextPaneResize(first);
  first.close();
  await first.closed;

  const second = await connect(socketPath);

  second.send({ type: 'hello', version: build, size: { columns: 90, rows: 20 } });
  await nextPaneResize(second);

  const changes = second.messages.flatMap((message) =>
    message.type === 'change' ? [message.change] : [],
  );

  expect(changes.some((change) => change.type === 'clientAttached')).toBe(true);
  expect(changes.filter((change) => change.type === 'clientDetached')).toEqual([]);
});
