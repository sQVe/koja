import type { PaneId } from '../ids.ts';
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
import { focusedPane } from './snapshot.ts';

export type StopResult = { ok: true; close: () => void } | { ok: false; reason: 'noServer' };

export type RequestFailure =
  | { ok: false; reason: 'noServer' | 'connectionFailed' }
  | { ok: false; reason: 'refused'; client: BuildVersion; server: BuildVersion };

export interface Request<Result> {
  send: (message: ControlMessage) => void;
  finish: (result: Result) => void;
}

export interface RequestHandlers<Result> {
  onWelcome?: (request: Request<Result>) => void;
  onMessage: (request: Request<Result>, message: ControlMessage) => void;
  onPaneRows?: (request: Request<Result>, rows: PaneRows) => void;
}

export interface PaneHandlers<Result> {
  missing: Result;
  begin: (request: Request<Result>, paneId: PaneId) => void;
  onPaneMessage: (request: Request<Result>, message: ControlMessage) => void;
  onPaneRows?: (request: Request<Result>, rows: PaneRows) => void;
}

interface PaneTargetHandlers<Result> {
  missing: Result;
  begin: (request: Request<Result>, paneId: PaneId) => void;
  // Gets every message except the snapshot that names the target. paneId is undefined until the
  // target is known.
  onMessage: (
    request: Request<Result>,
    message: ControlMessage,
    paneId: PaneId | undefined,
  ) => void;
  onPaneRows?: (request: Request<Result>, rows: PaneRows) => void;
}

const requestTimeoutMs = 10_000;

// Sends hello, waits for welcome, and hands each later message to the handlers. Bytes the socket
// does not take stay pending and go out when it drains.
export const runRequest = async <Result>(
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

// Runs a request against one pane: the given one, or the focused running one from the snapshot.
export const runPaneTargetRequest = <Result>(
  socketPath: string,
  version: BuildVersion,
  pane: PaneId | undefined,
  handlers: PaneTargetHandlers<Result>,
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

      handlers.onMessage(request, message, paneId);
    },
  });
};

// Runs a request against one pane and hands it only the messages about that pane.
export const runPaneRequest = <Result>(
  socketPath: string,
  version: BuildVersion,
  pane: PaneId | undefined,
  handlers: PaneHandlers<Result>,
): Promise<Result | RequestFailure> =>
  runPaneTargetRequest<Result>(socketPath, version, pane, {
    missing: handlers.missing,
    begin: handlers.begin,
    ...(handlers.onPaneRows === undefined ? {} : { onPaneRows: handlers.onPaneRows }),
    onMessage: (request, message, paneId) => {
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
