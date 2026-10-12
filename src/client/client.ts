import type { PaneId, TabId, WorkspaceId } from '../ids.ts';
import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../protocol/protocol.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { focusedPane } from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';
import { workspaceRequest } from './workspaceRequest.ts';
import type { WorkspaceCommand } from './workspaceRequest.ts';

export { connectAttach } from './attach.ts';

export type {
  AttachSession,
  CloseReason,
  InputMode,
  TerminalTheme,
  WorkspaceReply,
} from './attach.ts';

export { createRowCache } from './rowCache.ts';
export type { RowCache } from './rowCache.ts';
export { focusedPane } from './snapshot.ts';
export type { StoreSnapshot } from './snapshot.ts';
export type { WorkspaceCommand } from './workspaceRequest.ts';

type StopResult = { ok: true; close: () => void } | { ok: false; reason: 'noServer' };

// Without a pane id, the command targets the focused pane.
export type PaneCommand =
  | { action: 'read'; pane?: PaneId | undefined }
  | { action: 'send'; text: string; pane?: PaneId | undefined };

type WorkspaceResult =
  | { ok: true; workspaceId: WorkspaceId }
  | { ok: false; reason: 'unknownWorkspace' }
  | { ok: false; reason: 'serverStopping' }
  | { ok: false; reason: 'paneFailedToStart'; message: string }
  | RequestFailure;

export type TabCommand =
  | { action: 'create'; workspaceId: WorkspaceId }
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

type PaneResult =
  | { ok: true; kind: 'rows'; paneId: PaneId; rows: string[] }
  | { ok: true; kind: 'sent' }
  | { ok: false; reason: 'paneMissing' }
  | RequestFailure;

type DetachResult = { ok: true; detached: boolean } | RequestFailure;

interface Request<Result> {
  send: (message: ControlMessage) => void;
  finish: (result: Result) => void;
}

interface RequestHandlers<Result> {
  onWelcome?: (request: Request<Result>) => void;
  onMessage: (request: Request<Result>, message: ControlMessage) => void;
}

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

const paneRequest = (paneId: PaneId, command: PaneCommand): ControlMessage =>
  command.action === 'read'
    ? { type: 'paneRead', paneId }
    : { type: 'paneSend', paneId, text: command.text };

export const runPaneCommand = (
  socketPath: string,
  version: BuildVersion,
  command: PaneCommand,
): Promise<PaneResult | RequestFailure> => {
  let paneId: PaneId | undefined = command.pane;

  const askPane = (
    request: Request<PaneResult>,
    snapshot: Extract<ControlMessage, { type: 'snapshot' }>['snapshot'],
  ): void => {
    const pane = focusedPane(snapshot);

    if (pane?.lifecycle !== 'running') {
      request.finish({ ok: false, reason: 'paneMissing' });

      return;
    }

    paneId = pane.id;
    request.send(paneRequest(pane.id, command));
  };

  const answerPane = (request: Request<PaneResult>, message: ControlMessage): void => {
    if (!('paneId' in message) || message.paneId !== paneId) {
      return;
    }

    if (message.type === 'paneMissing') {
      request.finish({ ok: false, reason: 'paneMissing' });
    }

    if (message.type === 'paneRows' && command.action === 'read') {
      request.finish({ ok: true, kind: 'rows', paneId: message.paneId, rows: message.rows });
    }

    if (message.type === 'paneSent' && command.action === 'send') {
      request.finish({ ok: true, kind: 'sent' });
    }
  };

  return runRequest<PaneResult>(socketPath, version, {
    onWelcome: (request) => {
      if (command.pane !== undefined) {
        request.send(paneRequest(command.pane, command));
      }
    },
    onMessage: (request, message) => {
      if (message.type === 'snapshot' && paneId === undefined) {
        askPane(request, message.snapshot);

        return;
      }

      answerPane(request, message);
    },
  });
};

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
    return { type: 'tabCreate', workspaceId: command.workspaceId };
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

// Asks the server to detach its terminal client. `detached` is false when none was attached.
export const runDetach = (socketPath: string, version: BuildVersion): Promise<DetachResult> =>
  runRequest<DetachResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send({ type: 'detach' });
    },
    onMessage: (request, message) => {
      if (message.type === 'detachResult') {
        request.finish({ ok: true, detached: message.detached });
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
