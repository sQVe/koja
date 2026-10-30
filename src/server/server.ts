import { rmSync } from 'node:fs';

import type { ClientId, PaneId } from '../ids.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { decodePaneInput } from '../rows/rows.ts';
import { applyFact, applyIntent, createState, snapshot } from '../store/store.ts';
import type { Change, Fact, Intent, PiRecovery, Snapshot, State } from '../store/store.ts';
import {
  attachTerminal,
  closeDetachedClient,
  handleAck,
  handleClientSetting,
  handleDetach,
  handlePaneScroll,
  markActive,
} from './clientRequests.ts';
import { createConnection } from './connection.ts';
import type { Connection } from './connection.ts';
import { changesOf } from './dispatchResult.ts';
import type { DispatchResult } from './dispatchResult.ts';
import type { Log } from './log.ts';
import type { PaneRuntime } from './pane.ts';
import {
  applyThemeToPane,
  focusedRuntime,
  releasePane,
  removePane,
  resizePane,
  runStep,
  startPane,
  stopPane,
} from './paneEffects.ts';
import { handlePaneLayoutRequest, isPaneLayoutRequest } from './paneLayoutRequests.ts';
import { createPasteSecret } from './panePaste.ts';
import type { RunningPane } from './paneRecord.ts';
import {
  answerPaneFolders,
  answerPaneProcessInfo,
  handlePaneCommand,
  isPaneCommand,
  forgetPaneReads,
  writePaneInput,
} from './paneRequests.ts';
import { createSnapshotStore } from './paneSnapshot.ts';
import type { SnapshotStore } from './paneSnapshot.ts';
import { checkSavedPi } from './piRecoveryStart.ts';
import { answerPiStatus, handlePiReport } from './piReports.ts';
import { subscribeRows, syncRowSubscriptions, visiblePaneIds } from './rowSubscriptions.ts';
import type { RowSubscriptions } from './rowSubscriptions.ts';
import { createStopResults, stopOutcomeOf } from './serverStopResult.ts';
import type { StopResults } from './serverStopResult.ts';
import { readSessionFile } from './sessionFile.ts';
import {
  currentSession,
  restoreSession,
  savedSessionFilesOf,
  savesSession,
  unusableKindOf,
} from './sessionState.ts';
import { createSessionWriter } from './sessionWriter.ts';
import type { SessionWriter } from './sessionWriter.ts';
import { claimSocketPath } from './socketPath.ts';
import { handleTabRequest, isTabRequest } from './tabRequests.ts';
import { handleWorkspaceRequest, isWorkspaceRequest } from './workspaceRequests.ts';
export { createLog, logPathFor } from './log.ts';
export { piRecoveryReasonText } from './piRecovery.ts';
export { sessionPathFor } from './sessionFile.ts';
export { socketPathFor, socketRouteFor } from './socketPath.ts';

