import { rmSync } from 'node:fs';

import { paneId as paneIdFor } from '../ids.ts';
import type { ClientId, PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { layoutPanes } from '../layout.ts';
import type { TerminalSize } from '../layout.ts';
import { FrameKind } from '../protocol/protocol.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { decodePaneInput, encodeRowUpdate, rowsToText } from '../rows/rows.ts';
import {
  applyFact,
  applyIntent,
  createState,
  focusedPane,
  paneTheme,
  snapshot,
} from '../store/store.ts';
import type { Change, DetachReason, Fact, Intent, Pane, Snapshot, State } from '../store/store.ts';
import { createConnection } from './connection.ts';
import type { Connection } from './connection.ts';
import type { Log } from './log.ts';
import { spawnPane } from './pane.ts';
import type { PaneRuntime } from './pane.ts';
import { createRowPublisher } from './rowPublisher.ts';
import type { RowPublisher, RowSubscription } from './rowPublisher.ts';
import { scopeAvailable } from './scope.ts';
import { claimSocketPath } from './socketPath.ts';

export { createLog, logPathFor } from './log.ts';
export { socketPathFor } from './socketPath.ts';

interface ServerOptions {
  socketPath: string;
  version: BuildVersion;
  log: Log;
  // The environment the server started in. Each pane's shell starts with it.
  environment: Record<string, string | undefined>;
  // For tests: ends a render hold after this many milliseconds. Defaults to the publisher's limit.
  holdLimitMs?: number;
}

// A failed step does not stop the steps after it, and the lock is always released.
type StopResult = { ok: true } | { ok: false; reason: 'cleanupFailed'; message: string };

export interface Server {
  // Resolves once every shutdown step has run, and never rejects. On success the panes have ended,
  // the connections are closed, and the socket is gone.
  stopped: Promise<StopResult>;
  stop: () => void;
  // For tests: write to the pane's PTY and read the pane's text while the pane runs.
  writeToPane: (text: string) => void;
  paneText: () => string | undefined;
  snapshot: () => Snapshot;
}

type ClaimFailure = Extract<Awaited<ReturnType<typeof claimSocketPath>>, { ok: false }>;

type RunServerResult =
  | { ok: true; server: Server }
  | ClaimFailure
  | { ok: false; reason: 'listenFailed'; message: string };

interface ConnectionData {
  id: number;
  connection: Connection;
}

interface RowSubscriptions {
  // The panes this connection gets rows from.
  paneIds: readonly PaneId[];
  acknowledge: (sequence: number) => boolean;
  unsubscribe: () => void;
}

type Listener = Bun.UnixSocketListener<ConnectionData>;

// PTYs, parsers, and sockets. The store holds none of them.
interface Runtime {
  panes: Map<PaneId, PaneRuntime>;
  rowPublishers: Map<PaneId, { publisher: RowPublisher; pending: boolean }>;
  connections: Map<number, Connection>;
  // The client a terminal connection's sized hello attached.
  clientIds: Map<Connection, ClientId>;
  // The row subscriptions of each terminal connection. Their ack records an ack on each pane
  // subscription, and is true if one took it.
  rowSubscriptions: Map<Connection, RowSubscriptions>;
  listener: Listener | undefined;
  nextConnectionId: number;
  // Whether panes start in a systemd user scope. Decided when the first pane starts.
  paneScopes: boolean | undefined;
}

interface ServerContext {
  options: ServerOptions;
  // The claimed socket path with its symlinks resolved. The server binds and removes only this.
  socketPath: string;
  // Releases the socket path's lock. Call it only after the socket is gone.
  releaseLock: () => void;
  // The store's current state. Only report and dispatch replace it.
  state: State;
  runtime: Runtime;
  stopped: PromiseWithResolvers<StopResult>;
  releaseSignals: () => void;
  // Why a pane failed to start during the current request, so the request can report it.
  paneStartFailure: string | undefined;
}

// Effects report facts with this, and report starts effects, so effects take it as an argument.
type Report = (context: ServerContext, fact: Fact) => void;

type PaneLayoutRequest = Extract<ControlMessage, { type: 'paneSplit' | 'paneFocus' | 'paneClose' }>;

type WorkspaceRequest = Extract<
  ControlMessage,
  { type: 'workspaceCreate' | 'workspaceFocus' | 'workspaceRename' | 'workspaceClose' }
>;

type TabRequest = Extract<ControlMessage, { type: 'tabCreate' | 'tabFocus' | 'tabClose' }>;

// How long a pane whose stop failed gets to exit after it is killed.
const paneExitWaitMs = 1000;

// 1 MiB of frames a client has not read yet.
const connectionQueueLimitBytes = 0x10_00_00;

// How long a detached client gets to read its last message before the server closes it.
const connectionFlushTimeoutMs = 5000;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const disposePane = (context: ServerContext, id: PaneId, generation: number): void => {
  const pane = context.runtime.panes.get(id);

  if (pane?.generation !== generation) {
    return;
  }

  context.runtime.panes.delete(id);
  context.runtime.rowPublishers.get(id)?.publisher[Symbol.dispose]();
  context.runtime.rowPublishers.delete(id);
  pane[Symbol.dispose]();
};

const scheduleRows = (context: ServerContext, id: PaneId, generation: number): void => {
  const publication = context.runtime.rowPublishers.get(id);

  if (publication === undefined || publication.pending || context.state.stopping) {
    return;
  }

  publication.pending = true;

  setImmediate(() => {
    publication.pending = false;

    if (context.state.stopping || context.runtime.panes.get(id)?.generation !== generation) {
      return;
    }

    try {
      publication.publisher.publish();
    } catch (error) {
      context.options.log.error('Publishing pane rows failed.', {
        paneId: id,
        error: describeError(error),
      });
    }
  });
};

const subscribeRows = (
  context: ServerContext,
  connection: Connection,
  paneIds: readonly PaneId[],
): RowSubscriptions => {
  const subscriptions: RowSubscription[] = [];

  for (const id of paneIds) {
    const publication = context.runtime.rowPublishers.get(id);

    if (publication === undefined) {
      continue;
    }

    const subscription = publication.publisher.subscribe((update) => {
      if (connection.isClosed()) {
        return;
      }

      try {
        connection.sendBinary(FrameKind.rowUpdate, encodeRowUpdate(update));
      } catch (error) {
        context.options.log.error('Sending pane rows failed.', { error: describeError(error) });
        connection.close();
      }
    });

    const pane = context.runtime.panes.get(id);

    subscriptions.push(subscription);

    if (pane !== undefined) {
      scheduleRows(context, id, pane.generation);
    }
  }

  const acknowledge = (sequence: number): boolean => {
    const accepted = subscriptions.map((subscription) => subscription.acknowledge(sequence));

    return accepted.includes(true);
  };

  const unsubscribe = (): void => {
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  };

  return { paneIds, acknowledge, unsubscribe };
};

// The panes in the layout of the focused workspace's active tab that have a row publisher.
const visiblePaneIds = (context: ServerContext): PaneId[] => {
  const { state, runtime } = context;
  const workspace = state.workspaces.find((known) => known.id === state.focusedWorkspaceId);
  const tab = state.tabs.find((known) => known.id === workspace?.activeTabId);

  if (tab === undefined) {
    return [];
  }

  const placed = layoutPanes(tab.layout, state.layoutArea);

  return placed.map((rectangle) => rectangle.paneId).filter((id) => runtime.rowPublishers.has(id));
};

const sameIds = (left: readonly PaneId[], right: readonly PaneId[]): boolean =>
  left.length === right.length && left.every((id) => right.includes(id));

// Moves each terminal connection to the visible panes. A new subscriber gets the full screen.
const syncRowSubscriptions = (context: ServerContext): void => {
  const visible = visiblePaneIds(context);

  for (const [connection, current] of context.runtime.rowSubscriptions) {
    if (!sameIds(current.paneIds, visible)) {
      current.unsubscribe();
      context.runtime.rowSubscriptions.set(connection, subscribeRows(context, connection, visible));
    }
  }
};

const applyAttachedTheme = (context: ServerContext, runtime: PaneRuntime): void => {
  const theme = paneTheme(context.state);

  if (theme !== undefined) {
    runtime.terminal.setDefaultColors(theme.foreground, theme.background, theme.palette);
  }
};

const applyThemeToPane = (context: ServerContext): void => {
  for (const runtime of context.runtime.panes.values()) {
    applyAttachedTheme(context, runtime);
  }
};

const paneScopesEnabled = (context: ServerContext): boolean => {
  const { runtime, options } = context;

  if (runtime.paneScopes === undefined) {
    runtime.paneScopes = scopeAvailable(options.environment);

    options.log.info(
      runtime.paneScopes
        ? 'Pane processes run in systemd user scopes.'
        : 'No systemd user scope is available. Stop ends the shell session only.',
    );
  }

  return runtime.paneScopes;
};

const workspaceRootOf = (context: ServerContext, pane: Pane): string => {
  const tab = context.state.tabs.find((known) => known.id === pane.tabId);
  const workspace = context.state.workspaces.find((known) => known.id === tab?.workspaceId);

  invariant(workspace !== undefined, `Pane ${pane.id} has no workspace.`);

  return workspace.root;
};

const startPane = (context: ServerContext, pane: Pane, report: Report): void => {
  const { log } = context.options;
  const { id, generation } = pane;

  const spawned = spawnPane({
    generation,
    size: pane.size,
    environment: context.options.environment,
    directory: workspaceRootOf(context, pane),
    useScope: paneScopesEnabled(context),
    onOutput: () => {
      scheduleRows(context, id, generation);
    },
  });

  if (!spawned.ok) {
    log.error('The pane failed to start.', { paneId: id, message: spawned.message });
    context.paneStartFailure = spawned.message;
    report(context, { type: 'paneFailedToStart', paneId: id, generation });

    return;
  }

  const number = Number(id.slice('pane-'.length));

  const publisher = createRowPublisher(spawned.pane.terminal, number, pane.size, {
    ...(context.options.holdLimitMs === undefined
      ? {}
      : { holdLimitMs: context.options.holdLimitMs }),
    requestPublication: () => {
      scheduleRows(context, id, generation);
    },
  });

  applyAttachedTheme(context, spawned.pane);
  context.runtime.panes.set(id, spawned.pane);
  context.runtime.rowPublishers.set(id, { publisher, pending: false });
  log.info('Started the pane.', { paneId: id });

  spawned.pane.exited
    .then((exitCode) => {
      log.info('The pane exited.', { paneId: id, exitCode });
      report(context, { type: 'paneExited', paneId: id, generation, exitCode });
    })
    .catch((error: unknown) => {
      log.error('Handling the pane exit failed.', { paneId: id, error: describeError(error) });
    });

  report(context, { type: 'paneStarted', paneId: id, generation });
};

// Runs one shutdown step, and logs and records its failure instead of throwing.
const runStep = (
  context: ServerContext,
  failures: string[],
  step: string,
  run: () => void,
): void => {
  try {
    run();
  } catch (error) {
    const message = `${step}: ${describeError(error)}`;

    context.options.log.error(`${step} failed.`, { error: describeError(error) });
    failures.push(message);
  }
};

const exitedWithin = async (pane: PaneRuntime, waitMs: number): Promise<boolean> => {
  const timedOut = Bun.sleep(waitMs).then(() => false);
  const exited = pane.exited.then(() => true);

  return Promise.race([exited, timedOut]);
};

// A failed stop still kills the pane and waits a bounded time for its shell, so the rest of the
// shutdown can go on. Returns what failed.
const stopPane = async (
  context: ServerContext,
  id: PaneId,
  pane: PaneRuntime,
): Promise<string[]> => {
  const { log } = context.options;
  const failures: string[] = [];

  context.runtime.rowPublishers.get(id)?.publisher[Symbol.dispose]();

  try {
    const stopFailures = await pane.stop();

    for (const failure of stopFailures) {
      log.error('Stopping the pane failed.', { paneId: id, error: failure });
      failures.push(`Stopping pane ${id}: ${failure}`);
    }

    return failures;
  } catch (error) {
    log.error('Stopping the pane failed.', { paneId: id, error: describeError(error) });
    failures.push(`Stopping pane ${id}: ${describeError(error)}`);
  }

  runStep(context, failures, `Ending pane ${id}`, () => {
    pane[Symbol.dispose]();
  });

  if (!(await exitedWithin(pane, paneExitWaitMs))) {
    log.error('The pane did not exit in time.', { paneId: id, waitMs: paneExitWaitMs });
    failures.push(`Pane ${id} did not exit within ${paneExitWaitMs} ms`);
  }

  return failures;
};

const stopResultOf = (failures: readonly string[]): StopResult => {
  if (failures.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'cleanupFailed',
    message: `The server stopped, but its cleanup failed. ${failures.join('. ')}.`,
  };
};

// Every step runs even when an earlier one fails. The lock and the signal handlers go last.
const shutDown = async (context: ServerContext): Promise<StopResult> => {
  const { runtime, options } = context;
  const panes = [...runtime.panes.entries()];
  const paneFailures = await Promise.all(panes.map(([id, pane]) => stopPane(context, id, pane)));
  const failures = paneFailures.flat();

  runtime.panes.clear();
  runtime.rowPublishers.clear();

  for (const connection of runtime.connections.values()) {
    runStep(context, failures, 'Closing a connection', () => {
      connection.close();
    });
  }

  runtime.connections.clear();

  runStep(context, failures, 'Stopping the listener', () => {
    runtime.listener?.stop(true);
  });

  runStep(context, failures, `Removing the socket ${context.socketPath}`, () => {
    rmSync(context.socketPath, { force: true });
  });

  runStep(context, failures, 'Releasing the socket lock', context.releaseLock);
  runStep(context, failures, 'Releasing the signal handlers', context.releaseSignals);

  const result = stopResultOf(failures);

  if (result.ok) {
    options.log.info('Stopped the server.');
  }

  return result;
};

const stopServer = (context: ServerContext): void => {
  context.options.log.info('Stopping the server.');

  shutDown(context)
    .then((result) => {
      context.stopped.resolve(result);
    })
    .catch((error: unknown) => {
      const message = `Stopping the server failed: ${describeError(error)}`;

      context.options.log.error('Stopping the server failed.', { error: describeError(error) });
      context.stopped.resolve({ ok: false, reason: 'cleanupFailed', message });
    });
};

// Sizes the PTY from the current state, not from the change. A transition nested in the same effect
// batch, such as a failed pane start, may have replaced the size the change carries.
const resizePane = (context: ServerContext, id: PaneId): void => {
  const pane = context.runtime.panes.get(id);
  const publication = context.runtime.rowPublishers.get(id);
  const size = context.state.panes.find((known) => known.id === id)?.size;

  if (pane === undefined || publication === undefined || size === undefined) {
    return;
  }

  try {
    pane.resize(size);
    publication.publisher.resize(size);
  } catch (error) {
    context.options.log.error('Resizing the pane failed.', {
      paneId: id,
      error: describeError(error),
    });

    return;
  }

  scheduleRows(context, id, pane.generation);
};

// Forgets the client first, so closing its socket does not detach it a second time.
const closeDetachedClient = (
  context: ServerContext,
  detachedId: ClientId,
  reason: DetachReason,
): void => {
  const { clientIds } = context.runtime;

  for (const [connection, id] of clientIds) {
    if (id === detachedId) {
      clientIds.delete(connection);
      connection.send({ type: reason === 'takenOver' ? 'takenOver' : 'detached' });
      connection.closeWhenFlushed();
    }
  }
};

// Stops the process of a pane the store dropped. A pane that already exited has no runtime left.
const removePane = (context: ServerContext, id: PaneId): void => {
  const pane = context.runtime.panes.get(id);

  if (pane === undefined) {
    return;
  }

  // stopPane disposes the row publisher it finds in the registry, which releases held pane reads.
  const stopping = stopPane(context, id, pane);

  context.runtime.panes.delete(id);
  context.runtime.rowPublishers.delete(id);

  stopping.catch((error: unknown) => {
    context.options.log.error('Stopping the pane failed.', {
      paneId: id,
      error: describeError(error),
    });
  });
};

const runEffects = (context: ServerContext, changes: readonly Change[], report: Report): void => {
  for (const change of changes) {
    if (change.type === 'paneAdded') {
      startPane(context, change.pane, report);
    }

    if (change.type === 'paneRemoved') {
      removePane(context, change.paneId);
    }

    if (change.type === 'paneResized') {
      resizePane(context, change.paneId);
    }

    if (change.type === 'clientThemeChanged') {
      applyThemeToPane(context);
    }

    if (change.type === 'clientDetached') {
      closeDetachedClient(context, change.clientId, change.reason);
    }

    if (change.type === 'serverStopping') {
      stopServer(context);
    }
  }

  syncRowSubscriptions(context);
};

const publishChanges = (context: ServerContext, changes: readonly Change[]): void => {
  let revision = context.state.revision - changes.length;

  for (const change of changes) {
    revision += 1;

    for (const connection of context.runtime.connections.values()) {
      if (connection.isWelcomed() && !connection.isClosed()) {
        connection.send({ type: 'change', revision, change });
      }
    }
  }
};

const report = (context: ServerContext, fact: Fact): void => {
  const result = applyFact(context.state, fact);

  context.state = result.state;

  if (result.kind === 'ignored') {
    disposePane(context, result.dispose.paneId, result.dispose.generation);

    return;
  }

  publishChanges(context, result.changes);
  runEffects(context, result.changes, report);
};

// Returns the changes the intent made, none when the store refuses it.
const dispatch = (context: ServerContext, intent: Intent): readonly Change[] => {
  const result = applyIntent(context.state, intent);

  context.state = result.state;

  if (result.kind === 'rejected') {
    context.options.log.warn('Refused an intent.', { intent: intent.type, reason: result.reason });

    return [];
  }

  publishChanges(context, result.changes);
  runEffects(context, result.changes, report);

  return result.changes;
};

const findLivePane = (context: ServerContext, paneId: PaneId) => {
  const pane = context.state.panes.find((known) => known.id === paneId);
  const runtime = context.runtime.panes.get(paneId);
  const isLive = pane?.lifecycle === 'running';

  if (!isLive || runtime === undefined) {
    return undefined;
  }

  return { pane, runtime };
};

const answerPaneRead = (context: ServerContext, paneId: PaneId, connection: Connection): void => {
  const live = findLivePane(context, paneId);

  if (connection.isClosed()) {
    return;
  }

  if (live === undefined) {
    connection.send({ type: 'paneMissing', paneId });

    return;
  }

  const { epoch, activeTop } = live.runtime.terminal.stableRows();
  const read = live.runtime.terminal.readRows(epoch, activeTop, live.pane.size.rows);

  invariant(read.ok, 'The active screen must remain available during a synchronous read.');

  const rows = rowsToText(read.rows, live.pane.size.columns);

  connection.send({ type: 'paneRows', paneId, rows });
};

const answerPaneReadAfterHold = async (
  context: ServerContext,
  paneId: PaneId,
  connection: Connection,
  publisher: RowPublisher,
): Promise<void> => {
  await publisher.whenReleased();

  answerPaneRead(context, paneId, connection);
};

const handlePaneCommand = (
  context: ServerContext,
  message: Extract<ControlMessage, { type: 'paneRead' | 'paneSend' }>,
  connection: Connection,
): void => {
  const live = findLivePane(context, message.paneId);

  if (live === undefined) {
    connection.send({ type: 'paneMissing', paneId: message.paneId });

    return;
  }

  if (message.type === 'paneSend') {
    live.runtime.write(new TextEncoder().encode(message.text));
    connection.send({ type: 'paneSent', paneId: message.paneId });

    return;
  }

  const publication = context.runtime.rowPublishers.get(message.paneId);

  if (publication === undefined || !live.runtime.terminal.renderHeld()) {
    answerPaneRead(context, message.paneId, connection);

    return;
  }

  answerPaneReadAfterHold(context, message.paneId, connection, publication.publisher).catch(
    (error: unknown) => {
      context.options.log.error('Reading the pane failed.', {
        paneId: message.paneId,
        error: describeError(error),
      });
    },
  );
};

const handleDetach = (context: ServerContext, connection: Connection): void => {
  const attachedId = context.state.attachedClientId;

  // Answer first: the sender may be the attached client, and its detach closes the connection.
  connection.send({ type: 'detachResult', detached: attachedId !== undefined });

  if (attachedId !== undefined) {
    dispatch(context, { type: 'detachClient', clientId: attachedId });
  }
};

const handleClientSetting = (
  context: ServerContext,
  message: Extract<ControlMessage, { type: 'resize' | 'theme' }>,
  connection: Connection,
): void => {
  const clientId = context.runtime.clientIds.get(connection);

  if (clientId === undefined) {
    return;
  }

  if (message.type === 'resize') {
    dispatch(context, { type: 'resizeClient', clientId, size: message.size });
  } else {
    dispatch(context, { type: 'setClientTheme', clientId, theme: message.theme });
  }
};

const workspaceRequestTypes: ReadonlySet<string> = new Set([
  'workspaceCreate',
  'workspaceFocus',
  'workspaceRename',
  'workspaceClose',
]);

const isWorkspaceRequest = (message: ControlMessage): message is WorkspaceRequest =>
  workspaceRequestTypes.has(message.type);

const intentOf = (message: WorkspaceRequest): Intent => {
  if (message.type === 'workspaceCreate') {
    return {
      type: 'createWorkspace',
      root: message.root,
      label: message.label,
      background: message.background,
    };
  }

  if (message.type === 'workspaceFocus') {
    return { type: 'focusWorkspace', workspaceId: message.workspaceId };
  }

  if (message.type === 'workspaceRename') {
    return { type: 'renameWorkspace', workspaceId: message.workspaceId, label: message.label };
  }

  return { type: 'closeWorkspace', workspaceId: message.workspaceId };
};

// The store refuses a request for an unknown workspace, or while the server stops.
const refusalOf = (
  context: ServerContext,
  message: WorkspaceRequest,
): ControlMessage | undefined => {
  if (context.state.stopping) {
    return { type: 'workspaceFailed', reason: 'serverStopping', message: undefined };
  }

  if (message.type === 'workspaceCreate') {
    return undefined;
  }

  const known = context.state.workspaces.some((workspace) => workspace.id === message.workspaceId);

  return known
    ? undefined
    : { type: 'workspaceFailed', reason: 'unknownWorkspace', message: undefined };
};

const takePaneStartFailure = (context: ServerContext): string | undefined => {
  const failure = context.paneStartFailure;

  context.paneStartFailure = undefined;

  return failure;
};

const handleWorkspaceRequest = (
  context: ServerContext,
  message: WorkspaceRequest,
  connection: Connection,
): void => {
  const refusal = refusalOf(context, message);

  if (refusal !== undefined) {
    connection.send(refusal);

    return;
  }

  const changes = dispatch(context, intentOf(message));
  const added = changes.find((change) => change.type === 'workspaceAdded');
  const startFailure = takePaneStartFailure(context);

  if (startFailure !== undefined) {
    connection.send({
      type: 'workspaceFailed',
      reason: 'paneFailedToStart',
      message: startFailure,
    });

    return;
  }

  const workspaceId = added === undefined ? undefined : added.workspace.id;

  if (message.type === 'workspaceCreate') {
    invariant(workspaceId !== undefined, 'A created workspace must be added.');
    connection.send({ type: 'workspaceDone', workspaceId });

    return;
  }

  connection.send({ type: 'workspaceDone', workspaceId: message.workspaceId });
};

const isTabRequest = (message: ControlMessage): message is TabRequest =>
  message.type === 'tabCreate' || message.type === 'tabFocus' || message.type === 'tabClose';

const tabIntentOf = (message: TabRequest): Intent => {
  if (message.type === 'tabCreate') {
    return { type: 'createTab', workspaceId: message.workspaceId };
  }

  if (message.type === 'tabFocus') {
    return { type: 'focusTab', tabId: message.tabId };
  }

  return { type: 'closeTab', tabId: message.tabId };
};

// The store refuses a request for an unknown workspace or tab, or while the server stops.
const tabRefusalOf = (context: ServerContext, message: TabRequest): ControlMessage | undefined => {
  if (context.state.stopping) {
    return { type: 'tabFailed', reason: 'serverStopping', message: undefined };
  }

  if (message.type === 'tabCreate') {
    const known = context.state.workspaces.some(
      (workspace) => workspace.id === message.workspaceId,
    );

    return known
      ? undefined
      : { type: 'tabFailed', reason: 'unknownWorkspace', message: undefined };
  }

  const known = context.state.tabs.some((tab) => tab.id === message.tabId);

  return known ? undefined : { type: 'tabFailed', reason: 'unknownTab', message: undefined };
};

const handleTabRequest = (
  context: ServerContext,
  message: TabRequest,
  connection: Connection,
): void => {
  const refusal = tabRefusalOf(context, message);

  if (refusal !== undefined) {
    connection.send(refusal);

    return;
  }

  const changes = dispatch(context, tabIntentOf(message));
  const added = changes.find((change) => change.type === 'tabAdded');
  const startFailure = takePaneStartFailure(context);

  if (startFailure !== undefined) {
    connection.send({ type: 'tabFailed', reason: 'paneFailedToStart', message: startFailure });

    return;
  }

  if (message.type === 'tabCreate') {
    invariant(added !== undefined, 'A created tab must be added.');
    connection.send({ type: 'tabDone', tabId: added.tab.id });

    return;
  }

  connection.send({ type: 'tabDone', tabId: message.tabId });
};

const paneLayoutRequestTypes: ReadonlySet<string> = new Set([
  'paneSplit',
  'paneFocus',
  'paneClose',
]);

const isPaneLayoutRequest = (message: ControlMessage): message is PaneLayoutRequest =>
  paneLayoutRequestTypes.has(message.type);

const paneIntentOf = (message: PaneLayoutRequest): Intent => {
  if (message.type === 'paneSplit') {
    return { type: 'splitPane', paneId: message.paneId, direction: message.direction };
  }

  return message.type === 'paneFocus'
    ? { type: 'focusPane', paneId: message.paneId }
    : { type: 'closePane', paneId: message.paneId };
};

const paneRefusalOf = (
  context: ServerContext,
  message: PaneLayoutRequest,
): ControlMessage | undefined => {
  if (context.state.stopping) {
    return { type: 'paneFailed', reason: 'serverStopping', message: undefined };
  }

  const known = context.state.panes.some((pane) => pane.id === message.paneId);

  return known ? undefined : { type: 'paneFailed', reason: 'unknownPane', message: undefined };
};

const handlePaneLayoutRequest = (
  context: ServerContext,
  message: PaneLayoutRequest,
  connection: Connection,
): void => {
  const refusal = paneRefusalOf(context, message);

  if (refusal !== undefined) {
    connection.send(refusal);

    return;
  }

  const changes = dispatch(context, paneIntentOf(message));
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

const handleAck = (context: ServerContext, sequence: number, connection: Connection): void => {
  const accepted = context.runtime.rowSubscriptions.get(connection)?.acknowledge(sequence);

  if (accepted !== true) {
    context.options.log.debug('Ignored an ack for a sequence the client was not sent.', {
      sequence,
    });
  }
};

// Returns whether the message was a workspace, tab, or pane layout request.
const handleLayoutRequest = (
  context: ServerContext,
  message: ControlMessage,
  connection: Connection,
): boolean => {
  if (isWorkspaceRequest(message)) {
    handleWorkspaceRequest(context, message, connection);

    return true;
  }

  if (isTabRequest(message)) {
    handleTabRequest(context, message, connection);

    return true;
  }

  if (isPaneLayoutRequest(message)) {
    handlePaneLayoutRequest(context, message, connection);

    return true;
  }

  return false;
};

const handleMessage = (
  context: ServerContext,
  message: ControlMessage,
  connection: Connection,
): void => {
  if (message.type === 'stop') {
    dispatch(context, { type: 'stopServer' });

    return;
  }

  if (message.type === 'detach') {
    handleDetach(context, connection);

    return;
  }

  if (message.type === 'resize' || message.type === 'theme') {
    handleClientSetting(context, message, connection);

    return;
  }

  if (message.type === 'resync') {
    connection.send({ type: 'snapshot', snapshot: snapshot(context.state) });

    return;
  }

  if (message.type === 'ack') {
    handleAck(context, message.sequence, connection);

    return;
  }

  if (message.type === 'paneRead' || message.type === 'paneSend') {
    handlePaneCommand(context, message, connection);

    return;
  }

  if (handleLayoutRequest(context, message, connection)) {
    return;
  }

  context.options.log.debug('Ignored a message the server does not handle yet.', {
    type: message.type,
  });
};

const handleInput = (context: ServerContext, payload: Uint8Array, connection: Connection): void => {
  const { log } = context.options;
  const decoded = decodePaneInput(payload);

  if (!decoded.ok) {
    log.warn('Closed a connection that sent invalid input.', { reason: decoded.reason });
    connection.close();

    return;
  }

  const target = paneIdFor(decoded.input.pane);
  const clientId = context.runtime.clientIds.get(connection);
  const isAttached = clientId !== undefined && clientId === context.state.attachedClientId;
  const live = findLivePane(context, target);

  if (!isAttached || live === undefined) {
    log.debug('Ignored input from a client that cannot write to the pane.', { paneId: target });

    return;
  }

  live.runtime.write(decoded.input.bytes);
};

const attachTerminal = (
  context: ServerContext,
  connection: Connection,
  size: TerminalSize,
): void => {
  const changes = dispatch(context, { type: 'attachClient', size });
  const attached = changes.find((change) => change.type === 'clientAttached');

  if (attached !== undefined) {
    context.runtime.clientIds.set(connection, attached.client.id);
  }
};

const openConnection = (context: ServerContext, socket: Bun.Socket<ConnectionData>): void => {
  const { runtime, options } = context;
  const id = runtime.nextConnectionId;

  runtime.nextConnectionId += 1;

  const connection = createConnection({
    socket,
    version: options.version,
    log: options.log,
    queueLimitBytes: connectionQueueLimitBytes,
    flushTimeoutMs: connectionFlushTimeoutMs,
    onWelcome: (welcomed, hello) => {
      welcomed.send({ type: 'snapshot', snapshot: snapshot(context.state) });

      if (hello.size !== undefined && !welcomed.isClosed()) {
        runtime.rowSubscriptions.set(
          welcomed,
          subscribeRows(context, welcomed, visiblePaneIds(context)),
        );

        attachTerminal(context, welcomed, hello.size);
      }
    },
    onMessage: (message, from) => {
      handleMessage(context, message, from);
    },
    onInput: (payload, from) => {
      handleInput(context, payload, from);
    },
  });

  socket.data = { id, connection };
  runtime.connections.set(id, connection);
};

const closeConnection = (context: ServerContext, id: number): void => {
  const connection = context.runtime.connections.get(id);

  if (connection === undefined) {
    return;
  }

  const clientId = context.runtime.clientIds.get(connection);

  context.runtime.connections.delete(id);
  context.runtime.clientIds.delete(connection);
  context.runtime.rowSubscriptions.get(connection)?.unsubscribe();
  context.runtime.rowSubscriptions.delete(connection);
  connection.close();

  if (clientId !== undefined) {
    // A socket can close during publication. Finish that batch before publishing its detach.
    queueMicrotask(() => {
      if (!context.state.stopping) {
        dispatch(context, { type: 'detachClient', clientId });
      }
    });
  }
};

// Clears every bit but the owner's read and write, so the socket is 0600 from its bind.
const ownerOnlyUmask = 0o177;

// Binds with a restrictive umask, so the socket never exists with a wider mode.
const listen = (context: ServerContext, path: string): Listener | string => {
  const previousUmask = process.umask(ownerOnlyUmask);

  try {
    return Bun.listen<ConnectionData>({
      unix: path,
      socket: {
        open: (socket) => {
          openConnection(context, socket);
        },
        data: (socket, bytes) => {
          socket.data.connection.receive(bytes);
        },
        drain: (socket) => {
          socket.data.connection.drain();
        },
        close: (socket) => {
          closeConnection(context, socket.data.id);
        },
      },
    });
  } catch (error) {
    return describeError(error);
  } finally {
    process.umask(previousUmask);
  }
};

// The server has no terminal, so a hangup is no reason to stop.
const handleSignals = (context: ServerContext): void => {
  const { log } = context.options;

  const stopOnSignal = (signal: NodeJS.Signals): void => {
    log.info('Stopping on a signal.', { signal });
    dispatch(context, { type: 'stopServer' });
  };

  const ignoreHangup = (): void => {
    log.debug('Ignored SIGHUP.');
  };

  process.on('SIGTERM', stopOnSignal);
  process.on('SIGINT', stopOnSignal);
  process.on('SIGHUP', ignoreHangup);

  context.releaseSignals = () => {
    process.off('SIGTERM', stopOnSignal);
    process.off('SIGINT', stopOnSignal);
    process.off('SIGHUP', ignoreHangup);
  };
};

const currentPane = (context: ServerContext): PaneRuntime | undefined => {
  const id = focusedPane(context.state)?.id;

  return id === undefined ? undefined : context.runtime.panes.get(id);
};

const serverOf = (context: ServerContext): Server => ({
  stopped: context.stopped.promise,
  stop: () => {
    dispatch(context, { type: 'stopServer' });
  },
  writeToPane: (text) => {
    currentPane(context)?.write(new TextEncoder().encode(text));
  },
  paneText: () => currentPane(context)?.text(),
  snapshot: () => snapshot(context.state),
});

// Runs a server in this process on the socket path, with no workspace. It stops on a stop message,
// SIGTERM, or SIGINT. A workspace closes when its shell exits.
export const runServer = async (options: ServerOptions): Promise<RunServerResult> => {
  const claimed = await claimSocketPath(options.socketPath);

  if (!claimed.ok) {
    return claimed;
  }

  const { path: socketPath, release: releaseLock } = claimed;

  const context: ServerContext = {
    options,
    socketPath,
    releaseLock,
    state: createState(),
    runtime: {
      panes: new Map(),
      rowPublishers: new Map(),
      connections: new Map(),
      clientIds: new Map(),
      rowSubscriptions: new Map(),
      listener: undefined,
      nextConnectionId: 1,
      paneScopes: undefined,
    },
    stopped: Promise.withResolvers(),
    releaseSignals: () => undefined,
    paneStartFailure: undefined,
  };

  const listener = listen(context, socketPath);

  if (typeof listener === 'string') {
    releaseLock();

    return {
      ok: false,
      reason: 'listenFailed',
      message: `Cannot listen on ${socketPath}: ${listener}`,
    };
  }

  context.runtime.listener = listener;
  handleSignals(context);
  options.log.info('Listening.', { socketPath });

  return { ok: true, server: serverOf(context) };
};
