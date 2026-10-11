import type { BuildVersion } from '../protocol/protocol.ts';
import { connectWithTerminalSize, runConnected } from './attachCommand.ts';
import type { Environment } from './environment.ts';
import type { Outcome } from './output.ts';
import type { DefaultCommand } from './parse.ts';
import { launchServer, serverContextFor } from './serverCommands.ts';
import { poll } from './serverContext.ts';

// The start that wins the socket lock listens within this time. A start that loses the lock waits
// this long for the winner before it reports its own failure.
const winnerListenTimeoutMs = 5000;

const connectToWinner = async (socketPath: string, version: BuildVersion) =>
  poll(async () => {
    const result = await connectWithTerminalSize(socketPath, version);

    return !result.ok && result.reason === 'noServer' ? undefined : result;
  }, winnerListenTimeoutMs);

export const runDefaultCommand = async (
  command: DefaultCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const context = serverContextFor(command.socket, false, version, environment);
  const { socketPath } = context;
  const first = await connectWithTerminalSize(socketPath, version);

  if (first.ok || first.reason !== 'noServer') {
    return runConnected(first, socketPath);
  }

  const launched = await launchServer(context);

  if (launched.ok) {
    return runConnected(await connectWithTerminalSize(socketPath, version), socketPath);
  }

  if (!launched.exitedEarly) {
    return { ok: false, message: launched.message };
  }

  const winner = await connectToWinner(socketPath, version);

  if (winner === undefined) {
    return { ok: false, message: launched.message };
  }

  return runConnected(winner, socketPath);
};
