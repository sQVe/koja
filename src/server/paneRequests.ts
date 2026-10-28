import { paneId as paneIdFor } from '../ids.ts';
import type { ClientId, PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { FrameKind, pendingPaneReadLimit } from '../protocol/protocol.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { encodePaneRows } from '../rows/rows.ts';
import type { PaneInput } from '../rows/rows.ts';
import type { Intent, RejectReason, State } from '../store/store.ts';
import { sourceOf } from './clientRequests.ts';
import type { Connection } from './connection.ts';
import type { Dispatch } from './dispatchResult.ts';
import type { Log } from './log.ts';
import { handlePaneCopy } from './paneCopyRequests.ts';
import { findLivePane, followFolderOf, paneNumber, startFolderOf } from './paneEffects.ts';
import { handlePanePaste } from './panePaste.ts';
import type { RunningPane } from './paneRecord.ts';
import { selectPaneRows } from './paneRows.ts';
import { createSnapshot, hasMoreParts, takePart } from './paneSnapshot.ts';
import type { PaneSnapshot, SnapshotStore } from './paneSnapshot.ts';
import { readPaneFolders, readPaneProcesses } from './processInfo.ts';

interface PaneRequestContext {
  options: { log: Log };
  state: State;
  runtime: {
    panes: Map<PaneId, RunningPane>;
    clientIds: Map<Connection, ClientId>;
    // The snapshot of the read a connection has parts left of, one per connection.
    readSnapshots: SnapshotStore<Connection>;
    pasteSecret: Uint8Array;
  };
}

type PaneReadMessage = Extract<ControlMessage, { type: 'paneRead' }>;

type PaneLayoutRequest = Extract<
  ControlMessage,
  { type: 'paneSplit' | 'paneFocus' | 'paneClose' | 'paneMove' | 'paneZoom' | 'paneResize' }
>;

type PaneFailureReason = Extract<ControlMessage, { type: 'paneFailed' }>['reason'];

type PaneCommandMessage = Extract<
  ControlMessage,
  { type: 'paneRead' | 'paneReadNext' | 'paneSend' | 'paneCopy' | 'panePaste' }
>;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Sends the next part of the snapshot, and keeps the snapshot only while parts remain.
const sendPart = (
  context: PaneRequestContext,
  connection: Connection,
  held: PaneSnapshot,
): void => {
  const part = takePart(held);

  const reply = encodePaneRows({
    ...part,
    pane: paneNumber(held.paneId),
    requestId: held.requestId,
  });

  if (hasMoreParts(held)) {
    context.runtime.readSnapshots.keep(connection, held);
  } else {
    context.runtime.readSnapshots.drop(connection);
  }

  connection.sendBinary(FrameKind.paneRows, reply);
};

const answerPaneReadNext = (
  context: PaneRequestContext,
  message: Extract<ControlMessage, { type: 'paneReadNext' }>,
  connection: Connection,
): void => {
  const { paneId, requestId } = message;
  const held = context.runtime.readSnapshots.find(connection, paneId, requestId);

  if (held === undefined) {
    connection.send({
      type: 'paneReadFailed',
      paneId,
      requestId,
      failure: { reason: 'noSnapshot' },
    });

    return;
  }

  sendPart(context, connection, held);
};

const answerPaneRead = (
  context: PaneRequestContext,
  message: PaneReadMessage,
  connection: Connection,
  generation: number,
): void => {
  const { paneId, requestId } = message;
  const live = findLivePane(context, paneId);

  if (connection.isClosed()) {
    return;
  }

  // A newer read on this connection replaced this one while it waited. It must leave the newer
  // read's snapshot alone.
  if (!context.runtime.readSnapshots.isCurrent(connection, generation)) {
    connection.send({
      type: 'paneReadFailed',
      paneId,
      requestId,
      failure: { reason: 'noSnapshot' },
    });

    return;
  }

  if (live === undefined) {
    connection.send({ type: 'paneMissing', paneId });

    return;
  }

  const selected = selectPaneRows(live.runtime.terminal, live.pane.size, message.selection);

  if (!selected.ok) {
    connection.send({ type: 'paneReadFailed', paneId, requestId, failure: selected.failure });

    return;
  }

  sendPart(context, connection, createSnapshot(paneId, requestId, selected.rows));
};

const answerPaneReadAfterHold = async (
  context: PaneRequestContext,
  message: PaneReadMessage,
  connection: Connection,
  generation: number,
  released: Promise<void>,
): Promise<void> => {
  await released;

  answerPaneRead(context, message, connection, generation);
};

export const answerPaneFolders = (context: PaneRequestContext, connection: Connection): void => {
  const panes = [];

  for (const pane of context.state.panes) {
    const live = findLivePane(context, pane.id);

    if (live !== undefined) {
      const read = readPaneFolders(live.runtime.processId);

      panes.push({ paneId: pane.id, folder: read.cwd, foregroundFolder: read.foregroundCwd });
    }

    if (pane.lifecycle === 'failed') {
      panes.push({
        paneId: pane.id,
        folder: startFolderOf(context, pane),
        foregroundFolder: undefined,
      });
    }
  }

  connection.send({ type: 'paneFoldersReply', panes });
};

export const answerPaneProcessInfo = (
  context: PaneRequestContext,
  paneId: PaneId,
  connection: Connection,
): void => {
  if (!context.state.panes.some((known) => known.id === paneId)) {
    connection.send({ type: 'paneFailed', reason: 'unknownPane', message: undefined });

    return;
  }

  const live = findLivePane(context, paneId);

  if (live === undefined) {
    connection.send({ type: 'paneMissing', paneId });

    return;
  }

  const read = readPaneProcesses(live.runtime.processId);

  connection.send({
    type: 'paneProcessInfoReply',
    paneId,
    shellPid: read.shellPid,
    foregroundGroup: read.foregroundGroup,
    processes: read.foregroundProcesses.map((process) => ({
      pid: process.pid,
      name: process.name,
      argv: process.argv,
      cmdline: process.cmdline,
      folder: process.cwd,
    })),
  });
};

const paneCommandTypes: ReadonlySet<string> = new Set([
  'paneRead',
  'paneReadNext',
  'paneSend',
  'paneCopy',
  'panePaste',
]);

export const isPaneCommand = (message: ControlMessage): message is PaneCommandMessage =>
  paneCommandTypes.has(message.type);

export const handlePaneCommand = (
  context: PaneRequestContext,
  message: PaneCommandMessage,
  connection: Connection,
): void => {
  if (message.type === 'paneCopy') {
    handlePaneCopy(context, message, connection);

    return;
  }

  if (message.type === 'panePaste') {
    handlePanePaste(context, message, connection);

    return;
  }

  const live = findLivePane(context, message.paneId);

  if (message.type === 'paneReadNext') {
    answerPaneReadNext(context, message, connection);

    return;
  }

  if (live === undefined) {
    if (message.type === 'paneRead') {
      context.runtime.readSnapshots.begin(connection);
    }

    connection.send({ type: 'paneMissing', paneId: message.paneId });

    return;
  }

  if (message.type === 'paneSend') {
    live.runtime.write(new TextEncoder().encode(message.text));
    connection.send({ type: 'paneSent', paneId: message.paneId });

    return;
  }

  if (!live.runtime.terminal.renderHeld()) {
    const generation = context.runtime.readSnapshots.begin(connection);

    answerPaneRead(context, message, connection, generation);

    return;
  }

  const released = live.publication.publisher.waitForRead(connection);

  if (released === undefined) {
    connection.send({
      type: 'paneReadFailed',
      paneId: message.paneId,
      requestId: message.requestId,
      failure: { reason: 'tooManyPendingReads', limit: pendingPaneReadLimit },
    });

    return;
  }

  const generation = context.runtime.readSnapshots.begin(connection);

  answerPaneReadAfterHold(context, message, connection, generation, released).catch(
    (error: unknown) => {
      context.options.log.error('Reading the pane failed.', {
        paneId: message.paneId,
        error: describeError(error),
      });
    },
  );
};

export const forgetPaneReads = (context: PaneRequestContext, connection: Connection): void => {
  context.runtime.readSnapshots.forget(connection);

  for (const pane of context.runtime.panes.values()) {
    pane.publication.publisher.forgetReads(connection);
  }
};

const paneLayoutRequestTypes: ReadonlySet<string> = new Set([
  'paneSplit',
  'paneFocus',
  'paneClose',
  'paneMove',
  'paneZoom',
  'paneResize',
]);

export const isPaneLayoutRequest = (message: ControlMessage): message is PaneLayoutRequest =>
  paneLayoutRequestTypes.has(message.type);

// A new workspace takes the folder the pane is in, or the root of the workspace it leaves.
const workspaceRootOfMove = (
  context: PaneRequestContext,
  message: Extract<PaneLayoutRequest, { type: 'paneMove' }>,
): string | undefined => {
  const followed = followFolderOf(context, message.paneId);

  if (followed !== undefined) {
    return followed;
  }

  const pane = context.state.panes.find((known) => known.id === message.paneId);
  const tab = context.state.tabs.find((known) => known.id === pane?.tabId);

  return context.state.workspaces.find((known) => known.id === tab?.workspaceId)?.root;
};

const paneFolderOf = (
  context: PaneRequestContext,
  message: PaneLayoutRequest,
): string | undefined => {
  if (message.type === 'paneMove') {
    return message.destination.kind === 'newWorkspace'
      ? workspaceRootOfMove(context, message)
      : undefined;
  }

  if (message.type !== 'paneSplit') {
    return undefined;
  }

  return message.cwd ?? followFolderOf(context, message.paneId);
};

const moveDestinationOf = (
  { destination }: Extract<PaneLayoutRequest, { type: 'paneMove' }>,
  folder: string | undefined,
): Extract<Intent, { type: 'movePane' }>['destination'] => {
  if (destination.kind === 'newWorkspace') {
    return { kind: 'newWorkspace', root: folder ?? '' };
  }

  return destination;
};

const paneIntentOf = (
  message: PaneLayoutRequest,
  source: { clientId?: ClientId },
  folder: string | undefined,
): Intent => {
  if (message.type === 'paneSplit') {
    return {
      type: 'splitPane',
      paneId: message.paneId,
      direction: message.direction,
      folder,
    };
  }

  if (message.type === 'paneMove') {
    return {
      type: 'movePane',
      paneId: message.paneId,
      destination: moveDestinationOf(message, folder),
      ...source,
    };
  }

  if (message.type === 'paneResize') {
    return {
      type: 'resizePane',
      paneId: message.paneId,
      direction: message.direction,
      cells: message.cells,
    };
  }

  if (message.type === 'paneZoom') {
    return { type: 'zoomPane', paneId: message.paneId };
  }

  return message.type === 'paneFocus'
    ? { type: 'focusPane', paneId: message.paneId, ...source }
    : { type: 'closePane', paneId: message.paneId };
};

// A reason that maps to undefined means a server bug for this request.
const failureReasons: Record<RejectReason, PaneFailureReason | undefined> = {
  serverStopping: 'serverStopping',
  sessionNotEmpty: undefined,
  unknownClient: undefined,
  unknownWorkspace: undefined,
  unknownTab: 'unknownTab',
  unknownPane: 'unknownPane',
  paneTooSmall: 'paneTooSmall',
  sameTab: 'sameTab',
  noSplit: 'noSplit',
  requiresLegacyLayout: 'requiresLegacyLayout',
  staleGeneration: undefined,
};

export const handlePaneLayoutRequest = (
  context: PaneRequestContext,
  message: PaneLayoutRequest,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const folder = paneFolderOf(context, message);
  const result = dispatch(paneIntentOf(message, sourceOf(context, connection), folder));

  if (result.kind === 'rejected') {
    const reason = failureReasons[result.reason];

    invariant(reason !== undefined, `A pane request cannot be rejected as ${result.reason}.`);

    connection.send({
      type: 'paneFailed',
      reason,
      message: undefined,
    });

    return;
  }

  if (result.startFailure !== undefined) {
    connection.send({
      type: 'paneFailed',
      reason: 'paneFailedToStart',
      message: result.startFailure,
    });

    return;
  }

  if (message.type === 'paneSplit') {
    const added = result.changes.find((change) => change.type === 'paneAdded');

    invariant(added !== undefined, 'A split pane must be added.');
    connection.send({ type: 'paneDone', paneId: added.pane.id });

    return;
  }

  connection.send({ type: 'paneDone', paneId: message.paneId });
};

export const writePaneInput = (
  context: PaneRequestContext,
  connection: Connection,
  input: PaneInput,
): void => {
  const target = paneIdFor(input.pane);
  const clientId = context.runtime.clientIds.get(connection);
  const isAttached = clientId !== undefined && clientId === context.state.attachedClientId;
  const live = findLivePane(context, target);

  if (!isAttached || live === undefined) {
    context.options.log.debug('Ignored input from a client that cannot write to the pane.', {
      paneId: target,
    });

    return;
  }

  live.runtime.write(input.bytes);
};
