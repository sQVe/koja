import { parseArgs } from 'node:util';

import type { PaneLayoutCommand, PaneReadCommand, PaneSendCommand } from '../client/client.ts';
import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import { hasReadOptions, parseReadOptions } from './readOptions.ts';
import type { RawReadOptions } from './readOptions.ts';

type SplitDirection = Extract<PaneLayoutCommand, { action: 'split' }>['direction'];

type ResizeDirection = Extract<PaneLayoutCommand, { action: 'resize' }>['direction'];

interface CommandOptions {
  json: boolean;
  socket: string | undefined;
}

export interface VersionCommand {
  kind: 'version';
  json: boolean;
}

type PaneCliAction =
  | PaneReadCommand
  | PaneSendCommand
  | PaneLayoutCommand
  | { action: 'list' }
  | { action: 'process-info'; pane: PaneId };

export interface PaneCliCommand extends CommandOptions {
  kind: 'pane';
  pane: PaneCliAction;
}

export type WorkspaceAction =
  | { action: 'list' }
  | { action: 'create'; directory: string; label: string | undefined; background: boolean }
  | { action: 'focus'; workspaceId: WorkspaceId }
  | { action: 'rename'; workspaceId: WorkspaceId; label: string }
  | { action: 'close'; workspaceId: WorkspaceId };

export interface WorkspaceCliCommand extends CommandOptions {
  kind: 'workspace';
  workspace: WorkspaceAction;
}

export type TabAction =
  | { action: 'list' }
  | { action: 'create'; workspaceId: WorkspaceId | undefined; cwd: string | undefined }
  | { action: 'focus'; tabId: TabId }
  | { action: 'close'; tabId: TabId };

export interface TabCliCommand extends CommandOptions {
  kind: 'tab';
  tab: TabAction;
}

export interface ClientCliCommand extends CommandOptions {
  kind: 'client';
  client: { action: 'list' };
}

export interface ServerCommand extends CommandOptions {
  kind: 'server';
  action: ServerAction;
}

interface StrayOptions extends Partial<RawReadOptions> {
  label?: string;
  background?: boolean;
  pane?: string;
  workspace?: string;
  direction?: string;
  cells?: string;
  client?: string;
  cwd?: string;
}

export interface AttachCommand {
  kind: 'attach';
  socket: string | undefined;
}

export interface DefaultCommand {
  kind: 'default';
  socket: string | undefined;
}

export interface DetachCommand extends CommandOptions {
  kind: 'detach';
  client: ClientId | undefined;
}

export type Command =
  | VersionCommand
  | PaneCliCommand
  | WorkspaceCliCommand
  | TabCliCommand
  | ClientCliCommand
  | ServerCommand
  | AttachCommand
  | DefaultCommand
  | DetachCommand;

interface GroupInput {
  action: string | undefined;
  rest: string[];
  label: string | undefined;
  background: boolean;
  pane: string | undefined;
  workspace: string | undefined;
  direction: string | undefined;
  cells: string | undefined;
  cwd: string | undefined;
  read: RawReadOptions;
  options: CommandOptions;
}

type IdResult<Id> = { ok: true; id: Id } | { ok: false; message: string };

interface LayoutOptions {
  direction: string | undefined;
  cells: string | undefined;
  cwd: string | undefined;
}

interface PaneOptions extends LayoutOptions {
  read: RawReadOptions;
}

const serverActions = ['run', 'start', 'stop'] as const;

type ServerAction = (typeof serverActions)[number];

export const usage = `Usage:
  phi [--socket <path>]
  phi --version [--json]
  phi attach [--socket <path>]
  phi detach [--client <id>] [--socket <path>] [--json]
  phi client list [--socket <path>] [--json]
  phi server run [--socket <path>] [--json]
  phi server start [--socket <path>] [--json]
  phi server stop [--socket <path>] [--json]
  phi workspace list [--socket <path>] [--json]
  phi workspace create <dir> [--label <label>] [--background] [--socket <path>] [--json]
  phi workspace focus <id> [--socket <path>] [--json]
  phi workspace rename <id> <label> [--socket <path>] [--json]
  phi workspace close <id> [--socket <path>] [--json]
  phi tab list [--socket <path>] [--json]
  phi tab create [--workspace <id>] [--cwd <dir>] [--socket <path>] [--json]
  phi tab focus <id> [--socket <path>] [--json]
  phi tab close <id> [--socket <path>] [--json]
  phi pane list [--socket <path>] [--json]
  phi pane read [--pane <id>] [--source visible|recent|recent-unwrapped] [--lines <n>]
    [--from <row> --to <row>] [--socket <path>] [--json]
  phi pane send <text> [--pane <id>] [--socket <path>] [--json]
  phi pane split <id> --direction below|right [--cwd <dir>] [--socket <path>] [--json]
  phi pane focus <id> [--socket <path>] [--json]
  phi pane close <id> [--socket <path>] [--json]
  phi pane zoom <id> [--socket <path>] [--json]
  phi pane resize <id> --direction left|right|up|down --cells <n> [--socket <path>] [--json]
  phi pane process-info <id> [--socket <path>] [--json]`;

