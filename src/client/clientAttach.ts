import { paneId } from '../ids.ts';
import type { PaneId, TabId } from '../ids.ts';
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
import { paneLayoutRequest } from './paneRequest.ts';
import type { PaneMoveDestination, ResizeDirection, SplitDirection } from './paneRequest.ts';
import { createRowCache } from './rowCache.ts';
import type { RowCache } from './rowCache.ts';
import { activeTabIdOf, applyChange, viewedPane, shownView } from './snapshot.ts';
import type { StoreChange, StoreSnapshot } from './snapshot.ts';
import { tabRequest } from './tabRequest.ts';
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

export type PaneNotice = { kind: 'bell'; count: number } | { kind: 'clipboardWrite'; text: string };

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
  // Calls back for a bell or a clipboard write a pane program made while this client was in the
  // foreground.
  subscribeNotices: (listener: (notice: PaneNotice) => void) => () => void;
  rowCache: (pane: PaneId) => RowCache | undefined;
  // The sequence of the newest row update applied to the pane's cache, drawn or not.
  newestSequence: (pane: PaneId) => number | undefined;
  resize: (size: TerminalSize) => void;
  // Tells the server the colors of the client's terminal.
  setTheme: (theme: TerminalTheme) => void;
  // Tells the server the client has drawn every row update up to this sequence.
  acknowledge: (pane: PaneId, sequence: number) => void;
  sendInput: (pane: PaneId, bytes: Uint8Array) => void;
  // Creates a tab in the focused workspace, or focuses one of its tabs. A tab that does not exist
  // changes nothing.
  focusTab: (route: TabRoute) => void;
  // Whether a tab request is sent and not yet answered. The snapshot lags behind it.
  tabPending: () => boolean;
  // Calls back once, when no tab request is pending any more.
  afterTabAnswer: (callback: () => void) => void;
  // Ask the server to change the pane layout, like `phi pane split|focus|close`. Each promise
  // settles once the server has answered and the state changes it caused are applied. It also
  // settles when the session ends or the answer takes too long.
  splitPane: (pane: PaneId, direction: SplitDirection) => Promise<void>;
  focusPane: (pane: PaneId) => Promise<void>;
  closePane: (pane: PaneId) => Promise<void>;
  movePane: (pane: PaneId, destination: PaneMoveDestination) => Promise<void>;
  zoomPane: (pane: PaneId) => Promise<void>;
  resizePane: (pane: PaneId, direction: ResizeDirection, cells: number) => Promise<void>;
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

// Startup is short, so a few notices cover it. The limit stops a client that never subscribes from
// growing without bound.
const unheardNoticeLimit = 32;

const layoutAnswerTimeoutMs = 2000;

const handshakeTimeoutMs = 10_000;

// An input payload starts with the pane number as one 32-bit word.
const paneNumberBytes = 4;

const inputBytesPerFrame = maxFramePayloadBytes - paneNumberBytes;

