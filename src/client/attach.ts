import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  maxFramePayloadBytes,
  parseControl,
} from '../protocol/protocol.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { decodeRowUpdate, encodePaneInput } from '../rows/rows.ts';
import { createRowCache } from './rowCache.ts';
import type { RowCache } from './rowCache.ts';
import { applyChange } from './snapshot.ts';
import type { StoreChange, StoreSnapshot } from './snapshot.ts';
import { workspaceRequest } from './workspaceRequest.ts';
import type { WorkspaceCommand } from './workspaceRequest.ts';

interface TerminalSize {
  columns: number;
  rows: number;
}

export type InputMode = 'insert' | 'normal';

export type TabRoute =
  | { kind: 'create' }
  | { kind: 'previous' }
  | { kind: 'next' }
  | { kind: 'number'; number: number };

interface AttachState {
  snapshot: StoreSnapshot;
  inputMode: InputMode;
}

export type WorkspaceReply = 'done' | 'failed';

export type CloseReason =
  | 'serverClosed'
  | 'connectionFailed'
  | 'requested'
  | 'takenOver'
  | 'detached';

interface RowsChanged {
  pane: PaneId;
  // The indexes of the active screen rows that changed.
  rows: number[];
  // The sequence of the row update. Pass it to acknowledge once the rows are drawn.
  sequence: number;
}

// Colors as 0xRRGGBB numbers.
export interface TerminalTheme {
  foreground: number;
  background: number;
  // Palette indexes 0-15.
  palette: readonly number[];
}

export interface AttachSession {
  subscribe: (listener: () => void) => () => void;
  getState: () => AttachState;
  setInputMode: (mode: InputMode) => void;
  subscribeRows: (listener: (changed: RowsChanged) => void) => () => void;
  rowCache: (pane: PaneId) => RowCache | undefined;
  // The sequence of the newest row update applied to the pane's cache, drawn or not.
  newestSequence: (pane: PaneId) => number | undefined;
  resize: (size: TerminalSize) => void;
  // Tells the server the colors of the client's terminal.
  setTheme: (theme: TerminalTheme) => void;
  // Tells the server the client has drawn every row update up to this sequence.
  acknowledge: (sequence: number) => void;
  sendInput: (pane: PaneId, bytes: Uint8Array) => void;
  // Creates a tab in the focused workspace, or focuses one of its tabs. A tab that does not exist
  // changes nothing.
  focusTab: (route: TabRoute) => void;
  // Whether a tab request is sent and not yet answered. The snapshot lags behind it.
  tabPending: () => boolean;
  // Calls back once, when no tab request is pending any more.
  afterTabAnswer: (callback: () => void) => void;
  // Asks the server to detach this client. The session closes with `detached`.
  detach: () => void;
  // The snapshot changes show the result, so the replies are ignored.
  sendWorkspaceCommand: (
    command: WorkspaceCommand,
    onReply: (reply: WorkspaceReply) => void,
  ) => void;
  close: () => void;
  closed: Promise<CloseReason>;
}

export type AttachResult =
  | { ok: true; session: AttachSession }
  | { ok: false; reason: 'noServer' | 'connectionFailed' }
  | { ok: false; reason: 'refused'; client: BuildVersion; server: BuildVersion };

const rowCacheLimit = 10_000;

const handshakeTimeoutMs = 10_000;

// An input payload starts with the pane number as one 32-bit word.
const paneNumberBytes = 4;

const inputBytesPerFrame = maxFramePayloadBytes - paneNumberBytes;

const tabToFocus = (workspace: StoreSnapshot['workspaces'][number], route: TabRoute) => {
  const index = workspace.tabIds.indexOf(workspace.activeTabId);

  if (route.kind === 'previous') {
    return workspace.tabIds[index - 1];
  }

  if (route.kind === 'next') {
    return workspace.tabIds[index + 1];
  }

  return route.kind === 'number' ? workspace.tabIds[route.number - 1] : undefined;
};

