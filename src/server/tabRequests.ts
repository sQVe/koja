import type { ClientId, PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { shownFocusedPaneId } from '../store/store.ts';
import type { Change, Intent, State } from '../store/store.ts';
import { sourceOf } from './clientRequests.ts';
import type { Connection } from './connection.ts';
import { followFolderOf, takePaneStartFailure } from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';

export type TabRequest = Extract<
  ControlMessage,
  { type: 'tabCreate' | 'tabFocus' | 'tabRename' | 'tabClose' }
>;

interface TabRequestContext {
  state: State;
  runtime: { panes: Map<PaneId, RunningPane>; clientIds: Map<Connection, ClientId> };
  paneStartFailure: string | undefined;
}

type Dispatch = (intent: Intent) => readonly Change[];

const tabRequestTypes: ReadonlySet<string> = new Set([
  'tabCreate',
  'tabFocus',
  'tabRename',
  'tabClose',
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

  return { type: 'closeTab', tabId: message.tabId };
};

// The store refuses a request for an unknown workspace or tab, or while the server stops.
const tabRefusalOf = (
  context: TabRequestContext,
  message: TabRequest,
): ControlMessage | undefined => {
  if (context.state.stopping) {
    return { type: 'tabFailed', reason: 'serverStopping', message: undefined };
  }

  if (message.type === 'tabCreate') {
    const known = context.state.workspaces.some(
      (workspace) => workspace.id === message.workspaceId,
    );

    return known
      ? undefined
      : { type: 'tabFailed', reason: 'unknownWorkspace', message: undefined };
  }

  const known = context.state.tabs.some((tab) => tab.id === message.tabId);

  return known ? undefined : { type: 'tabFailed', reason: 'unknownTab', message: undefined };
};

export const handleTabRequest = (
  context: TabRequestContext,
  message: TabRequest,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const refusal = tabRefusalOf(context, message);

  if (refusal !== undefined) {
    connection.send(refusal);

    return;
  }

  const changes = dispatch(tabIntentOf(context, message, sourceOf(context, connection)));
  const added = changes.find((change) => change.type === 'tabAdded');
  const startFailure = takePaneStartFailure(context);

  if (startFailure !== undefined) {
    connection.send({ type: 'tabFailed', reason: 'paneFailedToStart', message: startFailure });

    return;
  }

  if (message.type === 'tabCreate') {
    invariant(added !== undefined, 'A created tab must be added.');
    connection.send({ type: 'tabDone', tabId: added.tab.id });

    return;
  }

  connection.send({ type: 'tabDone', tabId: message.tabId });
};
