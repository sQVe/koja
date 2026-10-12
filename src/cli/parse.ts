import { parseArgs } from 'node:util';

import type { PaneCommand, PaneLayoutCommand } from '../client/client.ts';
import { paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId, TabId, WorkspaceId } from '../ids.ts';

type SplitDirection = Extract<PaneLayoutCommand, { action: 'split' }>['direction'];

interface CommandOptions {
  json: boolean;
  socket: string | undefined;
}

export interface VersionCommand {
  kind: 'version';
  json: boolean;
}

type PaneCliAction = PaneCommand | PaneLayoutCommand | { action: 'list' };

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
  | { action: 'create'; workspaceId: WorkspaceId | undefined }
  | { action: 'focus'; tabId: TabId }
  | { action: 'close'; tabId: TabId };

export interface TabCliCommand extends CommandOptions {
  kind: 'tab';
  tab: TabAction;
}

export interface ServerCommand extends CommandOptions {
  kind: 'server';
  action: ServerAction;
}

interface StrayOptions {
  label?: string;
  background?: boolean;
  pane?: string;
  workspace?: string;
  direction?: string;
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
}

export type Command =
  | VersionCommand
  | PaneCliCommand
  | WorkspaceCliCommand
  | TabCliCommand
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
  options: CommandOptions;
}

type IdResult<Id> = { ok: true; id: Id } | { ok: false; message: string };

const serverActions = ['run', 'start', 'stop'] as const;

type ServerAction = (typeof serverActions)[number];

export const usage = `Usage:
  phi [--socket <path>]
  phi --version [--json]
  phi attach [--socket <path>]
  phi detach [--socket <path>] [--json]
  phi server run [--socket <path>] [--json]
  phi server start [--socket <path>] [--json]
  phi server stop [--socket <path>] [--json]
  phi workspace list [--socket <path>] [--json]
  phi workspace create <dir> [--label <label>] [--background] [--socket <path>] [--json]
  phi workspace focus <id> [--socket <path>] [--json]
  phi workspace rename <id> <label> [--socket <path>] [--json]
  phi workspace close <id> [--socket <path>] [--json]
  phi tab list [--socket <path>] [--json]
  phi tab create [--workspace <id>] [--socket <path>] [--json]
  phi tab focus <id> [--socket <path>] [--json]
  phi tab close <id> [--socket <path>] [--json]
  phi pane list [--socket <path>] [--json]
  phi pane read [--pane <id>] [--socket <path>] [--json]
  phi pane send <text> [--pane <id>] [--socket <path>] [--json]
  phi pane split <id> --direction below|right [--socket <path>] [--json]
  phi pane focus <id> [--socket <path>] [--json]
  phi pane close <id> [--socket <path>] [--json]`;

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

const parsePaneId = (value: string | undefined): IdResult<PaneId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  const number = parseId(value, 'pane');

  return number === undefined
    ? { ok: false, message: `'${value}' is not a pane id, such as pane-1.` }
    : { ok: true, id: paneId(number) };
};

const parseDirection = (value: string | undefined): SplitDirection | undefined =>
  value === 'below' || value === 'right' ? value : undefined;

const parsePaneLayoutCommand = (
  action: 'split' | 'focus' | 'close',
  rest: string[],
  direction: string | undefined,
): PaneLayoutCommand | string => {
  if (rest.length !== 1) {
    return `pane ${action} takes one pane id.`;
  }

  const target = parseId(rest[0] ?? '', 'pane');

  if (target === undefined) {
    return `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`;
  }

  if (action !== 'split') {
    return direction === undefined
      ? { action, pane: paneId(target) }
      : '--direction belongs to pane split.';
  }

  const parsed = parseDirection(direction);

  return parsed === undefined
    ? 'pane split takes --direction below or --direction right.'
    : { action, pane: paneId(target), direction: parsed };
};

const isPaneLayoutAction = (action: string | undefined): action is 'split' | 'focus' | 'close' =>
  action === 'split' || action === 'focus' || action === 'close';

const parsePaneTargetCommand = (
  action: string | undefined,
  rest: string[],
  pane: string | undefined,
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

  if (action === 'read' && rest.length === 0) {
    return { action, pane: target.id };
  }

  if (action === 'send' && rest.length === 1) {
    return { action, text: rest[0] ?? '', pane: target.id };
  }

  return 'pane read takes no text; pane send takes one text argument.';
};

const parsePaneCommand = (
  action: string | undefined,
  rest: string[],
  pane: string | undefined,
  direction: string | undefined,
): PaneCliAction | string => {
  if (isPaneLayoutAction(action)) {
    return pane === undefined
      ? parsePaneLayoutCommand(action, rest, direction)
      : '--pane belongs to pane read and pane send.';
  }

  return direction === undefined
    ? parsePaneTargetCommand(action, rest, pane)
    : '--direction belongs to pane split.';
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

const parseTabCreate = (rest: string[], workspace: string | undefined): TabAction | string => {
  if (rest.length > 0) {
    return 'tab create takes no arguments.';
  }

  if (workspace === undefined) {
    return { action: 'create', workspaceId: undefined };
  }

  const id = parseWorkspaceId(workspace);

  return id.ok ? { action: 'create', workspaceId: id.id } : id.message;
};

const parseTabCommand = (
  action: string | undefined,
  rest: string[],
  workspace: string | undefined,
): TabAction | string => {
  if (action === 'create') {
    return parseTabCreate(rest, workspace);
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
): DetachCommand | string => {
  if (positionals.length !== 1) {
    return 'detach takes only --socket and --json.';
  }

  return { kind: 'detach', ...options };
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
): AttachCommand | DetachCommand | string =>
  group === 'attach'
    ? parseAttachCommand(positionals, options)
    : parseDetachCommand(positionals, options);

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
    const tab = parseTabCommand(input.action, input.rest, input.workspace);

    return typeof tab === 'string' ? tab : { kind: 'tab', tab, ...input.options };
  }

  if (group === 'pane') {
    const pane = parsePaneCommand(input.action, input.rest, input.pane, input.direction);

    return typeof pane === 'string' ? pane : { kind: 'pane', pane, ...input.options };
  }

  return group === 'server' ? parseServerCommand(input) : 'Unknown command.';
};

const strayOptionMessage = (
  group: string | undefined,
  { label, background, pane, workspace, direction }: StrayOptions,
): string | undefined => {
  if (direction !== undefined && group !== 'pane') {
    return '--direction belongs to pane split.';
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

  return pane !== undefined && group !== 'pane'
    ? '--pane belongs to pane read and pane send.'
    : undefined;
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
      return parseSessionCommand(group, positionals, options);
    }

    return parseGroupCommand(group, {
      action,
      rest,
      label: values.label,
      background: values.background === true,
      pane: values.pane,
      workspace: values.workspace,
      direction: values.direction,
      options,
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