interface ServerOptions {
  socketPath: string;
  version: BuildVersion;
  log: Log;
  // The command that runs Koja. Panes receive it as KOJA_BIN_PATH.
  binaryPath: string;
  // The environment the server started in. Each pane's shell starts with it.
  environment: Record<string, string | undefined>;
  // For tests: ends a render hold after this many milliseconds. Defaults to the publisher's limit.
  holdLimitMs?: number;
  // For tests: the history each pane keeps, in bytes. Defaults to the pane's limit.
  scrollbackBytes?: number;
  // Names the save file for the claimed socket path, which has its symlinks resolved. Without it
  // the server neither saves nor restores a session.
  sessionPathFor?: (socketPath: string) => string;
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

type Listener = Bun.UnixSocketListener<ConnectionData>;

// PTYs, parsers, and sockets. The store holds none of them.
interface Runtime {
  panes: Map<PaneId, RunningPane>;
  connections: Map<number, Connection>;
  stopResults: StopResults;
  // The client a terminal connection's sized hello attached.
  clientIds: Map<Connection, ClientId>;
  // The row subscriptions of each terminal connection. Their ack records an ack on the named
  // pane's subscription, and is true if it took it.
  rowSubscriptions: Map<Connection, RowSubscriptions>;
  // The snapshot of the read a connection has parts left of, one per connection.
  readSnapshots: SnapshotStore<Connection>;
  pasteSecret: Uint8Array;
  listener: Listener | undefined;
  nextConnectionId: number;
  // Whether panes start in a systemd user scope. Decided when the first pane starts.
  paneScopes: boolean | undefined;
  piRecoveries: Map<PaneId, PiRecovery>;
  seenSessionFiles: Set<string>;
  sessionWriter: SessionWriter | undefined;
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
}

// Effects report facts with this, and report starts effects, so effects take it as an argument.
type Report = (context: ServerContext, fact: Fact) => void;

// 1 MiB of frames a client has not read yet.
const connectionQueueLimitBytes = 0x10_00_00;

// How long a detached client gets to read its last message before the server closes it.
const connectionFlushTimeoutMs = 5000;

const stopFlushTimeoutMs = 1000;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const stopResultOf = (failures: readonly string[]): StopResult => {
  const outcome = stopOutcomeOf(failures);

  if (outcome.ok) {
    return { ok: true };
  }

  return { ok: false, reason: 'cleanupFailed', message: outcome.message };
};

// Every step runs even when an earlier one fails. The lock and the signal handlers go last.
const shutDown = async (context: ServerContext): Promise<StopResult> => {
  const { runtime, options } = context;

  // Pane exits during the stop must not change the saved session, so it is final before any pane ends.
  const saved = await runtime.sessionWriter?.stopSaving(currentSession(context));

  const panes = [...runtime.panes.entries()];
  const paneFailures = await Promise.all(panes.map(([id, pane]) => stopPane(context, id, pane)));
  const failures = paneFailures.flat();

  if (saved?.ok === false) {
    failures.unshift(saved.message);
  }

  runtime.panes.clear();
  runtime.stopResults.publish(failures);
  await runtime.stopResults.flush({ timeoutMs: stopFlushTimeoutMs, failures });

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

// Returns the first message of a new pane that failed to start.
const runEffects = (
  context: ServerContext,
  changes: readonly Change[],
  report: Report,
): string | undefined => {
  let startFailure: string | undefined;

  for (const change of changes) {
    if (change.type === 'paneAdded') {
      const failure = startPane(context, change.pane, (fact) => {
        report(context, fact);
      });

      startFailure ??= failure;
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

  return startFailure;
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

const saveSession = (context: ServerContext, changes: readonly Change[]): void => {
  if (savesSession(changes)) {
    context.runtime.sessionWriter?.save(currentSession(context));
  }
};

const report = (context: ServerContext, fact: Fact): void => {
  const result = applyFact(context.state, fact);

  context.state = result.state;

  if (result.kind === 'ignored') {
    releasePane(context, result.dispose.paneId, result.dispose.generation);

    return;
  }

  publishChanges(context, result.changes);
  runEffects(context, result.changes, report);
  saveSession(context, result.changes);
};

const dispatch = (context: ServerContext, intent: Intent): DispatchResult => {
  const result = applyIntent(context.state, intent);

  context.state = result.state;

  if (result.kind === 'rejected') {
    context.options.log.warn('Refused an intent.', { intent: intent.type, reason: result.reason });

    return { kind: 'rejected', reason: result.reason };
  }

  publishChanges(context, result.changes);

  const startFailure = runEffects(context, result.changes, report);

  saveSession(context, result.changes);

  return { kind: 'applied', changes: result.changes, startFailure };
};

const dispatchChanges = (context: ServerContext, intent: Intent): readonly Change[] =>
  changesOf(dispatch(context, intent));

const handleFamilyRequest = (
  context: ServerContext,
  message: ControlMessage,
  connection: Connection,
): boolean => {
  const dispatchIntent = (intent: Intent): DispatchResult => dispatch(context, intent);

  if (message.type === 'piReport') {
    handlePiReport(context, message, connection);

    return true;
  }

  if (message.type === 'piStatus') {
    answerPiStatus(context, message.paneId, connection);

    return true;
  }

  if (isWorkspaceRequest(message)) {
    handleWorkspaceRequest(context, message, connection, dispatchIntent);

    return true;
  }

  if (isTabRequest(message)) {
    handleTabRequest(context, message, connection, dispatchIntent);

    return true;
  }

  if (isPaneLayoutRequest(message)) {
    handlePaneLayoutRequest(context, message, connection, dispatchIntent);

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
    context.runtime.stopResults.add(connection);
    dispatch(context, { type: 'stopServer' });

    return;
  }

  const dispatchIntent = (intent: Intent): readonly Change[] => dispatchChanges(context, intent);

  if (message.type === 'detach') {
    handleDetach(context, message, connection, dispatchIntent);

    return;
  }

  if (message.type === 'paneScroll') {
    handlePaneScroll(context, message, connection, dispatchIntent);

    return;
  }

  if (message.type === 'resize' || message.type === 'theme') {
    handleClientSetting(context, message, connection, dispatchIntent);

    return;
  }

  if (message.type === 'resync') {
    connection.send({ type: 'snapshot', snapshot: snapshot(context.state) });

    return;
  }

  if (message.type === 'ack') {
    handleAck(context, message.paneId, message.sequence, connection);

    return;
  }

  markActive(context, connection, dispatchIntent);

  if (isPaneCommand(message)) {
    handlePaneCommand(context, message, connection);

    return;
  }

  if (message.type === 'paneFolders') {
    answerPaneFolders(context, connection);

    return;
  }

  if (message.type === 'paneProcessInfo') {
    answerPaneProcessInfo(context, message.paneId, connection);

    return;
  }

  if (handleFamilyRequest(context, message, connection)) {
    return;
  }

  context.options.log.debug('Ignored a message the server does not handle yet.', {
    type: message.type,
  });
};

const handleInput = (context: ServerContext, payload: Uint8Array, connection: Connection): void => {
  const decoded = decodePaneInput(payload);

  if (!decoded.ok) {
    context.options.log.warn('Closed a connection that sent invalid input.', {
      reason: decoded.reason,
    });

    connection.close();

    return;
  }

  markActive(context, connection, (intent) => dispatchChanges(context, intent));
  writePaneInput(context, connection, decoded.input);
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
          subscribeRows(context, welcomed, visiblePaneIds(context, welcomed)),
        );

        attachTerminal(
          context,
          welcomed,
          hello.size,
          (intent) => dispatchChanges(context, intent),
          () => {
            syncRowSubscriptions(context);
          },
        );
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
  forgetPaneReads(context, connection);
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

const currentPane = (context: ServerContext): PaneRuntime | undefined =>
  focusedRuntime(context.state, context.runtime.panes);

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
    options: { ...options, socketPath },
    socketPath,
    releaseLock,
    state: createState(),
    runtime: {
      panes: new Map(),
      connections: new Map(),
      stopResults: createStopResults(options.log),
      clientIds: new Map(),
      rowSubscriptions: new Map(),
      readSnapshots: createSnapshotStore(),
      pasteSecret: createPasteSecret(),
      listener: undefined,
      nextConnectionId: 1,
      paneScopes: undefined,
      piRecoveries: new Map(),
      seenSessionFiles: new Set(),
      sessionWriter: undefined,
    },
    stopped: Promise.withResolvers(),
    releaseSignals: () => undefined,
  };

  const sessionPath = options.sessionPathFor?.(socketPath);
  const saved = sessionPath === undefined ? undefined : await readSessionFile(sessionPath);

  context.runtime.seenSessionFiles = savedSessionFilesOf(saved);
  context.runtime.piRecoveries = await checkSavedPi(saved);

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

  if (sessionPath !== undefined) {
    context.runtime.sessionWriter = createSessionWriter(
      sessionPath,
      options.log,
      unusableKindOf(saved),
    );

    restoreSession(options.log, (intent) => dispatchChanges(context, intent), sessionPath, saved);
  }

  return { ok: true, server: serverOf(context) };
};
