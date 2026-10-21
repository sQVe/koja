import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paneId, tabId, workspaceId } from '../ids.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../protocol/protocol.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { CursorShape, encodeRowUpdate, rowHeaderWords, rowWords } from '../rows/rows.ts';
import type { RowUpdate } from '../rows/rows.ts';
import { connectAttach } from './client.ts';

type Reply = (Uint8Array | ControlMessage)[];

interface Peer {
  // Replies to the first resize the client sends, which a test uses as its trigger.
  onResize: (() => Reply) | undefined;
  onResync: (() => Reply) | undefined;
  // What the peer answers to a tab focus request, after the focus change.
  tabAnswer: ControlMessage;
  // Replies to the hello. The default welcomes the client and sends the snapshot.
  onHello: (() => Reply) | undefined;
}

const version = { version: 'test', ghostty: 'test-ghostty' };

const size = { columns: 100, rows: 30 };

const firstPane = {
  id: paneId(7),
  tabId: tabId(1),
  lifecycle: 'running',
  generation: 1,
  size: { columns: 100, rows: 29 },
  exitCode: undefined,
  startFolder: undefined,
  restored: false,
  error: undefined,
} as const;

const secondPane = { ...firstPane, id: paneId(8), tabId: tabId(2) } as const;

const firstTab = {
  id: tabId(1),
  workspaceId: workspaceId(1),
  layout: { kind: 'pane', paneId: firstPane.id },
  focusedPaneId: firstPane.id,
  zoomedPaneId: undefined,
  label: undefined,
} as const;

const secondTab = {
  ...firstTab,
  id: tabId(2),
  layout: { kind: 'pane', paneId: secondPane.id },
  focusedPaneId: secondPane.id,
} as const;

const workspace = {
  id: workspaceId(1),
  root: '/work/koja',
  label: 'koja',
  tabIds: [firstTab.id, secondTab.id],
} as const;

const snapshotMessage = (
  revision: number,
  options: { activeTab?: number; failedSecondPane?: boolean } = {},
): ControlMessage => {
  const { activeTab = 1, failedSecondPane = false } = options;

  const shownSecondPane = failedSecondPane
    ? { ...secondPane, lifecycle: 'failed' as const, error: 'Cannot start' }
    : secondPane;

  return {
    type: 'snapshot',
    snapshot: {
      revision,
      workspaces: [workspace],
      tabs: [firstTab, secondTab],
      panes: [firstPane, shownSecondPane],
      defaultView: {
        focusedWorkspaceId: workspace.id,
        activeTabs: [{ workspaceId: workspace.id, tabId: tabId(activeTab) }],
        scrolls: [],
      },
      attachedClientId: undefined,
      foregroundClientId: undefined,
      clients: [],
    },
  };
};

const rowUpdate = (pane: number): RowUpdate => {
  const columns = 3;
  const cells = new Uint32Array(rowWords(columns));

  cells[rowHeaderWords] = 'h'.codePointAt(0) ?? 0;

  return {
    pane,
    sequence: 1,
    size: { columns, rows: 2 },
    cursor: {
      x: 1,
      y: 0,
      visible: true,
      shape: CursorShape.default,
      blinking: false,
    },
    modes: 0,
    epoch: 1,
    first: 0,
    activeTop: 10,
    rowCount: 1,
    cells,
    graphemes: new Uint32Array(),
    colors: new Uint32Array(),
  };
};

const rowsFrame = (pane: number): Uint8Array =>
  encodeFrame(FrameKind.rowUpdate, encodeRowUpdate(rowUpdate(pane)));

const tabFocusedChange = (tab: number): ControlMessage => ({
  type: 'change',
  revision: 2,
  change: { type: 'tabFocused', workspaceId: workspace.id, tabId: tabId(tab) },
});

// Marks the point where the client has handled the tab answer before it.
const settledChange: ControlMessage = {
  type: 'change',
  revision: 3,
  change: {
    type: 'paneResized',
    paneId: firstPane.id,
    size: { columns: 50, rows: 10 },
  },
};

const toBytes = (reply: Uint8Array | ControlMessage): Uint8Array =>
  reply instanceof Uint8Array ? reply : encodeFrame(FrameKind.control, encodeControl(reply));

const listen = async (peer: Peer) => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-client-attach-'));
  const socketPath = join(directory, 'koja.sock');
  const decoder = createFrameDecoder();

  const respond = (message: ControlMessage): Reply => {
    if (message.type === 'hello') {
      return peer.onHello?.() ?? [{ type: 'welcome' }, snapshotMessage(1)];
    }

    if (message.type === 'tabFocus') {
      return [tabFocusedChange(2), peer.tabAnswer, settledChange];
    }

    if (message.type === 'resize') {
      return peer.onResize?.() ?? [];
    }

    return message.type === 'resync' ? (peer.onResync?.() ?? []) : [];
  };

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

          for (const reply of respond(parsed.message)) {
            socket.write(toBytes(reply));
          }
        }
      },
    },
  });

  onTestFinished(async () => {
    listener.stop(true);
    await rm(directory, { recursive: true, force: true });
  });

  return socketPath;
};

const untilRevision = async (
  session: {
    subscribe: (listener: () => void) => () => void;
    getState: () => { snapshot: { revision: number } };
  },
  revision: number,
) => {
  const ready = Promise.withResolvers<undefined>();

  const unsubscribe = session.subscribe(() => {
    if (session.getState().snapshot.revision >= revision) {
      ready.resolve(undefined);
    }
  });

  if (session.getState().snapshot.revision >= revision) {
    ready.resolve(undefined);
  }

  await ready.promise;
  unsubscribe();
};