const tabToFocus = (
  workspace: StoreSnapshot['workspaces'][number],
  activeId: TabId | undefined,
  route: TabRoute,
) => {
  const index = activeId === undefined ? -1 : workspace.tabIds.indexOf(activeId);

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
  const noticeListeners = new Set<(notice: PaneNotice) => void>();
  const unheardNotices: PaneNotice[] = [];
  // The server answers workspace requests in the order it receives them.
  const replyQueue: ((reply: WorkspaceReply) => void)[] = [];
  let pending: Uint8Array = new Uint8Array();
  let state: AttachState | undefined;
  let welcomed = false;
  let waitingForSnapshot = false;
  let ended = false;
  let pendingTabRequests = 0;
  let paneBeforeTabRequest: PaneId | undefined;
  let awaitingRows: PaneId | undefined;
  const freshRowPanes = new Set<PaneId>();
  let tabAnswerCallbacks: (() => void)[] = [];
  const layoutAnswers: (() => void)[] = [];
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

    for (const answered of layoutAnswers.splice(0)) {
      answered();
    }

    handshake.resolve({ ok: false, reason: 'connectionFailed' });
    closedSignal.resolve(reason);
  };

  const requestLayout = (message: ControlMessage): Promise<void> => {
    if (ended) {
      return Promise.resolve();
    }

    const answer = Promise.withResolvers<undefined>();

    const timer = setTimeout(() => {
      answer.resolve(undefined);
    }, layoutAnswerTimeoutMs);

    layoutAnswers.push(() => {
      clearTimeout(timer);
      answer.resolve(undefined);
    });

    send(message);

    return answer.promise;
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

  const releaseTabCallbacks = (): void => {
    const callbacks = tabAnswerCallbacks;

    tabAnswerCallbacks = [];

    for (const callback of callbacks) {
      callback();
    }
  };

  // A pane's rows carry its modes. Only rows that arrive after a tab request are fresh: a cache
  // from an earlier visit can be stale.
  const noteFreshRows = (pane: PaneId): void => {
    if (pendingTabRequests > 0 || awaitingRows !== undefined) {
      freshRowPanes.add(pane);
    }

    if (awaitingRows === pane) {
      awaitingRows = undefined;
      releaseTabCallbacks();
    }
  };

  const shownPane = (): PaneId | undefined => (state && viewedPane(state.snapshot))?.id;

  // A failed pane has no process, so the server never sends it rows.
  const needsFreshRows = (pane: PaneId): boolean => {
    const known = state?.snapshot.panes.find((candidate) => candidate.id === pane);

    return known?.lifecycle !== 'failed' && !freshRowPanes.has(pane);
  };

  // The server stops sending rows of a pane that is no longer shown, so held input waits for the
  // pane shown now instead.
  const retargetAwaitedRows = (): void => {
    const shown = shownPane();

    if (awaitingRows === undefined) {
      return;
    }

    if (shown === awaitingRows && needsFreshRows(shown)) {
      return;
    }

    if (shown !== undefined && needsFreshRows(shown)) {
      awaitingRows = shown;

      return;
    }

    awaitingRows = undefined;
    releaseTabCallbacks();
  };

  const takeSnapshot = (snapshot: StoreSnapshot): void => {
    waitingForSnapshot = false;
    dropRowCaches(snapshot);
    setState({ snapshot, inputMode: state?.inputMode ?? 'insert' });
    retargetAwaitedRows();
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
    retargetAwaitedRows();
  };

  // The server publishes a request's store changes before it answers, so the snapshot is current
  // here. Input then waits for the rows of the pane the switch shows.
  const takeTabAnswer = (done: boolean): void => {
    pendingTabRequests = Math.max(pendingTabRequests - 1, 0);

    if (pendingTabRequests > 0) {
      return;
    }

    const shown = shownPane();
    const switched = done && shown !== undefined && shown !== paneBeforeTabRequest;

    if (switched && needsFreshRows(shown)) {
      awaitingRows = shown;

      return;
    }

    releaseTabCallbacks();
  };

  const sendTabRequest = (message: ControlMessage): void => {
    if (pendingTabRequests === 0) {
      paneBeforeTabRequest = shownPane();
      freshRowPanes.clear();
    }

    pendingTabRequests += 1;
    send(message);
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

    noteFreshRows(pane);
  };

  const announce = (notice: PaneNotice): void => {
    if (noticeListeners.size === 0) {
      unheardNotices.push(notice);

      if (unheardNotices.length > unheardNoticeLimit) {
        unheardNotices.shift();
      }

      return;
    }

    for (const listener of noticeListeners) {
      listener(notice);
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

  // Returns whether the message answered a tab or workspace request this session sent.
  const takeRequestAnswer = (message: ControlMessage): boolean => {
    if (message.type === 'tabDone' || message.type === 'tabFailed') {
      takeTabAnswer(message.type === 'tabDone');

      return true;
    }

    if (message.type === 'workspaceDone' || message.type === 'workspaceFailed') {
      replyQueue.shift()?.(message.type === 'workspaceDone' ? 'done' : 'failed');

      return true;
    }

    return false;
  };

  // Returns whether the message was a bell or a clipboard write.
  const takePaneNotice = (message: ControlMessage): boolean => {
    if (message.type === 'bell') {
      announce({ kind: 'bell', count: message.count });

      return true;
    }

    if (message.type === 'clipboardWrite') {
      announce({ kind: 'clipboardWrite', text: message.text });

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

    if (takeRequestAnswer(message) || takePaneNotice(message)) {
      return;
    }

    if (message.type === 'change') {
      takeChange(message.revision, message.change);
    }

    if (message.type === 'paneDone' || message.type === 'paneFailed') {
      layoutAnswers.shift()?.();
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
    subscribeNotices: (listener) => {
      noticeListeners.add(listener);

      for (const notice of unheardNotices.splice(0)) {
        listener(notice);
      }

      return () => {
        noticeListeners.delete(listener);
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
    acknowledge: (pane, sequence) => {
      if (!ended) {
        send({ type: 'ack', paneId: pane, sequence });
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

      const view = shownView(snapshot);
      const workspace = snapshot.workspaces.find((known) => known.id === view.focusedWorkspaceId);

      if (workspace === undefined) {
        return;
      }

      if (route.kind === 'create') {
        sendTabRequest(
          tabRequest({ action: 'create', workspaceId: workspace.id, cwd: undefined, focus: true }),
        );

        return;
      }

      const activeId = activeTabIdOf(view, workspace.id);
      const tab = tabToFocus(workspace, activeId, route);

      if (tab !== undefined && tab !== activeId) {
        sendTabRequest(tabRequest({ action: 'focus', tabId: tab }));
      }
    },
    tabPending: () => pendingTabRequests > 0 || awaitingRows !== undefined,
    afterTabAnswer: (callback) => {
      tabAnswerCallbacks.push(callback);
    },
    splitPane: (pane, direction) =>
      requestLayout(paneLayoutRequest({ action: 'split', pane, direction, cwd: undefined })),
    focusPane: (pane) => requestLayout(paneLayoutRequest({ action: 'focus', pane })),
    closePane: (pane) => requestLayout(paneLayoutRequest({ action: 'close', pane })),
    movePane: (pane, destination) =>
      requestLayout(paneLayoutRequest({ action: 'move', pane, destination })),
    zoomPane: (pane) => requestLayout(paneLayoutRequest({ action: 'zoom', pane })),
    resizePane: (pane, direction, cells) =>
      requestLayout(paneLayoutRequest({ action: 'resize', pane, direction, cells })),
    detach: () => {
      send({ type: 'detach', clientId: undefined });
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