const isServerAction = (action: string | undefined): action is ServerAction =>
  serverActions.some((serverAction) => serverAction === action);

const parseId = (value: string, prefix: string): number | undefined => {
  const match = new RegExp(`^${prefix}-(0|[1-9][0-9]*)$`).exec(value);
  const number = Number(match?.[1]);

  return Number.isSafeInteger(number) ? number : undefined;
};

const parseWorkspaceId = (value: string | undefined): IdResult<WorkspaceId> => {
  const number = parseId(value ?? '', 'workspace');

  return number === undefined
    ? { ok: false, message: `'${value ?? ''}' is not a workspace id, such as workspace-1.` }
    : { ok: true, id: workspaceId(number) };
};

const parseTabId = (value: string | undefined): IdResult<TabId> => {
  const number = parseId(value ?? '', 'tab');

  return number === undefined
    ? { ok: false, message: `'${value ?? ''}' is not a tab id, such as tab-1.` }
    : { ok: true, id: tabId(number) };
};

const parseClientId = (value: string | undefined): IdResult<ClientId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  const number = parseId(value, 'client');

  return number === undefined
    ? { ok: false, message: `'${value}' is not a client id, such as client-1.` }
    : { ok: true, id: clientId(number) };
};

const parsePaneId = (value: string | undefined): IdResult<PaneId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  const number = parseId(value, 'pane');

  return number === undefined
    ? { ok: false, message: `'${value}' is not a pane id, such as pane-1.` }
    : { ok: true, id: paneId(number) };
};

const parseSplitDirection = (value: string | undefined): SplitDirection | undefined =>
  value === 'below' || value === 'right' ? value : undefined;

const resizeDirections: readonly ResizeDirection[] = ['left', 'right', 'up', 'down'];

const parseResizeDirection = (value: string | undefined): ResizeDirection | undefined =>
  resizeDirections.find((direction) => direction === value);

const parseCells = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    return undefined;
  }

  const cells = Number(value);

  return Number.isSafeInteger(cells) ? cells : undefined;
};

const parseResizeCommand = (
  pane: PaneId,
  direction: string | undefined,
  cells: string | undefined,
): PaneLayoutCommand | string => {
  const parsedDirection = parseResizeDirection(direction);

  if (parsedDirection === undefined) {
    return 'pane resize takes --direction left, right, up, or down.';
  }

  const parsedCells = parseCells(cells);

  return parsedCells === undefined
    ? 'pane resize takes --cells with a positive whole number.'
    : { action: 'resize', pane, direction: parsedDirection, cells: parsedCells };
};

const parseSplitCommand = (
  pane: PaneId,
  direction: string | undefined,
  cwd: string | undefined,
): PaneLayoutCommand | string => {
  const parsed = parseSplitDirection(direction);

  if (cwd === '') {
    return 'The --cwd folder cannot be empty.';
  }

  return parsed === undefined
    ? 'pane split takes --direction below or --direction right.'
    : { action: 'split', pane, direction: parsed, cwd };
};

const parsePaneLayoutCommand = (
  action: 'split' | 'focus' | 'close' | 'zoom' | 'resize',
  rest: string[],
  { direction, cells, cwd }: LayoutOptions,
): PaneLayoutCommand | string => {
  if (rest.length !== 1) {
    return `pane ${action} takes one pane id.`;
  }

  const target = parseId(rest[0] ?? '', 'pane');

  if (target === undefined) {
    return `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`;
  }

  if (action !== 'resize' && cells !== undefined) {
    return '--cells belongs to pane resize.';
  }

  if (action !== 'split' && cwd !== undefined) {
    return '--cwd belongs to pane split and tab create.';
  }

  if (action === 'split') {
    return parseSplitCommand(paneId(target), direction, cwd);
  }

  if (action === 'resize') {
    return parseResizeCommand(paneId(target), direction, cells);
  }

  if (direction !== undefined) {
    return '--direction belongs to pane split and pane resize.';
  }

  return { action, pane: paneId(target) };
};

