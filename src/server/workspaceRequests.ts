import type { ClientId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import type { Change, Intent, State } from '../store/store.ts';
import { sourceOf } from './clientRequests.ts';
import type { Connection } from './connection.ts';
import { takePaneStartFailure } from './paneEffects.ts';

export type WorkspaceRequest = Extract<
  ControlMessage,
  { type: 'workspaceCreate' | 'workspaceFocus' | 'workspaceRename' | 'workspaceClose' }
>;

interface WorkspaceRequestContext {
  state: State;
  runtime: { clientIds: Map<Connection, ClientId> };
  paneStartFailure: string | undefined;
}

type Dispatch = (intent: Intent) => readonly Change[];

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

// The store refuses a request for an unknown workspace, or while the server stops.
const workspaceRefusalOf = (
  context: WorkspaceRequestContext,
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

export const handleWorkspaceRequest = (
  context: WorkspaceRequestContext,
  message: WorkspaceRequest,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const refusal = workspaceRefusalOf(context, message);

  if (refusal !== undefined) {
    connection.send(refusal);

    return;
  }

  const changes = dispatch(workspaceIntentOf(message, sourceOf(context, connection)));
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
