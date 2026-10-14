import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runSnapshot, runWorkspaceCommand } from '../client/client.ts';
import type { WorkspaceCommand } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, print } from './output.ts';
import type { Outcome } from './output.ts';
import type { WorkspaceAction, WorkspaceCliCommand } from './parse.ts';

type RequestAction = Exclude<WorkspaceAction, { action: 'list' | 'create' }>;

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const status = await stat(path);

    return status.isDirectory();
  } catch {
    return false;
  }
};

const runWorkspaceList = async (
  command: WorkspaceCliCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runSnapshot(socketPath, version);

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'workspace list') };
  }

  const { snapshot } = result;

  const workspaces = snapshot.workspaces.map((workspace) => ({
    id: workspace.id,
    root: workspace.root,
    label: workspace.label,
    focused: workspace.id === snapshot.defaultView.focusedWorkspaceId,
  }));

  const lines = workspaces.map(
    (workspace) =>
      `${workspace.focused ? '*' : ' '} ${workspace.id}\t${workspace.label}\t${workspace.root}`,
  );

  print(command.json, { json: workspaces, text: lines.join('\n') });

  return { ok: true };
};

const requestFor = (action: RequestAction): WorkspaceCommand => action;

const doneText = (action: WorkspaceCommand['action'], id: string): string => {
  const verbs = {
    create: 'Created',
    focus: 'Focused',
    rename: 'Renamed',
    close: 'Closed',
  };

  return `${verbs[action]} ${id}.`;
};

const runWorkspaceRequest = async (
  command: WorkspaceCliCommand,
  request: WorkspaceCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runWorkspaceCommand(socketPath, version, request);

  if (result.ok) {
    print(command.json, {
      json: { workspace: result.workspaceId },
      text: doneText(request.action, result.workspaceId),
    });

    return { ok: true };
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
    message: connectionFailureMessage(result, socketPath, `workspace ${request.action}`),
  };
};

const runWorkspaceCreate = async (
  command: WorkspaceCliCommand,
  action: Extract<WorkspaceAction, { action: 'create' }>,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const root = resolve(action.directory);

  if (!(await isDirectory(root))) {
    return { ok: false, message: `${root} is not a directory.` };
  }

  const request: WorkspaceCommand = {
    action: 'create',
    root,
    label: action.label,
    background: action.background,
  };

  return runWorkspaceRequest(command, request, version, socketPath);
};

export const runWorkspaceAction = (
  command: WorkspaceCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const { workspace } = command;

  if (workspace.action === 'list') {
    return runWorkspaceList(command, version, socketPath);
  }

  if (workspace.action === 'create') {
    return runWorkspaceCreate(command, workspace, version, socketPath);
  }

  return runWorkspaceRequest(command, requestFor(workspace), version, socketPath);
};