const paneLayoutActions: ReadonlySet<string | undefined> = new Set([
  'split',
  'focus',
  'close',
  'zoom',
  'resize',
]);

const isPaneLayoutAction = (
  action: string | undefined,
): action is 'split' | 'focus' | 'close' | 'zoom' | 'resize' => paneLayoutActions.has(action);

const parseProcessInfoCommand = (
  rest: string[],
  pane: string | undefined,
): PaneCliAction | string => {
  if (pane !== undefined) {
    return '--pane belongs to pane read and pane send.';
  }

  if (rest.length !== 1) {
    return 'pane process-info takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  return target === undefined
    ? `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`
    : { action: 'process-info', pane: paneId(target) };
};

const parsePaneRead = (
  rest: string[],
  pane: PaneId | undefined,
  read: RawReadOptions,
): PaneReadCommand | string => {
  if (rest.length > 0) {
    return 'pane read takes no text; pane send takes one text argument.';
  }

  const options = parseReadOptions(read);

  return typeof options === 'string' ? options : { action: 'read', pane, ...options };
};

const parsePaneSend = (rest: string[], pane: PaneId | undefined): PaneSendCommand | string => {
  return rest.length === 1
    ? { action: 'send', text: rest[0] ?? '', pane }
    : 'pane read takes no text; pane send takes one text argument.';
};

const parsePaneTargetCommand = (
  action: string | undefined,
  rest: string[],
  pane: string | undefined,
  read: RawReadOptions,
): PaneCliAction | string => {
  if (action === 'list') {
    return rest.length === 0 && pane === undefined
      ? { action }
      : 'pane list takes no arguments and no --pane.';
  }

  if (action !== 'read' && action !== 'send') {
    return 'Unknown pane command.';
  }

  const target = parsePaneId(pane);

  if (!target.ok) {
    return target.message;
  }

  return action === 'read' ? parsePaneRead(rest, target.id, read) : parsePaneSend(rest, target.id);
};

const strayReadFlagMessage = ({ source, lines, from, to }: RawReadOptions): string | undefined => {
  const flags = { '--source': source, '--lines': lines, '--from': from, '--to': to };
  const stray = Object.entries(flags).find(([, value]) => value !== undefined);

  return stray === undefined ? undefined : `${stray[0]} belongs to pane read.`;
};

const parsePaneCommand = (
  action: string | undefined,
  rest: string[],
  pane: string | undefined,
  options: PaneOptions,
): PaneCliAction | string => {
  const strayRead = action === 'read' ? undefined : strayReadFlagMessage(options.read);

  if (strayRead !== undefined) {
    return strayRead;
  }

  if (isPaneLayoutAction(action)) {
    return pane === undefined
      ? parsePaneLayoutCommand(action, rest, options)
      : '--pane belongs to pane read and pane send.';
  }

  if (options.direction !== undefined) {
    return '--direction belongs to pane split and pane resize.';
  }

  if (options.cwd !== undefined) {
    return '--cwd belongs to pane split and tab create.';
  }

  if (action === 'process-info' && options.cells === undefined) {
    return parseProcessInfoCommand(rest, pane);
  }

  return options.cells === undefined
    ? parsePaneTargetCommand(action, rest, pane, options.read)
    : '--cells belongs to pane resize.';
};

const parseWorkspaceTarget = (
  action: 'focus' | 'close',
  rest: string[],
): WorkspaceAction | string => {
  if (rest.length !== 1) {
    return `workspace ${action} takes one workspace id.`;
  }

  const id = parseWorkspaceId(rest[0]);

  return id.ok ? { action, workspaceId: id.id } : id.message;
};

const parseWorkspaceRename = (rest: string[]): WorkspaceAction | string => {
  const [id, label] = rest;

  if (rest.length !== 2 || label === undefined) {
    return 'workspace rename takes a workspace id and a label.';
  }

  const target = parseWorkspaceId(id);

  if (label === '') {
    return 'The label cannot be empty.';
  }

  return target.ok ? { action: 'rename', workspaceId: target.id, label } : target.message;
};

const parseWorkspaceCreate = (
  rest: string[],
  label: string | undefined,
  background: boolean,
): WorkspaceAction | string => {
  const [directory] = rest;

  if (rest.length !== 1 || directory === undefined || directory === '') {
    return 'workspace create takes one directory.';
  }

  if (label === '') {
    return 'The label cannot be empty.';
  }

  return { action: 'create', directory, label, background };
};

const parseWorkspaceCommand = (
  action: string | undefined,
  rest: string[],
  label: string | undefined,
  background: boolean,
): WorkspaceAction | string => {
  if (action === 'create') {
    return parseWorkspaceCreate(rest, label, background);
  }

  if (label !== undefined) {
    return '--label belongs to workspace create.';
  }

  if (background) {
    return '--background belongs to workspace create.';
  }

  if (action === 'list') {
    return rest.length === 0 ? { action } : 'workspace list takes no arguments.';
  }

  if (action === 'focus' || action === 'close') {
    return parseWorkspaceTarget(action, rest);
  }

  return action === 'rename' ? parseWorkspaceRename(rest) : 'Unknown workspace command.';
};

const parseTabTarget = (action: 'focus' | 'close', rest: string[]): TabAction | string => {
  if (rest.length !== 1) {
    return `tab ${action} takes one tab id.`;
  }

  const id = parseTabId(rest[0]);

  return id.ok ? { action, tabId: id.id } : id.message;
};

const parseTabCreate = (
  rest: string[],
  workspace: string | undefined,
  cwd: string | undefined,
): TabAction | string => {
  if (rest.length > 0) {
    return 'tab create takes no arguments.';
  }

  if (cwd === '') {
    return 'The --cwd folder cannot be empty.';
  }

  if (workspace === undefined) {
    return { action: 'create', workspaceId: undefined, cwd };
  }

  const id = parseWorkspaceId(workspace);

  return id.ok ? { action: 'create', workspaceId: id.id, cwd } : id.message;
};

const parseTabCommand = (
  action: string | undefined,
  rest: string[],
  workspace: string | undefined,
  cwd: string | undefined,
): TabAction | string => {
  if (action === 'create') {
    return parseTabCreate(rest, workspace, cwd);
  }

  if (cwd !== undefined) {
    return '--cwd belongs to pane split and tab create.';
  }

  if (workspace !== undefined) {
    return '--workspace belongs to tab create.';
  }

  if (action === 'list') {
    return rest.length === 0 ? { action } : 'tab list takes no arguments.';
  }

  if (action === 'focus' || action === 'close') {
    return parseTabTarget(action, rest);
  }

  return 'Unknown tab command.';
};

const parseAttachCommand = (
  positionals: string[],
  options: CommandOptions,
): AttachCommand | string => {
  if (positionals.length !== 1 || options.json) {
    return 'attach takes only --socket.';
  }

  return { kind: 'attach', socket: options.socket };
};

const parseDetachCommand = (
  positionals: string[],
  options: CommandOptions,
  client: string | undefined,
): DetachCommand | string => {
  if (positionals.length !== 1) {
    return 'detach takes only --client, --socket, and --json.';
  }

  const target = parseClientId(client);

  return target.ok ? { kind: 'detach', client: target.id, ...options } : target.message;
};

const parseClientCommand = (
  action: string | undefined,
  rest: string[],
  options: CommandOptions,
): ClientCliCommand | string => {
  if (action !== 'list') {
    return 'Unknown client command.';
  }

  return rest.length === 0
    ? { kind: 'client', client: { action }, ...options }
    : 'client list takes no arguments.';
};

const parseVersionCommand = (
  positionals: string[],
  socket: string | undefined,
  json: boolean,
): VersionCommand | string => {
  const hasExtra = positionals.length > 0 || socket !== undefined;

  return hasExtra ? '--version takes only --json.' : { kind: 'version', json };
};

const parseDefaultCommand = (options: CommandOptions): DefaultCommand | string =>
  options.json ? 'phi takes only --socket.' : { kind: 'default', socket: options.socket };

const isSessionGroup = (group: string | undefined): group is 'attach' | 'detach' =>
  group === 'attach' || group === 'detach';

const parseSessionCommand = (
  group: 'attach' | 'detach',
  positionals: string[],
  options: CommandOptions,
  client: string | undefined,
): AttachCommand | DetachCommand | string =>
  group === 'attach'
    ? parseAttachCommand(positionals, options)
    : parseDetachCommand(positionals, options, client);

const parseServerCommand = ({ action, rest, options }: GroupInput): ServerCommand | string => {
  if (!isServerAction(action)) {
    return 'Unknown command.';
  }

  if (rest.length > 0) {
    return `Unexpected argument '${rest.join(' ')}'.`;
  }

  return { kind: 'server', action, ...options };
};

const parseGroupCommand = (group: string | undefined, input: GroupInput): Command | string => {
  if (group === 'workspace') {
    const workspace = parseWorkspaceCommand(
      input.action,
      input.rest,
      input.label,
      input.background,
    );

    return typeof workspace === 'string'
      ? workspace
      : { kind: 'workspace', workspace, ...input.options };
  }

  if (group === 'tab') {
    const tab = parseTabCommand(input.action, input.rest, input.workspace, input.cwd);

    return typeof tab === 'string' ? tab : { kind: 'tab', tab, ...input.options };
  }

  if (group === 'pane') {
    const pane = parsePaneCommand(input.action, input.rest, input.pane, {
      direction: input.direction,
      cells: input.cells,
      cwd: input.cwd,
      read: input.read,
    });

    return typeof pane === 'string' ? pane : { kind: 'pane', pane, ...input.options };
  }

  if (group === 'client') {
    return parseClientCommand(input.action, input.rest, input.options);
  }

  return group === 'server' ? parseServerCommand(input) : 'Unknown command.';
};

const strayFolderOptionMessage = (
  group: string | undefined,
  cwd: string | undefined,
): string | undefined => {
  const takesFolder = group === 'pane' || group === 'tab';

  return cwd === undefined || takesFolder
    ? undefined
    : '--cwd belongs to pane split and tab create.';
};

const strayPaneOptionMessage = ({
  pane,
  direction,
  cells,
  ...read
}: Pick<StrayOptions, 'pane' | 'direction' | 'cells'> & Partial<RawReadOptions>):
  | string
  | undefined => {
  if (direction !== undefined) {
    return '--direction belongs to pane split and pane resize.';
  }

  if (cells !== undefined) {
    return '--cells belongs to pane resize.';
  }

  if (hasReadOptions(read)) {
    return '--source, --lines, --from, and --to belong to pane read.';
  }

  return pane === undefined ? undefined : '--pane belongs to pane read and pane send.';
};

const strayOptionMessage = (
  group: string | undefined,
  { label, background, workspace, client, cwd, ...paneOptions }: StrayOptions,
): string | undefined => {
  const paneStray = group === 'pane' ? undefined : strayPaneOptionMessage(paneOptions);

  if (paneStray !== undefined) {
    return paneStray;
  }

  const folderStray = strayFolderOptionMessage(group, cwd);

  if (folderStray !== undefined) {
    return folderStray;
  }

  if (label !== undefined && group !== 'workspace') {
    return '--label belongs to workspace create.';
  }

  if (background === true && group !== 'workspace') {
    return '--background belongs to workspace create.';
  }

  if (workspace !== undefined && group !== 'tab') {
    return '--workspace belongs to tab create.';
  }

  return client !== undefined && group !== 'detach' ? '--client belongs to detach.' : undefined;
};

export const parseCommand = (argv: string[]): Command | string => {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        version: { type: 'boolean' },
        json: { type: 'boolean' },
        socket: { type: 'string' },
        label: { type: 'string' },
        background: { type: 'boolean' },
        pane: { type: 'string' },
        workspace: { type: 'string' },
        direction: { type: 'string' },
        cells: { type: 'string' },
        client: { type: 'string' },
        cwd: { type: 'string' },
        source: { type: 'string' },
        lines: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    });

    const json = values.json === true;
    const options = { json, socket: values.socket };
    const [group, action, ...rest] = positionals;
    const stray = strayOptionMessage(group, values);

    if (stray !== undefined) {
      return stray;
    }

    if (values.version === true) {
      return parseVersionCommand(positionals, values.socket, json);
    }

    if (positionals.length === 0) {
      return parseDefaultCommand(options);
    }

    if (isSessionGroup(group)) {
      return parseSessionCommand(group, positionals, options, values.client);
    }

    return parseGroupCommand(group, {
      action,
      rest,
      label: values.label,
      background: values.background === true,
      pane: values.pane,
      workspace: values.workspace,
      direction: values.direction,
      cells: values.cells,
      cwd: values.cwd,
      read: {
        source: values.source,
        lines: values.lines,
        from: values.from,
        to: values.to,
      },
      options,
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
