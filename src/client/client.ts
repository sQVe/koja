import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../protocol/protocol.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { decodePaneRows } from '../rows/rows.ts';
import type { PaneRows } from '../rows/rows.ts';
import { createPaneReader } from './paneRead.ts';
import type { PaneReadCommand, PaneReadFailure, PaneReadOutput, ReadStep } from './paneRead.ts';
import { focusedPane } from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';
import { workspaceRequest } from './workspaceRequest.ts';
import type { WorkspaceCommand } from './workspaceRequest.ts';

export { connectAttach } from './attach.ts';

export type {
  AttachSession,
  CloseReason,
  InputMode,
  TabRoute,
  TerminalTheme,
  WorkspaceReply,
} from './attach.ts';

export { createRowCache } from './rowCache.ts';
export type { RowCache } from './rowCache.ts';
export { activeTabIdOf, focusedPane, viewedPane, shownView } from './snapshot.ts';
export type { StoreSnapshot } from './snapshot.ts';
export type { WorkspaceCommand } from './workspaceRequest.ts';

type StopResult = { ok: true; close: () => void } | { ok: false; reason: 'noServer' };

// Without a pane id, the command targets the focused pane.
export interface PaneSendCommand {
  action: 'send';
  text: string;
  pane?: PaneId | undefined;
}

export type { PaneReadCommand, PaneReadSource } from './paneRead.ts';

type SplitDirection = Extract<ControlMessage, { type: 'paneSplit' }>['direction'];

type ResizeDirection = Extract<ControlMessage, { type: 'paneResize' }>['direction'];

export type PaneLayoutCommand =
  | { action: 'split'; pane: PaneId; direction: SplitDirection; cwd: string | undefined }
  | { action: 'focus'; pane: PaneId }
  | { action: 'close'; pane: PaneId }
  | { action: 'zoom'; pane: PaneId }
  | { action: 'resize'; pane: PaneId; direction: ResizeDirection; cells: number };

type PaneLayoutResult =
  | { ok: true; paneId: PaneId }
  | { ok: false; reason: 'unknownPane' }
  | { ok: false; reason: 'paneTooSmall' }
  | { ok: false; reason: 'noSplit' }
  | { ok: false; reason: 'serverStopping' }
  | { ok: false; reason: 'paneFailedToStart'; message: string }
  | RequestFailure;

type WorkspaceResult =
  | { ok: true; workspaceId: WorkspaceId }
  | { ok: false; reason: 'unknownWorkspace' }
  | { ok: false; reason: 'serverStopping' }
  | { ok: false; reason: 'paneFailedToStart'; message: string }
  | RequestFailure;

export type TabCommand =
  | { action: 'create'; workspaceId: WorkspaceId; cwd: string | undefined }
  | { action: 'focus'; tabId: TabId }
  | { action: 'close'; tabId: TabId };

type TabResult =
  | { ok: true; tabId: TabId }
  | { ok: false; reason: 'unknownWorkspace' }
  | { ok: false; reason: 'unknownTab' }
  | { ok: false; reason: 'serverStopping' }
  | { ok: false; reason: 'paneFailedToStart'; message: string }
  | RequestFailure;

type SnapshotResult = { ok: true; snapshot: StoreSnapshot } | RequestFailure;

type RequestFailure =
  | { ok: false; reason: 'noServer' | 'connectionFailed' }
  | { ok: false; reason: 'refused'; client: BuildVersion; server: BuildVersion };

interface PaneMissing {
  ok: false;
  reason: 'paneMissing';
}

type ReadResult =
  | ({ ok: true; paneId: PaneId } & PaneReadOutput)
  | ({ ok: false } & PaneReadFailure)
  | PaneMissing;

type SendResult = { ok: true } | PaneMissing;

type PaneFolders = Extract<ControlMessage, { type: 'paneFoldersReply' }>['panes'];

type PaneProcessInfo = Omit<Extract<ControlMessage, { type: 'paneProcessInfoReply' }>, 'type'>;

type PaneFoldersResult = { ok: true; panes: PaneFolders } | RequestFailure;

type PaneProcessInfoResult =
  | ({ ok: true } & PaneProcessInfo)
  | { ok: false; reason: 'unknownPane' }
  | { ok: false; reason: 'paneMissing' }
  | RequestFailure;

