import type { ClientId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import type { Intent, RejectReason, State } from '../store/store.ts';
import { sourceOf } from './clientRequests.ts';
import type { Connection } from './connection.ts';
import type { Dispatch } from './dispatchResult.ts';

export type WorkspaceRequest = Extract<
  ControlMessage,
  { type: 'workspaceCreate' | 'workspaceFocus' | 'workspaceRename' | 'workspaceClose' }
>;

interface WorkspaceRequestContext {
  state: State;
  runtime: { clientIds: Map<Connection, ClientId> };
}

type WorkspaceFailureReason = Extract<ControlMessage, { type: 'workspaceFailed' }>['reason'];

const workspaceRequestTypes: ReadonlySet<string> = new Set([
  'workspaceCreate',
  'workspaceFocus',
  'workspaceRename',
  'workspaceClose',
]);

export const isWorkspaceRequest = (message: ControlMessage): message is WorkspaceRequest =>
  workspaceRequestTypes.has(message.type);

const workspaceIntentOf = (message: WorkspaceRequest, source: { clientId?: ClientId }): Intent => {
  if (message.type === 'workspaceCreate') {
    return {
      type: 'createWorkspace',
      root: message.root,
      label: message.label,
      focus: message.focus,
      ...source,
    };
  }

  if (message.type === 'workspaceFocus') {
    return { type: 'focusWorkspace', workspaceId: message.workspaceId, ...source };
  }

  if (message.type === 'workspaceRename') {
    return { type: 'renameWorkspace', workspaceId: message.workspaceId, label: message.label };
  }

  return { type: 'closeWorkspace', workspaceId: message.workspaceId };
};

// A reason that maps to undefined means a server bug for this request.
const failureReasons: Record<RejectReason, WorkspaceFailureReason | undefined> = {
  serverStopping: 'serverStopping',
  sessionNotEmpty: undefined,
  unknownClient: undefined,
  unknownWorkspace: 'unknownWorkspace',
  unknownTab: undefined,
  unknownPane: undefined,
  paneTooSmall: undefined,
  sameTab: undefined,
  noSplit: undefined,
  requiresLegacyLayout: undefined,
  requiresMasterLayout: undefined,
  staleGeneration: undefined,
};

export const handleWorkspaceRequest = (
  context: WorkspaceRequestContext,
  message: WorkspaceRequest,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const result = dispatch(workspaceIntentOf(message, sourceOf(context, connection)));

  if (result.kind === 'rejected') {
    const reason = failureReasons[result.reason];

    invariant(reason !== undefined, `A workspace request cannot be rejected as ${result.reason}.`);

    connection.send({
      type: 'workspaceFailed',
      reason,
      message: undefined,
    });

    return;
  }

  if (result.startFailure !== undefined) {
    connection.send({
      type: 'workspaceFailed',
      reason: 'paneFailedToStart',
      message: result.startFailure,
    });

    return;
  }

  if (message.type === 'workspaceCreate') {
    const added = result.changes.find((change) => change.type === 'workspaceAdded');

    invariant(added !== undefined, 'A created workspace must be added.');
    connection.send({ type: 'workspaceDone', workspaceId: added.workspace.id });

    return;
  }

  connection.send({ type: 'workspaceDone', workspaceId: message.workspaceId });
};
