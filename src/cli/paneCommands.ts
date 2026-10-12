import { focusedPane, runPaneCommand, runSnapshot } from '../client/client.ts';
import type { StoreSnapshot } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, print, printJson } from './output.ts';
import type { Outcome } from './output.ts';
import type { PaneCliCommand } from './parse.ts';

const listPanes = (snapshot: StoreSnapshot) => {
  const focusedId = focusedPane(snapshot)?.id;

  return snapshot.panes.map((pane) => {
    const tab = snapshot.tabs.find((known) => known.id === pane.tabId);

    return {
      id: pane.id,
      workspace: tab?.workspaceId ?? '',
      tab: pane.tabId,
      lifecycle: pane.lifecycle,
      focused: pane.id === focusedId,
    };
  });
};

const runPaneList = async (
  command: PaneCliCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runSnapshot(socketPath, version);

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'pane list') };
  }

  const panes = listPanes(result.snapshot);

  const lines = panes.map(
    (pane) =>
      `${pane.focused ? '*' : ' '} ${pane.id}\t${pane.workspace}\t${pane.tab}\t${pane.lifecycle}`,
  );

  print(command.json, { json: panes, text: lines.join('\n') });

  return { ok: true };
};

export const runPaneAction = async (
  command: PaneCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);

  if (command.pane.action === 'list') {
    return runPaneList(command, version, socketPath);
  }

  const result = await runPaneCommand(socketPath, version, command.pane);

  if (!result.ok && result.reason === 'paneMissing') {
    return { ok: false, message: 'The pane is no longer running.' };
  }

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'pane command') };
  }

  if (result.kind === 'rows') {
    print(command.json, {
      json: { pane: result.paneId, rows: result.rows },
      text: result.rows.join('\n'),
    });
  } else if (command.json) {
    printJson({ sent: true });
  }

  return { ok: true };
};