type DetachResult =
  | { ok: true }
  | { ok: false; reason: 'noClient' | 'unknownClient' }
  | RequestFailure;

interface Request<Result> {
  send: (message: ControlMessage) => void;
  finish: (result: Result) => void;
}

interface RequestHandlers<Result> {
  onWelcome?: (request: Request<Result>) => void;
  onMessage: (request: Request<Result>, message: ControlMessage) => void;
  onPaneRows?: (request: Request<Result>, rows: PaneRows) => void;
}

interface PaneHandlers<Result> {
  missing: Result;
  begin: (request: Request<Result>, paneId: PaneId) => void;
  onPaneMessage: (request: Request<Result>, message: ControlMessage) => void;
  onPaneRows?: (request: Request<Result>, rows: PaneRows) => void;
}

const missingPane: PaneMissing = { ok: false, reason: 'paneMissing' };

const requestTimeoutMs = 10_000;

// Sends hello, waits for welcome, and hands each later message to the handlers. Bytes the socket
// does not take stay pending and go out when it drains.
const runRequest = async <Result>(
  socketPath: string,
  version: BuildVersion,
  handlers: RequestHandlers<Result>,
): Promise<Result | RequestFailure> => {
  const answer = Promise.withResolvers<Result | RequestFailure>();
  const decoder = createFrameDecoder();
  let pending: Uint8Array = new Uint8Array();
  let welcomed = false;
  let finished = false;

  const finish = (result: Result | RequestFailure): void => {
    finished = true;
    answer.resolve(result);
  };

  const fail = (): void => {
    finish({ ok: false, reason: 'connectionFailed' });
  };

  const drain = (socket: Bun.Socket): void => {
    const written = socket.write(pending);

    if (written < 0) {
      fail();

      return;
    }

    pending = pending.subarray(written);
  };

  const request: Request<Result> = {
    send: (message) => {
      const frame = encodeFrame(FrameKind.control, encodeControl(message));
      const queued = new Uint8Array(pending.length + frame.length);

      queued.set(pending);
      queued.set(frame, pending.length);
      pending = queued;
      drain(socket);
    },
    finish,
  };

  const takeHandshake = (message: ControlMessage): void => {
    if (message.type === 'refused') {
      finish({ ok: false, reason: 'refused', client: message.client, server: message.server });

      return;
    }

    if (message.type !== 'welcome') {
      fail();

      return;
    }

    welcomed = true;
    handlers.onWelcome?.(request);
  };

  const takePaneRows = (payload: Uint8Array): void => {
    const decoded = decodePaneRows(payload);

    if (!decoded.ok || !welcomed) {
      fail();

      return;
    }

    handlers.onPaneRows?.(request, decoded.rows);
  };

  const receive = (_socket: Bun.Socket, bytes: Uint8Array): void => {
    const decoded = decoder.push(bytes);

    if (!decoded.ok) {
      fail();

      return;
    }

    for (const frame of decoded.frames) {
      if (finished) {
        return;
      }

      if (frame.kind === FrameKind.paneRows) {
        takePaneRows(frame.payload);

        continue;
      }

      const parsed = parseControl(frame.payload);

      if (frame.kind !== FrameKind.control || !parsed.ok) {
        fail();

        return;
      }

      if (welcomed) {
        handlers.onMessage(request, parsed.message);
      } else {
        takeHandshake(parsed.message);
      }
    }
  };

  let socket: Bun.Socket;

  try {
    socket = await Bun.connect({
      unix: socketPath,
      socket: { data: receive, drain, close: fail, error: fail },
    });
  } catch {
    return { ok: false, reason: 'noServer' };
  }

  const timer = setTimeout(fail, requestTimeoutMs);

  request.send({ type: 'hello', version, size: undefined });

  try {
    return await answer.promise;
  } finally {
    clearTimeout(timer);
    socket.end();
  }
};

