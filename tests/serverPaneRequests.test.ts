import { expect, it } from 'bun:test';

import { paneId, tabId } from '../src/ids.ts';
import type { ControlMessage } from '../src/protocol/messages.ts';
import {
  build,
  connect,
  connectCli,
  nextOfType,
  startServer,
  temporaryDirectory,
} from './serverHarness.ts';
import type { TestClient } from './serverHarness.ts';

type PaneRequest = Extract<
  ControlMessage,
  { type: 'paneSplit' | 'paneFocus' | 'paneClose' | 'paneMove' | 'paneZoom' | 'paneResize' }
>;

const expectRejected = async (
  client: TestClient,
  request: PaneRequest,
  reason: Extract<ControlMessage, { type: 'paneFailed' }>['reason'],
): Promise<void> => {
  client.send(request);

  expect(await nextOfType(client, 'paneFailed')).toEqual({
    type: 'paneFailed',
    reason,
    message: undefined,
  });

  expect(client.messages.some((message) => message.type === 'paneDone')).toBe(false);
};

// A terminal this small leaves no room to split a pane or to place one in another tab.
const attachTinyTerminal = async (socketPath: string): Promise<TestClient> => {
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: { columns: 4, rows: 3 } });
  await nextOfType(client, 'welcome');

  return client;
};

it.each([
  { type: 'paneFocus', paneId: paneId(9) },
  { type: 'paneClose', paneId: paneId(9) },
  { type: 'paneZoom', paneId: paneId(9) },
  { type: 'paneSplit', paneId: paneId(9), direction: 'right', cwd: undefined },
  { type: 'paneResize', paneId: paneId(9), direction: 'right', cells: 1 },
  { type: 'paneMove', paneId: paneId(9), destination: { kind: 'newTab' } },
] as const)(
  'answers $type for an unknown pane with unknownPane and no paneDone',
  async (request) => {
    const directory = await temporaryDirectory();
    const { server, socketPath } = await startServer(directory);
    const before = server.snapshot();
    const client = await connectCli(socketPath);

    await expectRejected(client, request, 'unknownPane');
    expect(server.snapshot()).toEqual(before);
  },
);

it('answers paneSplit in a terminal too small to split with paneTooSmall and no paneDone', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  await attachTinyTerminal(socketPath);

  const before = server.snapshot();
  const client = await connectCli(socketPath);

  await expectRejected(
    client,
    { type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined },
    'paneTooSmall',
  );

  expect(server.snapshot().panes).toEqual(before.panes);
});

it('answers paneMove into a tab with no room with paneTooSmall and no paneDone', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  await attachTinyTerminal(socketPath);

  const client = await connectCli(socketPath);

  client.send({
    type: 'tabCreate',
    workspaceId: server.snapshot().workspaces[0]!.id,
    cwd: undefined,
    focus: false,
  });

  const created = await nextOfType(client, 'tabDone');
  const before = server.snapshot();

  await expectRejected(
    client,
    { type: 'paneMove', paneId: paneId(1), destination: { kind: 'tab', tabId: created.tabId } },
    'paneTooSmall',
  );

  expect(server.snapshot().panes).toEqual(before.panes);
});

it('answers paneResize of a pane with no neighbor with noSplit and no paneDone', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const before = server.snapshot();
  const client = await connectCli(socketPath);

  await expectRejected(
    client,
    { type: 'paneResize', paneId: paneId(1), direction: 'right', cells: 1 },
    'noSplit',
  );

  expect(server.snapshot()).toEqual(before);
});

it('answers paneMove to an unknown tab with unknownTab and no paneDone', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const before = server.snapshot();
  const client = await connectCli(socketPath);

  await expectRejected(
    client,
    { type: 'paneMove', paneId: paneId(1), destination: { kind: 'tab', tabId: tabId(9) } },
    'unknownTab',
  );

  expect(server.snapshot()).toEqual(before);
});

it('answers paneMove to the pane tab with sameTab and no paneDone', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const before = server.snapshot();
  const client = await connectCli(socketPath);
  const ownTab = before.panes[0]!.tabId;

  await expectRejected(
    client,
    { type: 'paneMove', paneId: paneId(1), destination: { kind: 'tab', tabId: ownTab } },
    'sameTab',
  );

  expect(server.snapshot()).toEqual(before);
});
