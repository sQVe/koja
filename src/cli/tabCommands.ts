import { activeTabIdOf, runSnapshot, runTabCommand } from '../client/client.ts';
import type { StoreSnapshot, TabCommand } from '../client/client.ts';
import type { WorkspaceId } from '../ids.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { resolveFolder } from './directory.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, print } from './output.ts';
import type { Outcome } from './output.ts';
import type { TabAction, TabCliCommand } from './tabCommandParse.ts';

interface TabEntry {
  id: string;
  workspace: string;
  number: number;
  active: boolean;
  pane: string;
}

interface TabActionOutput {
  tab: string;
}

type RequestAction = Exclude<TabAction, { action: 'list' | 'create' }>;

const listTabs = (snapshot: StoreSnapshot) =>
  snapshot.tabs.map((tab) => {
    const owner = snapshot.workspaces.find((workspace) => workspace.id === tab.workspaceId);

    return {
      id: tab.id,
      workspace: tab.workspaceId,
      number: (owner?.tabIds.indexOf(tab.id) ?? -1) + 1,
      active: activeTabIdOf(snapshot.defaultView, tab.workspaceId) === tab.id,
      pane: tab.focusedPaneId,
    };
  });

const runTabList = async (
  command: TabCliCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runSnapshot(socketPath, version);

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'tab list') };
  }

  const tabs = listTabs(result.snapshot);

  const lines = tabs.map(
    (tab) => `${tab.active ? '*' : ' '} ${tab.id}\t${tab.workspace}\t${tab.number}\t${tab.pane}`,
  );

  print<TabEntry[]>(command.json, { json: tabs, text: lines.join('\n') });

  return { ok: true };
};

const doneText = (action: TabCommand['action'], id: string): string => {
  const verbs = { create: 'Created', focus: 'Focused', close: 'Closed' };

  return `${verbs[action]} ${id}.`;
};

const runTabRequest = async (
  command: TabCliCommand,
  request: TabCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runTabCommand(socketPath, version, request);

  if (result.ok) {
    print<TabActionOutput>(command.json, {
      json: { tab: result.tabId },
      text: doneText(request.action, result.tabId),
    });

    return { ok: true };
  }

  if (result.reason === 'unknownTab') {
    const id = 'tabId' in request ? request.tabId : '';

    return { ok: false, message: `There is no tab ${id}.` };
  }

  if (result.reason === 'unknownWorkspace') {
    const id = 'workspaceId' in request ? request.workspaceId : '';

    return { ok: false, message: `There is no workspace ${id}.` };
  }

  if (result.reason === 'serverStopping') {
    return { ok: false, message: 'The server is stopping.' };
  }

  if (result.reason === 'paneFailedToStart') {
    return { ok: false, message: `The pane did not start: ${result.message}` };
  }

  return {
    ok: false,
    message: connectionFailureMessage(result, socketPath, `tab ${request.action}`),
  };
};

const focusedWorkspaceOf = async (
  version: BuildVersion,
  socketPath: string,
): Promise<{ ok: true; id: WorkspaceId } | Extract<Outcome, { ok: false }>> => {
  const result = await runSnapshot(socketPath, version);

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'tab create') };
  }

  const id = result.snapshot.defaultView.focusedWorkspaceId;

  return id === undefined
    ? { ok: false, message: 'There is no focused workspace. Pass --workspace <id>.' }
    : { ok: true, id };
};

const runTabCreate = async (
  command: TabCliCommand,
  action: Extract<TabAction, { action: 'create' }>,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const resolved = await resolveFolder(action.cwd);

  if (!resolved.ok) {
    return resolved;
  }

  const cwd = resolved.folder;

  if (action.workspaceId !== undefined) {
    const request = {
      action: 'create',
      workspaceId: action.workspaceId,
      cwd,
      focus: action.focus,
    } as const;

    return runTabRequest(command, request, version, socketPath);
  }

  const focused = await focusedWorkspaceOf(version, socketPath);

  if (!focused.ok) {
    return focused;
  }

  return runTabRequest(
    command,
    { action: 'create', workspaceId: focused.id, cwd, focus: action.focus },
    version,
    socketPath,
  );
};

const requestFor = (action: RequestAction): TabCommand => action;

export const runTabAction = (
  command: TabCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const { tab } = command;

  if (tab.action === 'list') {
    return runTabList(command, version, socketPath);
  }

  if (tab.action === 'create') {
    return runTabCreate(command, tab, version, socketPath);
  }

  return runTabRequest(command, requestFor(tab), version, socketPath);
};