const defaultPeer = (overrides: Partial<Peer> = {}): Peer => ({
  onResize: undefined,
  onResync: undefined,
  onHello: undefined,
  tabAnswer: { type: 'tabDone', tabId: tabId(2) },
  ...overrides,
});

const attach = async (peer: Peer) => {
  const socketPath = await listen(peer);
  const result = await connectAttach(socketPath, version, size);

  if (!result.ok) {
    throw new Error(`Attach failed: ${result.reason}`);
  }

  onTestFinished(() => {
    result.session.close();
  });

  return result.session;
};

// Switches to the second tab and waits until the client has handled the peer's answer.
const switchTab = async (peer: Peer) => {
  const session = await attach(peer);
  const released = Promise.withResolvers<undefined>();
  let releases = 0;

  session.focusTab({ kind: 'next' });

  session.afterTabAnswer(() => {
    releases += 1;
    released.resolve(undefined);
  });

  await untilRevision(session, 3);

  return {
    session,
    released: released.promise,
    releaseCount: () => releases,
  };
};

it('reports no pending tab input when no tab request was sent', async () => {
  const session = await attach(defaultPeer());

  expect(session.tabPending()).toBe(false);
});

it('holds input after a tab switch until the shown pane sends fresh rows', async () => {
  const peer = defaultPeer({ onResize: () => [rowsFrame(8)] });
  const { session, released, releaseCount } = await switchTab(peer);

  expect(session.tabPending()).toBe(true);
  expect(releaseCount()).toBe(0);

  session.resize({ columns: 90, rows: 20 });
  await released;

  expect(session.rowCache(paneId(8))).toBeDefined();
  expect(session.tabPending()).toBe(false);
  expect(releaseCount()).toBe(1);
});

it('does not release held input for rows of a pane that is not shown', async () => {
  const peer = defaultPeer({ onResize: () => [rowsFrame(7)] });
  const { session, releaseCount } = await switchTab(peer);
  const arrived = Promise.withResolvers<undefined>();

  session.subscribeRows(() => {
    arrived.resolve(undefined);
  });

  session.resize({ columns: 90, rows: 20 });
  await arrived.promise;

  expect(session.rowCache(paneId(7))).toBeDefined();
  expect(session.tabPending()).toBe(true);
  expect(releaseCount()).toBe(0);
});

it('releases held input at once when the tab request fails', async () => {
  const peer = defaultPeer({
    tabAnswer: { type: 'tabFailed', reason: 'unknownTab', message: undefined },
  });

  const { session, released } = await switchTab(peer);

  await released;
  expect(session.tabPending()).toBe(false);
});

it('waits for the rows of the pane shown after focus moves away from the awaited pane', async () => {
  const peer = defaultPeer({
    onResize: () => [
      {
        type: 'change',
        revision: 4,
        change: {
          type: 'tabFocused',
          workspaceId: workspace.id,
          tabId: tabId(1),
        },
      },
      rowsFrame(7),
    ],
  });

  const { session, released, releaseCount } = await switchTab(peer);

  expect(releaseCount()).toBe(0);

  session.resize({ columns: 90, rows: 20 });
  await released;

  expect(session.tabPending()).toBe(false);
});

it('releases held input when the awaited pane becomes failed', async () => {
  const peer = defaultPeer({
    onResize: () => [
      {
        type: 'change',
        revision: 4,
        change: {
          type: 'paneStateChanged',
          paneId: secondPane.id,
          lifecycle: 'failed',
          exitCode: undefined,
          error: 'Cannot start',
        },
      },
    ],
  });

  const { session, released, releaseCount } = await switchTab(peer);

  expect(releaseCount()).toBe(0);

  session.resize({ columns: 90, rows: 20 });
  await released;

  expect(session.tabPending()).toBe(false);
});

const gapChange: ControlMessage = {
  type: 'change',
  revision: 9,
  change: {
    type: 'paneResized',
    paneId: firstPane.id,
    size: { columns: 50, rows: 10 },
  },
};

it('waits for the rows of the pane a resync snapshot shows', async () => {
  const peer = defaultPeer({
    onResize: () => [gapChange],
    onResync: () => [snapshotMessage(10, { activeTab: 1 }), rowsFrame(7)],
  });

  const { session, released, releaseCount } = await switchTab(peer);

  expect(releaseCount()).toBe(0);

  session.resize({ columns: 90, rows: 20 });
  await released;

  expect(session.tabPending()).toBe(false);
});

it('releases held input when a resync snapshot shows a failed pane', async () => {
  const peer = defaultPeer({
    onResize: () => [gapChange],
    onResync: () => [snapshotMessage(10, { activeTab: 2, failedSecondPane: true })],
  });

  const { session, released, releaseCount } = await switchTab(peer);

  expect(releaseCount()).toBe(0);

  session.resize({ columns: 90, rows: 20 });
  await released;

  expect(session.tabPending()).toBe(false);
});

it('ignores a tab answer that arrives before the first snapshot', async () => {
  const peer = defaultPeer({
    onHello: () => [{ type: 'welcome' }, defaultPeer().tabAnswer, snapshotMessage(1)],
  });

  const session = await attach(peer);

  expect(session.tabPending()).toBe(false);
});
