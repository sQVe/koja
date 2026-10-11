import { runDetach } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { print } from './output.ts';
import type { Outcome } from './output.ts';
import type { DetachCommand } from './parse.ts';

export const runDetachCommand = async (
  command: DetachCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const result = await runDetach(socketPath, version);

  if (!result.ok) {
    if (result.reason === 'refused') {
      const { client, server } = result;

      return {
        ok: false,
        message:
          `CLI ${client.version} (ghostty ${client.ghostty}) cannot connect to server ` +
          `${server.version} (ghostty ${server.ghostty}). Run phi server stop followed by phi ` +
          'to restart the server. This ends every pane.',
      };
    }

    const message =
      result.reason === 'noServer'
        ? `No server is listening on ${socketPath}.`
        : `The server on ${socketPath} did not complete the detach.`;

    return { ok: false, message };
  }

  if (!result.detached) {
    if (command.json) {
      print(true, { json: { detached: false }, text: '' });
    }

    return { ok: false, message: `No client is attached to the server on ${socketPath}.` };
  }

  print(command.json, { json: { detached: true }, text: `Detached the client on ${socketPath}.` });

  return { ok: true };
};
