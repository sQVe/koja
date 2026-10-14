import type { BuildVersion } from '../protocol/protocol.ts';

export type Outcome = { ok: true } | { ok: false; message: string };

// The JSON value is a public surface that agents parse.
export interface Output<Json> {
  json: Json;
  text: string;
}

type ConnectionFailure =
  | { reason: 'noServer' | 'connectionFailed' }
  | { reason: 'refused'; client: BuildVersion; server: BuildVersion };

export const print = <Json>(json: boolean, output: Output<Json>): void => {
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
