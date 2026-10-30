import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { runPaneRequest, runRequest, sendStop } from './clientRequest.ts';
import type { Request, RequestFailure } from './clientRequest.ts';
import { createPaneReader } from './paneRead.ts';
import type { PaneReadCommand, PaneReadOutput, ReadStep } from './paneRead.ts';
import { paneLayoutRequest } from './paneRequest.ts';
import type { PaneLayoutCommand } from './paneRequest.ts';
import type { PaneReadFailure } from './rowPaging.ts';
import type { StoreSnapshot } from './snapshot.ts';
import { tabRequest } from './tabRequest.ts';
import type { TabCommand } from './tabRequest.ts';
import { workspaceRequest } from './workspaceRequest.ts';
import type { WorkspaceCommand } from './workspaceRequest.ts';

export { connectAttach, tabToFocus } from './clientAttach.ts';

export type {
  AttachSession,
  CloseReason,
  InputMode,
  PaneNotice,
  PasteRequest,
  TabRoute,
  TerminalTheme,
  WorkspaceReply,
} from './clientAttach.ts';

export { runPaneCopy } from './paneCopy.ts';
export { runPiReport, runPiStatus } from './piRequest.ts';
export type { PiRecoveryStatus, PiReportMessage, PiReportResult, PiStatus } from './piRequest.ts';
export type { PaneCopyCommand } from './paneCopy.ts';
export { runPanePaste } from './panePaste.ts';
export type { PanePasteCommand, PanePasteCommandResult, PanePasteResult } from './panePaste.ts';
export { createClipboardQueue } from './clipboardWrite.ts';
export type { ClipboardQueue } from './clipboardWrite.ts';
export { createReadRunner, readClipboard } from './clipboardRead.ts';
export type { ClipboardReadResult } from './clipboardRead.ts';
export { createRowCache } from './rowCache.ts';
export type { RowCache, RowRange } from './rowCache.ts';
export { activeTabIdOf, focusedPane, scrollTopOf, viewedPane, shownView } from './snapshot.ts';
export type { StoreSnapshot } from './snapshot.ts';

// Without a pane id, the command targets the focused pane.
export interface PaneSendCommand {
  action: 'send';
  text: string;
  pane?: PaneId | undefined;
}

// Scrolls a client's view of a pane to its oldest row, to the bottom, or to a stable row. Without
// a client, the foreground client scrolls.
export interface PaneScrollCommand {
  action: 'scroll';
  pane: PaneId;
  to: 'top' | 'bottom' | number;
  client: ClientId | undefined;
}

type PaneScrollResult =
  | { ok: true; clientId: ClientId; topRow: number | undefined }
  | { ok: false; reason: 'noClient' | 'unknownClient' | 'unknownPane' }
  | RequestFailure;

type PaneLayoutResult =
  | { ok: true; paneId: PaneId }
  | { ok: false; reason: 'unknownPane' }
  | { ok: false; reason: 'unknownTab' }
  | { ok: false; reason: 'paneTooSmall' }
  | { ok: false; reason: 'sameTab' }
  | { ok: false; reason: 'noSplit' }
  | { ok: false; reason: 'requiresLegacyLayout' }
  | { ok: false; reason: 'requiresMasterLayout' }
  | { ok: false; reason: 'noPaneInDirection' }
  | { ok: false; reason: 'serverStopping' }
  | { ok: false; reason: 'paneFailedToStart'; message: string }
  | RequestFailure;

type WorkspaceResult =
  | { ok: true; workspaceId: WorkspaceId }
  | { ok: false; reason: 'unknownWorkspace' }
  | { ok: false; reason: 'serverStopping' }
  | { ok: false; reason: 'paneFailedToStart'; message: string }
  | RequestFailure;

type TabResult =
  | { ok: true; tabId: TabId }
  | { ok: false; reason: 'unknownWorkspace' }
  | { ok: false; reason: 'unknownTab' }
  | { ok: false; reason: 'serverStopping' }
  | { ok: false; reason: 'paneFailedToStart'; message: string }
  | RequestFailure;

type SnapshotResult = { ok: true; snapshot: StoreSnapshot } | RequestFailure;

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

export { sendStop };
export type { PaneLayoutCommand, TabCommand };
export type { PaneMoveDestination } from './paneRequest.ts';
export type { WorkspaceCommand } from './workspaceRequest.ts';

export type { PaneReadCommand } from './paneRead.ts';
export type { PaneReadSource } from './rowPaging.ts';

const missingPane: PaneMissing = { ok: false, reason: 'paneMissing' };

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

    if (step.kind === 'next') {
      request.send({ type: 'paneReadNext', paneId: readPane, requestId });

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

// Fails with `noClient` when none was attached, `unknownClient` when the target is unknown, and
// `unknownPane` when the pane is unknown.
export const runPaneScroll = (
  socketPath: string,
  version: BuildVersion,
  command: PaneScrollCommand,
): Promise<PaneScrollResult> =>
  runRequest<PaneScrollResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send({
        type: 'paneScroll',
        paneId: command.pane,
        to: command.to,
        clientId: command.client,
      });
    },
    onMessage: (request, message) => {
      if (message.type === 'paneScrollResult') {
        request.finish(message.result);
      }
    },
  });
