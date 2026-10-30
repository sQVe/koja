import type { ClientId, PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import type { Intent, RejectReason, State } from '../store/store.ts';
import { sourceOf } from './clientRequests.ts';
import type { Connection } from './connection.ts';
import type { Dispatch } from './dispatchResult.ts';
import { followFolderOf } from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';

type PaneLayoutRequest = Extract<
  ControlMessage,
  {
    type:
      | 'paneSplit'
      | 'paneAdd'
      | 'paneFocus'
      | 'paneClose'
      | 'paneMove'
      | 'paneZoom'
      | 'paneResize'
      | 'paneRotate'
      | 'paneFocusDirection';
  }
>;

type PaneFailureReason = Extract<ControlMessage, { type: 'paneFailed' }>['reason'];

interface PaneLayoutRequestContext {
  state: State;
  runtime: { panes: Map<PaneId, RunningPane>; clientIds: Map<Connection, ClientId> };
}

const paneLayoutRequestTypes: ReadonlySet<string> = new Set([
  'paneSplit',
  'paneAdd',
  'paneFocus',
  'paneFocusDirection',
  'paneRotate',
  'paneClose',
  'paneMove',
  'paneZoom',
  'paneResize',
]);

export const isPaneLayoutRequest = (message: ControlMessage): message is PaneLayoutRequest =>
  paneLayoutRequestTypes.has(message.type);

// A new workspace takes the folder the pane is in, or the root of the workspace it leaves.
const workspaceRootOfMove = (
  context: PaneLayoutRequestContext,
  message: Extract<PaneLayoutRequest, { type: 'paneMove' }>,
): string | undefined => {
  const followed = followFolderOf(context, message.paneId);

  if (followed !== undefined) {
    return followed;
  }

  const pane = context.state.panes.find((known) => known.id === message.paneId);
  const tab = context.state.tabs.find((known) => known.id === pane?.tabId);

  return context.state.workspaces.find((known) => known.id === tab?.workspaceId)?.root;
};

const paneFolderOf = (
  context: PaneLayoutRequestContext,
  message: PaneLayoutRequest,
): string | undefined => {
  if (message.type === 'paneMove') {
    return message.destination.kind === 'newWorkspace'
      ? workspaceRootOfMove(context, message)
      : undefined;
  }

  if (message.type !== 'paneSplit' && message.type !== 'paneAdd') {
    return undefined;
  }

  return message.cwd ?? followFolderOf(context, message.paneId);
};

const moveDestinationOf = (
  { destination }: Extract<PaneLayoutRequest, { type: 'paneMove' }>,
  folder: string | undefined,
): Extract<Intent, { type: 'movePane' }>['destination'] => {
  if (destination.kind === 'newWorkspace') {
    return { kind: 'newWorkspace', root: folder ?? '' };
  }

  return destination;
};

const paneIntentOf = (
  message: PaneLayoutRequest,
  source: { clientId?: ClientId },
  folder: string | undefined,
): Intent => {
  if (message.type === 'paneSplit') {
    return {
      type: 'splitPane',
      paneId: message.paneId,
      direction: message.direction,
      folder,
    };
  }

  if (message.type === 'paneAdd') {
    return { type: 'addPane', paneId: message.paneId, folder };
  }

  if (message.type === 'paneMove') {
    return {
      type: 'movePane',
      paneId: message.paneId,
      destination: moveDestinationOf(message, folder),
      ...source,
    };
  }

  if (message.type === 'paneResize') {
    return {
      type: 'resizePane',
      paneId: message.paneId,
      direction: message.direction,
      cells: message.cells,
    };
  }

  if (message.type === 'paneZoom') {
    return { type: 'zoomPane', paneId: message.paneId };
  }

  if (message.type === 'paneRotate') {
    return { type: 'rotatePanes', paneId: message.paneId, direction: message.direction };
  }

  if (message.type === 'paneFocusDirection') {
    return {
      type: 'focusPaneInDirection',
      paneId: message.paneId,
      direction: message.direction,
      ...source,
    };
  }

  return message.type === 'paneFocus'
    ? { type: 'focusPane', paneId: message.paneId, ...source }
    : { type: 'closePane', paneId: message.paneId };
};

// A reason that maps to undefined means a server bug for this request.
const failureReasons: Record<RejectReason, PaneFailureReason | undefined> = {
  serverStopping: 'serverStopping',
  sessionNotEmpty: undefined,
  unknownClient: undefined,
  unknownWorkspace: undefined,
  unknownTab: 'unknownTab',
  unknownPane: 'unknownPane',
  paneTooSmall: 'paneTooSmall',
  sameTab: 'sameTab',
  noSplit: 'noSplit',
  noPaneInDirection: 'noPaneInDirection',
  requiresLegacyLayout: 'requiresLegacyLayout',
  requiresMasterLayout: 'requiresMasterLayout',
  staleGeneration: undefined,
};

export const handlePaneLayoutRequest = (
  context: PaneLayoutRequestContext,
  message: PaneLayoutRequest,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const folder = paneFolderOf(context, message);
  const result = dispatch(paneIntentOf(message, sourceOf(context, connection), folder));

  if (result.kind === 'rejected') {
    const reason = failureReasons[result.reason];

    invariant(reason !== undefined, `A pane request cannot be rejected as ${result.reason}.`);

    connection.send({
      type: 'paneFailed',
      reason,
      message: undefined,
    });

    return;
  }

  if (result.startFailure !== undefined) {
    connection.send({
      type: 'paneFailed',
      reason: 'paneFailedToStart',
      message: result.startFailure,
    });

    return;
  }

  if (message.type === 'paneSplit' || message.type === 'paneAdd') {
    const added = result.changes.find((change) => change.type === 'paneAdded');

    invariant(added !== undefined, 'A new pane must be added.');
    connection.send({ type: 'paneDone', paneId: added.pane.id });

    return;
  }

  connection.send({ type: 'paneDone', paneId: message.paneId });
};
