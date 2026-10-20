import { paneId as paneIdFor } from '../ids.ts';
import type { ClientId, PaneId } from '../ids.ts';
import { FrameKind } from '../protocol/protocol.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { encodePaneRows } from '../rows/rows.ts';
import type { PaneInput } from '../rows/rows.ts';
import { applyIntent } from '../store/store.ts';
import type { Change, Intent, RejectReason, State } from '../store/store.ts';
import { sourceOf } from './clientRequests.ts';
import type { Connection } from './connection.ts';
import type { Log } from './log.ts';
import { handlePaneCopy } from './paneCopyRequests.ts';
import {
  findLivePane,
  followFolderOf,
  paneNumber,
  startFolderOf,
  takePaneStartFailure,
} from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';
import { selectPaneRows } from './paneRows.ts';
import { createSnapshot, hasMoreParts, takePart } from './paneSnapshot.ts';
import type { PaneSnapshot, SnapshotStore } from './paneSnapshot.ts';
import { readPaneFolders, readPaneProcesses } from './processInfo.ts';
import type { RowPublisher } from './rowPublisher.ts';

interface PaneRequestContext {
  options: { log: Log };
  state: State;
  runtime: {
    panes: Map<PaneId, RunningPane>;
    clientIds: Map<Connection, ClientId>;
    // The snapshot of the read a connection has parts left of, one per connection.
    readSnapshots: SnapshotStore<Connection>;
  };
  paneStartFailure: string | undefined;
}

type Dispatch = (intent: Intent) => readonly Change[];

type PaneReadMessage = Extract<ControlMessage, { type: 'paneRead' }>;

type PaneLayoutRequest = Extract<
  ControlMessage,
  { type: 'paneSplit' | 'paneFocus' | 'paneClose' | 'paneMove' | 'paneZoom' | 'paneResize' }
>;

type PaneFailureReason = Extract<ControlMessage, { type: 'paneFailed' }>['reason'];

type PaneCommandMessage = Extract<
  ControlMessage,
  { type: 'paneRead' | 'paneReadNext' | 'paneSend' | 'paneCopy' }
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
  publisher: RowPublisher,
): Promise<void> => {
  await publisher.whenReleased();

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

  const live = findLivePane(context, message.paneId);

  if (message.type === 'paneReadNext') {
    answerPaneReadNext(context, message, connection);

    return;
  }

  const generation =
    message.type === 'paneRead' ? context.runtime.readSnapshots.begin(connection) : 0;

  if (live === undefined) {
    connection.send({ type: 'paneMissing', paneId: message.paneId });

    return;
  }

  if (message.type === 'paneSend') {
    live.runtime.write(new TextEncoder().encode(message.text));
    connection.send({ type: 'paneSent', paneId: message.paneId });

    return;
  }

  if (!live.runtime.terminal.renderHeld()) {
    answerPaneRead(context, message, connection, generation);

    return;
  }

  answerPaneReadAfterHold(
    context,
    message,
    connection,
    generation,
    live.publication.publisher,
  ).catch((error: unknown) => {
    context.options.log.error('Reading the pane failed.', {
      paneId: message.paneId,
      error: describeError(error),
    });
  });
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

const refusalReasonOf = (
  message: PaneLayoutRequest,
  reason: RejectReason,
): PaneFailureReason | undefined => {
  if (reason === 'noSplit') {
    return reason;
  }

  const isMoveReason = reason === 'unknownTab' || reason === 'paneTooSmall' || reason === 'sameTab';

  return message.type === 'paneMove' && isMoveReason ? reason : undefined;
};

const paneRefusalOf = (
  context: PaneRequestContext,
  message: PaneLayoutRequest,
  connection: Connection,
): ControlMessage | undefined => {
  if (context.state.stopping) {
    return { type: 'paneFailed', reason: 'serverStopping', message: undefined };
  }

  const known = context.state.panes.some((pane) => pane.id === message.paneId);

  if (!known) {
    return { type: 'paneFailed', reason: 'unknownPane', message: undefined };
  }

  const intent = paneIntentOf(message, sourceOf(context, connection), undefined);
  const outcome = applyIntent(context.state, intent);

  if (outcome.kind !== 'rejected') {
    return undefined;
  }

  const reason = refusalReasonOf(message, outcome.reason);

  return reason === undefined ? undefined : { type: 'paneFailed', reason, message: undefined };
};

export const handlePaneLayoutRequest = (
  context: PaneRequestContext,
  message: PaneLayoutRequest,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const refusal = paneRefusalOf(context, message, connection);

  if (refusal !== undefined) {
    connection.send(refusal);

    return;
  }

  const folder = paneFolderOf(context, message);
  const changes = dispatch(paneIntentOf(message, sourceOf(context, connection), folder));
  const added = changes.find((change) => change.type === 'paneAdded');
  const startFailure = takePaneStartFailure(context);

  if (startFailure !== undefined) {
    connection.send({ type: 'paneFailed', reason: 'paneFailedToStart', message: startFailure });

    return;
  }

  if (message.type === 'paneSplit') {
    connection.send(
      added === undefined
        ? { type: 'paneFailed', reason: 'paneTooSmall', message: undefined }
        : { type: 'paneDone', paneId: added.pane.id },
    );

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