// Runs a request against one pane: the given one, or the focused one from the snapshot.
const runPaneRequest = <Result>(
  socketPath: string,
  version: BuildVersion,
  pane: PaneId | undefined,
  handlers: PaneHandlers<Result>,
): Promise<Result | RequestFailure> => {
  let paneId: PaneId | undefined = pane;

  const askPane = (
    request: Request<Result>,
    snapshot: Extract<ControlMessage, { type: 'snapshot' }>['snapshot'],
  ): void => {
    const focused = focusedPane(snapshot);

    if (focused?.lifecycle !== 'running') {
      request.finish(handlers.missing);

      return;
    }

    paneId = focused.id;
    handlers.begin(request, focused.id);
  };

  return runRequest<Result>(socketPath, version, {
    onWelcome: (request) => {
      if (pane !== undefined) {
        handlers.begin(request, pane);
      }
    },
    onPaneRows: (request, rows) => {
      if (paneId !== undefined) {
        handlers.onPaneRows?.(request, rows);
      }
    },
    onMessage: (request, message) => {
      if (message.type === 'snapshot' && paneId === undefined) {
        askPane(request, message.snapshot);

        return;
      }

      if (!('paneId' in message) || message.paneId !== paneId) {
        return;
      }

      if (message.type === 'paneMissing') {
        request.finish(handlers.missing);

        return;
      }

      handlers.onPaneMessage(request, message);
    },
  });
};

export const runPaneSend = (
  socketPath: string,
  version: BuildVersion,
  command: PaneSendCommand,
): Promise<SendResult | RequestFailure> =>
  runPaneRequest<SendResult>(socketPath, version, command.pane, {
    missing: missingPane,
    begin: (request, paneId) => {
      request.send({ type: 'paneSend', paneId, text: command.text });
    },
    onPaneMessage: (request, message) => {
      if (message.type === 'paneSent') {
        request.finish({ ok: true });
      }
    },
  });

export const runPaneRead = (
  socketPath: string,
  version: BuildVersion,
  command: PaneReadCommand,
): Promise<ReadResult | RequestFailure> => {
  const reader = createPaneReader(command);
  let requestId = 0;
  let readPane: PaneId | undefined;

  const follow = (request: Request<ReadResult>, step: ReadStep): void => {
    if (readPane === undefined) {
      return;
    }

    if (step.kind === 'done') {
      request.finish({ ok: true, paneId: readPane, ...step.output });

      return;
    }

    if (step.kind === 'failed') {
      request.finish({ ok: false, ...step.failure });

      return;
    }

    requestId += 1;
    request.send({ type: 'paneRead', paneId: readPane, requestId, selection: step.selection });
  };

  return runPaneRequest<ReadResult>(socketPath, version, command.pane, {
    missing: missingPane,
    begin: (request, paneId) => {
      readPane = paneId;
      follow(request, reader.start());
    },
    onPaneRows: (request, rows) => {
      if (rows.requestId === requestId) {
        follow(request, reader.takeRows(rows));
      }
    },
    onPaneMessage: (request, message) => {
      if (message.type === 'paneReadFailed' && message.requestId === requestId) {
        follow(request, reader.takeFailure(message.failure));
      }
    },
  });
};

export const runPaneFolders = (
  socketPath: string,
  version: BuildVersion,
): Promise<PaneFoldersResult> =>
  runRequest<PaneFoldersResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send({ type: 'paneFolders' });
    },
    onMessage: (request, message) => {
      if (message.type === 'paneFoldersReply') {
        request.finish({ ok: true, panes: message.panes });
      }
    },
  });

export const runPaneProcessInfo = (
  socketPath: string,
  version: BuildVersion,
  paneId: PaneId,
): Promise<PaneProcessInfoResult> =>
  runRequest<PaneProcessInfoResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send({ type: 'paneProcessInfo', paneId });
    },
    onMessage: (request, message) => {
      if (message.type === 'paneProcessInfoReply' && message.paneId === paneId) {
        const { type: _type, ...info } = message;

        request.finish({ ok: true, ...info });
      }

      if (message.type === 'paneMissing' && message.paneId === paneId) {
        request.finish({ ok: false, reason: 'paneMissing' });
      }

      if (message.type === 'paneFailed' && message.reason === 'unknownPane') {
        request.finish({ ok: false, reason: 'unknownPane' });
      }
    },
  });

