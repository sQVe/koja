import type { BuildVersion } from '../protocol/protocol.ts';

export type Outcome = { ok: true } | { ok: false; message: string };

interface VersionOutput {
  version: string;
  ghostty: string;
}

interface ServerRunOutput {
  socket: string;
  pid: number;
}

interface ServerStopOutput {
  stopped: true;
}

interface PaneReadOutput {
  pane: string;
  rows: string[];
}

export interface PaneSendOutput {
  sent: true;
}

interface WorkspaceEntry {
  id: string;
  root: string;
  label: string;
  focused: boolean;
}

interface PaneEntry {
  id: string;
  workspace: string;
  tab: string;
  lifecycle: string;
  focused: boolean;
}

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

interface WorkspaceActionOutput {
  workspace: string;
}

export type DetachFailure = 'noServer' | 'refused' | 'connectionFailed' | 'noClient';

type DetachOutput = { detached: true } | { detached: false; reason: DetachFailure };

type CommandJson =
  | VersionOutput
  | ServerRunOutput
  | ServerStopOutput
  | PaneReadOutput
  | WorkspaceEntry[]
  | PaneEntry[]
  | WorkspaceActionOutput
  | TabEntry[]
  | TabActionOutput
  | DetachOutput;

// The JSON value is a public surface that agents parse.
export interface Output<Json> {
  json: Json;
  text: string;
}

type ConnectionFailure =
  | { reason: 'noServer' | 'connectionFailed' }
  | { reason: 'refused'; client: BuildVersion; server: BuildVersion };

export const print = <Json extends CommandJson>(json: boolean, output: Output<Json>): void => {
  const line = json ? JSON.stringify(output.json) : output.text;

  if (line === '') {
    return;
  }

  process.stdout.write(`${line}\n`);
};

export const connectionFailureMessage = (
  failure: ConnectionFailure,
  socketPath: string,
  task: string,
): string => {
  if (failure.reason === 'refused') {
    const { client, server } = failure;

    return (
      `CLI ${client.version} (ghostty ${client.ghostty}) cannot connect to server ` +
      `${server.version} (ghostty ${server.ghostty}). Run phi server stop followed by phi ` +
      'to restart the server. This ends every pane.'
    );
  }

  return failure.reason === 'noServer'
    ? `No server is listening on ${socketPath}.`
    : `The server on ${socketPath} did not complete the ${task}.`;
};

export const printJson = (output: PaneSendOutput): void => {
  process.stdout.write(`${JSON.stringify(output)}\n`);
};
