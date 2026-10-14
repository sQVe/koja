import { runDetach } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import type { DetachCommand } from './clientCommandParse.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { print } from './output.ts';
import type { DetachFailure, Outcome } from './output.ts';

const failed = (json: boolean, reason: DetachFailure, message: string): Outcome => {
  if (json) {
    print(true, { json: { detached: false, reason }, text: message });
  }

  return { ok: false, message };
};

export const runDetachCommand = async (
  command: DetachCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const result = await runDetach(socketPath, version, command.client);

  if (!result.ok) {
    if (result.reason === 'refused') {
      const { client, server } = result;

      return failed(
        command.json,
        'refused',
        `CLI ${client.version} (ghostty ${client.ghostty}) cannot connect to server ` +
          `${server.version} (ghostty ${server.ghostty}). Run phi server stop followed by phi ` +
          'to restart the server. This ends every pane.',
      );
    }

    if (result.reason === 'unknownClient') {
      return failed(command.json, 'unknownClient', `There is no client ${command.client ?? ''}.`);
    }

    if (result.reason === 'noClient') {
      return failed(
        command.json,
        'noClient',
        `No client is attached to the server on ${socketPath}.`,
      );
    }

    const message =
      result.reason === 'noServer'
        ? `No server is listening on ${socketPath}.`
        : `The server on ${socketPath} did not complete the detach.`;

    return failed(command.json, result.reason, message);
  }

  print(command.json, { json: { detached: true }, text: `Detached the client on ${socketPath}.` });

  return { ok: true };
};