const paneLayoutRequest = (command: PaneLayoutCommand): ControlMessage => {
  if (command.action === 'split') {
    return {
      type: 'paneSplit',
      paneId: command.pane,
      direction: command.direction,
      cwd: command.cwd,
    };
  }

  if (command.action === 'resize') {
    return {
      type: 'paneResize',
      paneId: command.pane,
      direction: command.direction,
      cells: command.cells,
    };
  }

  if (command.action === 'zoom') {
    return { type: 'paneZoom', paneId: command.pane };
  }

  return command.action === 'focus'
    ? { type: 'paneFocus', paneId: command.pane }
    : { type: 'paneClose', paneId: command.pane };
};

export const runPaneLayoutCommand = (
  socketPath: string,
  version: BuildVersion,
  command: PaneLayoutCommand,
): Promise<PaneLayoutResult> =>
  runRequest<PaneLayoutResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send(paneLayoutRequest(command));
    },
    onMessage: (request, message) => {
      if (message.type === 'paneDone') {
        request.finish({ ok: true, paneId: message.paneId });
      }

      if (message.type === 'paneFailed' && message.reason === 'paneFailedToStart') {
        request.finish({ ok: false, reason: message.reason, message: message.message ?? '' });
      }

      if (message.type === 'paneFailed' && message.reason !== 'paneFailedToStart') {
        request.finish({ ok: false, reason: message.reason });
      }
    },
  });

export const runWorkspaceCommand = (
  socketPath: string,
  version: BuildVersion,
  command: WorkspaceCommand,
): Promise<WorkspaceResult> =>
  runRequest<WorkspaceResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send(workspaceRequest(command));
    },
    onMessage: (request, message) => {
      if (message.type === 'workspaceDone') {
        request.finish({ ok: true, workspaceId: message.workspaceId });
      }

      if (message.type === 'workspaceFailed' && message.reason === 'paneFailedToStart') {
        request.finish({ ok: false, reason: message.reason, message: message.message ?? '' });
      }

      if (message.type === 'workspaceFailed' && message.reason !== 'paneFailedToStart') {
        request.finish({ ok: false, reason: message.reason });
      }
    },
  });

const tabRequest = (command: TabCommand): ControlMessage => {
  if (command.action === 'create') {
    return { type: 'tabCreate', workspaceId: command.workspaceId, cwd: command.cwd };
  }

  return command.action === 'focus'
    ? { type: 'tabFocus', tabId: command.tabId }
    : { type: 'tabClose', tabId: command.tabId };
};

export const runTabCommand = (
  socketPath: string,
  version: BuildVersion,
  command: TabCommand,
): Promise<TabResult> =>
  runRequest<TabResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send(tabRequest(command));
    },
    onMessage: (request, message) => {
      if (message.type === 'tabDone') {
        request.finish({ ok: true, tabId: message.tabId });
      }

      if (message.type === 'tabFailed' && message.reason === 'paneFailedToStart') {
        request.finish({ ok: false, reason: message.reason, message: message.message ?? '' });
      }

      if (message.type === 'tabFailed' && message.reason !== 'paneFailedToStart') {
        request.finish({ ok: false, reason: message.reason });
      }
    },
  });

// Reads the snapshot the server sends after welcome.
export const runSnapshot = (socketPath: string, version: BuildVersion): Promise<SnapshotResult> =>
  runRequest<SnapshotResult>(socketPath, version, {
    onMessage: (request, message) => {
      if (message.type === 'snapshot') {
        request.finish({ ok: true, snapshot: message.snapshot });
      }
    },
  });

// Asks the server to detach a terminal client, the foreground one when `target` is absent.
// Fails with `noClient` when none was attached and `unknownClient` when the target is unknown.
export const runDetach = (
  socketPath: string,
  version: BuildVersion,
  target: ClientId | undefined,
): Promise<DetachResult> =>
  runRequest<DetachResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send({ type: 'detach', clientId: target });
    },
    onMessage: (request, message) => {
      if (message.type === 'detachResult') {
        request.finish(message.result);
      }
    },
  });

// Sends stop without a handshake, so it reaches a server of any build.
export const sendStop = async (socketPath: string): Promise<StopResult> => {
  let socket: Bun.Socket;

  try {
    socket = await Bun.connect({ unix: socketPath, socket: { data: () => undefined } });
  } catch {
    return { ok: false, reason: 'noServer' };
  }

  socket.write(encodeFrame(FrameKind.control, encodeControl({ type: 'stop' })));

  return {
    ok: true,
    close: () => {
      socket.end();
    },
  };
};