export const connectAttach = async (
  socketPath: string,
  version: BuildVersion,
  size: TerminalSize,
): Promise<AttachResult> => {
  const handshake = Promise.withResolvers<AttachResult>();
  const closedSignal = Promise.withResolvers<CloseReason>();
  const decoder = createFrameDecoder();
  const rowCaches = new Map<PaneId, RowCache>();
  const newestSequences = new Map<PaneId, number>();
  const stateListeners = new Set<() => void>();
  const rowListeners = new Set<(changed: RowsChanged) => void>();
  // The server answers workspace requests in the order it receives them.
  const replyQueue: ((reply: WorkspaceReply) => void)[] = [];
  let pending: Uint8Array = new Uint8Array();
  let state: AttachState | undefined;
  let welcomed = false;
  let waitingForSnapshot = false;
  let ended = false;
  let pendingTabRequests = 0;
  let tabAnswerCallbacks: (() => void)[] = [];
  let socket: Bun.Socket | undefined;

  const drain = (): void => {
    if (socket === undefined || pending.length === 0) {
      return;
    }

    const written = socket.write(pending);

    pending = pending.subarray(Math.max(written, 0));
  };

  const enqueue = (frame: Uint8Array): void => {
    const queued = new Uint8Array(pending.length + frame.length);

    queued.set(pending);
    queued.set(frame, pending.length);
    pending = queued;
    drain();
  };

  const send = (message: ControlMessage): void => {
    enqueue(encodeFrame(FrameKind.control, encodeControl(message)));
  };

  const end = (reason: CloseReason): void => {
    if (ended) {
      return;
    }

    ended = true;
    socket?.end();
    handshake.resolve({ ok: false, reason: 'connectionFailed' });
    closedSignal.resolve(reason);
  };

  const setState = (next: AttachState): void => {
    state = next;

    for (const listener of stateListeners) {
      listener();
    }
  };

  const dropRowCaches = (snapshot: StoreSnapshot): void => {
    const known = new Set(snapshot.panes.map((pane) => pane.id));

    for (const pane of rowCaches.keys()) {
      if (!known.has(pane)) {
        rowCaches.delete(pane);
        newestSequences.delete(pane);
      }
    }
  };

  const takeSnapshot = (snapshot: StoreSnapshot): void => {
    waitingForSnapshot = false;
    dropRowCaches(snapshot);
    setState({ snapshot, inputMode: state?.inputMode ?? 'insert' });
  };

  const takeChange = (revision: number, change: StoreChange): void => {
    if (state === undefined || waitingForSnapshot) {
      return;
    }

    if (revision !== state.snapshot.revision + 1) {
      waitingForSnapshot = true;
      send({ type: 'resync' });

      return;
    }

    const snapshot = { ...applyChange(state.snapshot, change), revision };

    dropRowCaches(snapshot);
    setState({ ...state, snapshot });
  };

  const takeRows = (bytes: Uint8Array): void => {
    const decoded = decodeRowUpdate(bytes);

    if (!decoded.ok) {
      end('connectionFailed');

      return;
    }

    const pane = paneId(decoded.update.pane);
    const cache = rowCaches.get(pane) ?? createRowCache({ rowLimit: rowCacheLimit });

    rowCaches.set(pane, cache);

    const rows = cache.apply(decoded.update);

    newestSequences.set(pane, decoded.update.sequence);

    for (const listener of rowListeners) {
      listener({ pane, rows, sequence: decoded.update.sequence });
    }
  };

  const takeHandshake = (message: ControlMessage): void => {
    if (message.type === 'refused') {
      handshake.resolve({
        ok: false,
        reason: 'refused',
        client: message.client,
        server: message.server,
      });

      end('connectionFailed');

      return;
    }

    if (message.type !== 'welcome') {
      end('connectionFailed');

      return;
    }

    welcomed = true;
  };

  // The server publishes a request's store changes before it answers, so the snapshot is current
  // when the callbacks run.
  const takeTabAnswer = (): void => {
    pendingTabRequests = Math.max(pendingTabRequests - 1, 0);

    if (pendingTabRequests > 0) {
      return;
    }

    const callbacks = tabAnswerCallbacks;

    tabAnswerCallbacks = [];

    for (const callback of callbacks) {
      callback();
    }
  };

  const sendTabRequest = (message: ControlMessage): void => {
    pendingTabRequests += 1;
    send(message);
  };

  // Returns whether the message answered a tab or workspace request this session sent.
  const takeRequestAnswer = (message: ControlMessage): boolean => {
    if (message.type === 'tabDone' || message.type === 'tabFailed') {
      takeTabAnswer();

      return true;
    }

    if (message.type === 'workspaceDone' || message.type === 'workspaceFailed') {
      replyQueue.shift()?.(message.type === 'workspaceDone' ? 'done' : 'failed');

      return true;
    }

    return false;
  };

  const takeControl = (message: ControlMessage): void => {
    if (!welcomed) {
      takeHandshake(message);

      return;
    }

    if (message.type === 'snapshot') {
      const first = state === undefined;

      takeSnapshot(message.snapshot);

      if (first) {
        handshake.resolve({ ok: true, session });
      }

      return;
    }

    if (takeRequestAnswer(message)) {
      return;
    }

    if (message.type === 'change') {
      takeChange(message.revision, message.change);
    }

    if (message.type === 'takenOver' || message.type === 'detached') {
      end(message.type);
    }
  };

  const takeFrames = (bytes: Uint8Array): void => {
    const decoded = decoder.push(bytes);

    if (!decoded.ok) {
      end('connectionFailed');

      return;
    }

    for (const frame of decoded.frames) {
      if (ended) {
        return;
      }

      if (frame.kind === FrameKind.rowUpdate) {
        takeRows(frame.payload);

        continue;
      }

      const parsed = parseControl(frame.payload);

      if (frame.kind !== FrameKind.control || !parsed.ok) {
        end('connectionFailed');

        return;
      }

      takeControl(parsed.message);
    }
  };

  const session: AttachSession = {
    subscribe: (listener) => {
      stateListeners.add(listener);

      return () => {
        stateListeners.delete(listener);
      };
    },
    getState: () => {
      invariant(state !== undefined, 'The attach session is only handed out after a snapshot.');

      return state;
    },
    setInputMode: (mode) => {
      invariant(state !== undefined, 'The attach session is only handed out after a snapshot.');

      if (state.inputMode !== mode) {
        setState({ ...state, inputMode: mode });
      }
    },
    subscribeRows: (listener) => {
      rowListeners.add(listener);

      return () => {
        rowListeners.delete(listener);
      };
    },
    rowCache: (pane) => rowCaches.get(pane),
    newestSequence: (pane) => newestSequences.get(pane),
    resize: (next) => {
      send({ type: 'resize', size: next });
    },
    setTheme: (theme) => {
      send({ type: 'theme', theme });
    },
    acknowledge: (sequence) => {
      if (!ended) {
        send({ type: 'ack', sequence });
      }
    },
    sendInput: (pane, bytes) => {
      const number = Number(pane.slice('pane-'.length));

      for (let start = 0; start < bytes.length; start += inputBytesPerFrame) {
        const part = bytes.subarray(start, start + inputBytesPerFrame);

        enqueue(encodeFrame(FrameKind.input, encodePaneInput({ pane: number, bytes: part })));
      }
    },
    focusTab: (route) => {
      invariant(state !== undefined, 'The attach session is only handed out after a snapshot.');

      const { snapshot } = state;

      const workspace = snapshot.workspaces.find(
        (known) => known.id === snapshot.focusedWorkspaceId,
      );

      if (workspace === undefined) {
        return;
      }

      if (route.kind === 'create') {
        sendTabRequest({ type: 'tabCreate', workspaceId: workspace.id });

        return;
      }

      const tab = tabToFocus(workspace, route);

      if (tab !== undefined && tab !== workspace.activeTabId) {
        sendTabRequest({ type: 'tabFocus', tabId: tab });
      }
    },
    tabPending: () => pendingTabRequests > 0,
    afterTabAnswer: (callback) => {
      tabAnswerCallbacks.push(callback);
    },
    detach: () => {
      send({ type: 'detach' });
    },
    sendWorkspaceCommand: (command, onReply) => {
      replyQueue.push(onReply);
      send(workspaceRequest(command));
    },
    close: () => {
      end('requested');
    },
    closed: closedSignal.promise,
  };

  try {
    socket = await Bun.connect({
      unix: socketPath,
      socket: {
        data: (_socket, bytes) => {
          takeFrames(bytes);
        },
        drain,
        close: () => {
          end('serverClosed');
        },
        error: () => {
          end('connectionFailed');
        },
      },
    });
  } catch {
    return { ok: false, reason: 'noServer' };
  }

  const timer = setTimeout(() => {
    end('connectionFailed');
  }, handshakeTimeoutMs);

  send({ type: 'hello', version, size });

  try {
    return await handshake.promise;
  } finally {
    clearTimeout(timer);
  }
};
