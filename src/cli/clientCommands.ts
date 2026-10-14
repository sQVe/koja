import { runSnapshot } from '../client/client.ts';
import type { StoreSnapshot } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import type { ClientCliCommand } from './clientCommandParse.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, print } from './output.ts';
import type { Outcome } from './output.ts';

const listClients = (snapshot: StoreSnapshot) =>
  snapshot.clients.map(({ id, size, view }) => ({
    id,
    foreground: snapshot.foregroundClientId === id,
    size,
    view: {
      workspace: view.focusedWorkspaceId ?? null,
      tabs: Object.fromEntries(view.activeTabs.map((active) => [active.workspaceId, active.tabId])),
    },
  }));

export const runClientAction = async (
  command: ClientCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const result = await runSnapshot(socketPath, version);

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'client list') };
  }

  const clients = listClients(result.snapshot);

  const lines = clients.map(
    ({ id, foreground, size, view }) =>
      `${foreground ? '*' : ' '} ${id}\t${size.columns}x${size.rows}\t${view.workspace ?? '-'}`,
  );

  print(command.json, { json: clients, text: lines.join('\n') });

  return { ok: true };
};
