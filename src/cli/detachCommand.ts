import { runDetach } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import type { DetachCommand } from './clientCommandParse.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, print, printJson } from './output.ts';
import type { Outcome } from './output.ts';

type DetachFailure = 'noServer' | 'refused' | 'connectionFailed' | 'noClient' | 'unknownClient';

type DetachOutput = { detached: true } | { detached: false; reason: DetachFailure };

const failed = (json: boolean, reason: DetachFailure, message: string): Outcome => {
  if (json) {
    printJson({ detached: false, reason } satisfies DetachOutput);
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
      return failed(
        command.json,
        'refused',
        connectionFailureMessage(result, socketPath, 'detach'),
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

    const message = connectionFailureMessage({ reason: result.reason }, socketPath, 'detach');

    return failed(command.json, result.reason, message);
  }

  print<DetachOutput>(command.json, {
    json: { detached: true },
    text: `Detached the client on ${socketPath}.`,
  });

  return { ok: true };
};
