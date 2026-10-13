import {
  focusedPane,
  runPaneCommand,
  runPaneLayoutCommand,
  runSnapshot,
} from '../client/client.ts';
import type { PaneLayoutCommand, StoreSnapshot } from '../client/client.ts';
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
      zoomed: tab?.zoomedPaneId === pane.id,
      columns: pane.size.columns,
      rows: pane.size.rows,
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
      `${pane.focused ? '*' : ' '} ${pane.id}\t${pane.workspace}\t${pane.tab}\t${pane.lifecycle}\t${pane.columns}x${pane.rows}${pane.zoomed ? '\tzoomed' : ''}`,
  );

  print(command.json, { json: panes, text: lines.join('\n') });

  return { ok: true };
};

const layoutDoneText = (action: PaneLayoutCommand['action'], id: string): string => {
  const verbs = {
    split: 'Split into',
    focus: 'Focused',
    close: 'Closed',
    zoom: 'Toggled zoom of',
    resize: 'Resized',
  };

  return `${verbs[action]} ${id}.`;
};

const runPaneLayout = async (
  command: PaneCliCommand,
  request: PaneLayoutCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneLayoutCommand(socketPath, version, request);

  if (result.ok) {
    print(command.json, {
      json: { pane: result.paneId },
      text: layoutDoneText(request.action, result.paneId),
    });

    return { ok: true };
  }

  if (result.reason === 'unknownPane') {
    return { ok: false, message: `There is no pane ${request.pane}.` };
  }

  if (result.reason === 'paneTooSmall') {
    return { ok: false, message: `Pane ${request.pane} is too small to split.` };
  }

  if (result.reason === 'noSplit') {
    return { ok: false, message: `Pane ${request.pane} has no split to resize.` };
  }

  if (result.reason === 'serverStopping') {
    return { ok: false, message: 'The server is stopping.' };
  }

  if (result.reason === 'paneFailedToStart') {
    return { ok: false, message: `The pane did not start: ${result.message}` };
  }

  return {
    ok: false,
    message: connectionFailureMessage(result, socketPath, `pane ${request.action}`),
  };
};

const layoutActions: ReadonlySet<string> = new Set(['split', 'focus', 'close', 'zoom', 'resize']);

const isLayoutAction = (action: PaneCliCommand['pane']): action is PaneLayoutCommand =>
  layoutActions.has(action.action);

export const runPaneAction = async (
  command: PaneCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);

  if (command.pane.action === 'list') {
    return runPaneList(command, version, socketPath);
  }

  if (isLayoutAction(command.pane)) {
    return runPaneLayout(command, command.pane, version, socketPath);
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
