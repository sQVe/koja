import { resolve } from 'node:path';

import { runSnapshot, runWorkspaceCommand } from '../client/client.ts';
import type { WorkspaceCommand } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { isDirectory } from './directory.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, printJson } from './output.ts';
import type { Outcome } from './output.ts';
import type { WorkspaceAction, WorkspaceCliCommand } from './workspaceCommandParse.ts';

interface WorkspaceEntry {
  id: string;
  root: string;
  label: string;
  focused: boolean;
}

interface WorkspaceActionOutput {
  workspace: string;
}

type RequestAction = Exclude<WorkspaceAction, { action: 'list' | 'create' }>;

const runWorkspaceList = async (version: BuildVersion, socketPath: string): Promise<Outcome> => {
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

  printJson(workspaces satisfies WorkspaceEntry[]);

  return { ok: true };
};

const requestFor = (action: RequestAction): WorkspaceCommand => action;

const runWorkspaceRequest = async (
  request: WorkspaceCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runWorkspaceCommand(socketPath, version, request);

  if (result.ok) {
    printJson({ workspace: result.workspaceId } satisfies WorkspaceActionOutput);

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
    focus: action.focus,
  };

  return runWorkspaceRequest(request, version, socketPath);
};

export const runWorkspaceAction = (
  command: WorkspaceCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const { workspace } = command;

  if (workspace.action === 'list') {
    return runWorkspaceList(version, socketPath);
  }

  if (workspace.action === 'create') {
    return runWorkspaceCreate(workspace, version, socketPath);
  }

  return runWorkspaceRequest(requestFor(workspace), version, socketPath);
};
