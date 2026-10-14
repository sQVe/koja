import {
  focusedPane,
  runPaneFolders,
  runPaneLayoutCommand,
  runPaneProcessInfo,
  runPaneRead,
  runPaneSend,
  runSnapshot,
} from '../client/client.ts';
import type {
  PaneLayoutCommand,
  PaneReadCommand,
  PaneSendCommand,
  StoreSnapshot,
} from '../client/client.ts';
import type { PaneId } from '../ids.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { resolveFolder } from './directory.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, print, printJson } from './output.ts';
import type { Outcome } from './output.ts';
import type { PaneCliCommand } from './paneCommandParse.ts';

type PaneFolders = Extract<Awaited<ReturnType<typeof runPaneFolders>>, { ok: true }>['panes'];

type ReadFailure = Extract<
  Awaited<ReturnType<typeof runPaneRead>>,
  { reason: 'pruned' | 'staleEpoch' | 'screenChanged' | 'tooManyBytes' | 'noSnapshot' }
>;

const listPanes = (snapshot: StoreSnapshot, folders: PaneFolders) => {
  const focusedId = focusedPane(snapshot)?.id;

  return snapshot.panes.map((pane) => {
    const tab = snapshot.tabs.find((known) => known.id === pane.tabId);
    const paneFolders = folders.find((known) => known.paneId === pane.id);

    return {
      id: pane.id,
      workspace: tab?.workspaceId ?? '',
      tab: pane.tabId,
      lifecycle: pane.lifecycle,
      focused: pane.id === focusedId,
      zoomed: tab?.zoomedPaneId === pane.id,
      columns: pane.size.columns,
      rows: pane.size.rows,
      cwd: paneFolders?.folder ?? null,
      foreground_cwd: paneFolders?.foregroundFolder ?? null,
      restore_error: pane.error ?? null,
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

  const folders = await runPaneFolders(socketPath, version);

  if (!folders.ok) {
    return { ok: false, message: connectionFailureMessage(folders, socketPath, 'pane list') };
  }

  const panes = listPanes(result.snapshot, folders.panes);

  const lines = panes.map(
    (pane) =>
      `${pane.focused ? '*' : ' '} ${pane.id}\t${pane.workspace}\t${pane.tab}\t${pane.lifecycle}\t${pane.columns}x${pane.rows}\t${pane.cwd ?? ''}${pane.zoomed ? '\tzoomed' : ''}${pane.restore_error === null ? '' : `\t${pane.restore_error}`}`,
  );

  print(command.json, { json: panes, text: lines.join('\n') });

  return { ok: true };
};

const runPaneProcessInfoCommand = async (
  command: PaneCliCommand,
  pane: PaneId,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneProcessInfo(socketPath, version, pane);

  if (result.ok) {
    const processes = result.processes.map((process) => ({
      pid: process.pid,
      name: process.name,
      argv: process.argv,
      cmdline: process.cmdline,
      cwd: process.folder ?? null,
    }));

    print(command.json, {
      json: {
        pane: result.paneId,
        shell_pid: result.shellPid,
        foreground_process_group_id: result.foregroundGroup ?? null,
        foreground_processes: processes,
      },
      text: processes
        .map((process) => `${process.pid}\t${process.cwd ?? ''}\t${process.cmdline}`)
        .join('\n'),
    });

    return { ok: true };
  }

  if (result.reason === 'unknownPane') {
    return { ok: false, message: `There is no pane ${pane}.` };
  }

  if (result.reason === 'paneMissing') {
    return { ok: false, message: 'The pane is no longer running.' };
  }

  return {
    ok: false,
    message: connectionFailureMessage(result, socketPath, 'pane process-info'),
  };
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
  const resolved = await resolveFolder(request.action === 'split' ? request.cwd : undefined);

  if (!resolved.ok) {
    return resolved;
  }

  const sent = request.action === 'split' ? { ...request, cwd: resolved.folder } : request;
  const result = await runPaneLayoutCommand(socketPath, version, sent);

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

const readFailureReasons: ReadonlySet<string> = new Set([
  'pruned',
  'staleEpoch',
  'screenChanged',
  'tooManyBytes',
  'noSnapshot',
]);

const isReadFailure = (
  result: Extract<Awaited<ReturnType<typeof runPaneRead>>, { ok: false }>,
): result is ReadFailure => readFailureReasons.has(result.reason);

const readFailureMessage = (failure: ReadFailure): string => {
  if (failure.reason === 'pruned') {
    return `Rows below row ${failure.oldest} are no longer kept. The oldest kept row is ${failure.oldest}.`;
  }

  if (failure.reason === 'staleEpoch') {
    return `The pane's rows were renumbered during the read. The epoch is now ${failure.epoch}. Read again.`;
  }

  if (failure.reason === 'screenChanged') {
    return 'The pane switched between its primary and alternate screens during the read. Read again.';
  }

  if (failure.reason === 'tooManyBytes') {
    return `A read holds at most ${failure.limitBytes} bytes. Read fewer rows.`;
  }

  return 'The server no longer holds the rows of this read. Read again.';
};

const sourceNames = {
  visible: 'visible',
  recent: 'recent',
  recentUnwrapped: 'recent-unwrapped',
} as const;

// Like herdr, nonempty recent and visible text ends in a line feed and unwrapped text gets none.
const printReadText = (read: PaneReadCommand, lines: string[]): void => {
  if (lines.length === 0) {
    return;
  }

  const text = lines.join('\n');

  process.stdout.write(read.source === 'recentUnwrapped' ? text : `${text}\n`);
};

const runPaneReadCommand = async (
  command: PaneCliCommand,
  read: PaneReadCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneRead(socketPath, version, read);

  if (!result.ok && result.reason === 'paneMissing') {
    return { ok: false, message: 'The pane is no longer running.' };
  }

  if (!result.ok && isReadFailure(result)) {
    return { ok: false, message: readFailureMessage(result) };
  }

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'pane command') };
  }

  if (!command.json) {
    printReadText(read, result.lines);

    return { ok: true };
  }

  print(command.json, {
    json: {
      pane: result.paneId,
      source: sourceNames[read.source],
      epoch: result.epoch,
      oldest: result.oldest,
      from: result.from ?? null,
      to: result.to ?? null,
      lines: result.lines,
    },
    text: '',
  });

  return { ok: true };
};

const runPaneSendCommand = async (
  command: PaneCliCommand,
  send: PaneSendCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneSend(socketPath, version, send);

  if (!result.ok && result.reason === 'paneMissing') {
    return { ok: false, message: 'The pane is no longer running.' };
  }

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'pane command') };
  }

  if (command.json) {
    printJson({ sent: true });
  }

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

  if (command.pane.action === 'process-info') {
    return runPaneProcessInfoCommand(command, command.pane.pane, version, socketPath);
  }

  if (isLayoutAction(command.pane)) {
    return runPaneLayout(command, command.pane, version, socketPath);
  }

  if (command.pane.action === 'read') {
    return runPaneReadCommand(command, command.pane, version, socketPath);
  }

  return runPaneSendCommand(command, command.pane, version, socketPath);
};
