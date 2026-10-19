import { connectAttach } from '../client/client.ts';
import type { CloseReason } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import type { AttachCommand } from './clientCommandParse.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import type { Outcome } from './output.ts';

type ConnectResult = Awaited<ReturnType<typeof connectAttach>>;

const defaultColumns = 80;

const defaultRows = 24;

const exitMessages = (socketPath: string): Partial<Record<CloseReason, string>> => ({
  detached: `Detached from ${socketPath}.`,
  takenOver: `Another client took over ${socketPath}.`,
});

export const connectWithTerminalSize = (
  socketPath: string,
  version: BuildVersion,
): Promise<ConnectResult> => {
  const size = {
    columns: process.stdout.columns || defaultColumns,
    rows: process.stdout.rows || defaultRows,
  };

  return connectAttach(socketPath, version, size);
};

export const runConnected = async (result: ConnectResult, socketPath: string): Promise<Outcome> => {
  if (!result.ok) {
    if (result.reason === 'refused') {
      const { client, server } = result;

      return {
        ok: false,
        message:
          `CLI ${client.version} (ghostty ${client.ghostty}) cannot connect to server ` +
          `${server.version} (ghostty ${server.ghostty}). Run koja server stop followed by koja ` +
          'to restart the server. This ends every pane.',
      };
    }

    const message =
      result.reason === 'noServer'
        ? `No server is listening on ${socketPath}.`
        : `The server on ${socketPath} did not complete the attach handshake.`;

    return { ok: false, message };
  }

  let exitMessage: string | undefined;

  try {
    const { runAttach } = await import('../ui/ui.tsx');

    const reason = await runAttach(result.session);

    if (reason === 'connectionFailed') {
      return { ok: false, message: `The connection to the server on ${socketPath} failed.` };
    }

    exitMessage = exitMessages(socketPath)[reason];
  } finally {
    result.session.close();
  }

  if (exitMessage !== undefined) {
    process.stdout.write(`${exitMessage}\n`);
  }

  return { ok: true };
};

export const runAttachCommand = async (
  command: AttachCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const result = await connectWithTerminalSize(socketPath, version);

  return runConnected(result, socketPath);
};
