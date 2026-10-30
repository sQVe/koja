import type { ClientId, PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { shownFocusedPaneId } from '../store/store.ts';
import type { Intent, RejectReason, State } from '../store/store.ts';
import { sourceOf } from './clientRequests.ts';
import type { Connection } from './connection.ts';
import type { Dispatch } from './dispatchResult.ts';
import { followFolderOf } from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';

export type TabRequest = Extract<
  ControlMessage,
  { type: 'tabCreate' | 'tabFocus' | 'tabRename' | 'tabClose' | 'tabLayout' }
>;

interface TabRequestContext {
  state: State;
  runtime: { panes: Map<PaneId, RunningPane>; clientIds: Map<Connection, ClientId> };
}

type TabFailureReason = Extract<ControlMessage, { type: 'tabFailed' }>['reason'];

const tabRequestTypes: ReadonlySet<string> = new Set([
  'tabCreate',
  'tabFocus',
  'tabRename',
  'tabClose',
  'tabLayout',
]);

export const isTabRequest = (message: ControlMessage): message is TabRequest =>
  tabRequestTypes.has(message.type);

const tabIntentOf = (
  context: TabRequestContext,
  message: TabRequest,
  source: { clientId?: ClientId },
): Intent => {
  if (message.type === 'tabCreate') {
    const sourcePane = shownFocusedPaneId(context.state, message.workspaceId, source.clientId);
    const folder = message.cwd ?? followFolderOf(context, sourcePane);

    return {
      type: 'createTab',
      workspaceId: message.workspaceId,
      folder,
      focus: message.focus,
      ...source,
    };
  }

  if (message.type === 'tabFocus') {
    return { type: 'focusTab', tabId: message.tabId, ...source };
  }

  if (message.type === 'tabRename') {
    return { type: 'renameTab', tabId: message.tabId, label: message.label };
  }

  if (message.type === 'tabLayout') {
    return { type: 'setTabLayout', tabId: message.tabId, choice: message.choice };
  }

  return { type: 'closeTab', tabId: message.tabId };
};

// A reason that maps to undefined means a server bug for this request.
const failureReasons: Record<RejectReason, TabFailureReason | undefined> = {
  serverStopping: 'serverStopping',
  sessionNotEmpty: undefined,
  unknownClient: undefined,
  unknownWorkspace: 'unknownWorkspace',
  unknownTab: 'unknownTab',
  unknownPane: undefined,
  paneTooSmall: undefined,
  sameTab: undefined,
  noSplit: undefined,
  requiresLegacyLayout: undefined,
  requiresMasterLayout: undefined,
  staleGeneration: undefined,
};

export const handleTabRequest = (
  context: TabRequestContext,
  message: TabRequest,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const result = dispatch(tabIntentOf(context, message, sourceOf(context, connection)));

  if (result.kind === 'rejected') {
    const reason = failureReasons[result.reason];

    invariant(reason !== undefined, `A tab request cannot be rejected as ${result.reason}.`);

    connection.send({
      type: 'tabFailed',
      reason,
      message: undefined,
    });

    return;
  }

  if (result.startFailure !== undefined) {
    connection.send({
      type: 'tabFailed',
      reason: 'paneFailedToStart',
      message: result.startFailure,
    });

    return;
  }

  if (message.type === 'tabCreate') {
    const added = result.changes.find((change) => change.type === 'tabAdded');

    invariant(added !== undefined, 'A created tab must be added.');
    connection.send({ type: 'tabDone', tabId: added.tab.id });

    return;
  }

  connection.send({ type: 'tabDone', tabId: message.tabId });
};
