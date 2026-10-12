import { parseArgs } from 'node:util';

import type { PaneCommand } from '../client/client.ts';
import { paneId, workspaceId } from '../ids.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';

interface CommandOptions {
  json: boolean;
  socket: string | undefined;
}

export interface VersionCommand {
  kind: 'version';
  json: boolean;
}

type PaneCliAction = PaneCommand | { action: 'list' };

export interface PaneCliCommand extends CommandOptions {
  kind: 'pane';
  pane: PaneCliAction;
}

export type WorkspaceAction =
  | { action: 'list' }
  | { action: 'create'; directory: string; label: string | undefined }
  | { action: 'focus'; workspaceId: WorkspaceId }
  | { action: 'rename'; workspaceId: WorkspaceId; label: string }
  | { action: 'close'; workspaceId: WorkspaceId };

export interface WorkspaceCliCommand extends CommandOptions {
  kind: 'workspace';
  workspace: WorkspaceAction;
}

export interface ServerCommand extends CommandOptions {
  kind: 'server';
  action: ServerAction;
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
  | ServerCommand
  | AttachCommand
  | DefaultCommand
  | DetachCommand;

interface GroupInput {
  action: string | undefined;
  rest: string[];
  label: string | undefined;
  pane: string | undefined;
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
  phi workspace create <dir> [--label <label>] [--socket <path>] [--json]
  phi workspace focus <id> [--socket <path>] [--json]
  phi workspace rename <id> <label> [--socket <path>] [--json]
  phi workspace close <id> [--socket <path>] [--json]
  phi pane list [--socket <path>] [--json]
  phi pane read [--pane <id>] [--socket <path>] [--json]
  phi pane send <text> [--pane <id>] [--socket <path>] [--json]`;

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

const parsePaneId = (value: string | undefined): IdResult<PaneId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  const number = parseId(value, 'pane');

  return number === undefined
    ? { ok: false, message: `'${value}' is not a pane id, such as pane-1.` }
    : { ok: true, id: paneId(number) };
};

const parsePaneCommand = (
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
): WorkspaceAction | string => {
  const [directory] = rest;

  if (rest.length !== 1 || directory === undefined || directory === '') {
    return 'workspace create takes one directory.';
  }

  if (label === '') {
    return 'The label cannot be empty.';
  }

  return { action: 'create', directory, label };
};

const parseWorkspaceCommand = (
  action: string | undefined,
  rest: string[],
  label: string | undefined,
): WorkspaceAction | string => {
  if (action === 'create') {
    return parseWorkspaceCreate(rest, label);
  }

  if (label !== undefined) {
    return '--label belongs to workspace create.';
  }

  if (action === 'list') {
    return rest.length === 0 ? { action } : 'workspace list takes no arguments.';
  }

  if (action === 'focus' || action === 'close') {
    return parseWorkspaceTarget(action, rest);
  }

  return action === 'rename' ? parseWorkspaceRename(rest) : 'Unknown workspace command.';
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
    const workspace = parseWorkspaceCommand(input.action, input.rest, input.label);

    return typeof workspace === 'string'
      ? workspace
      : { kind: 'workspace', workspace, ...input.options };
  }

  if (group === 'pane') {
    const pane = parsePaneCommand(input.action, input.rest, input.pane);

    return typeof pane === 'string' ? pane : { kind: 'pane', pane, ...input.options };
  }

  return group === 'server' ? parseServerCommand(input) : 'Unknown command.';
};

const strayOptionMessage = (
  group: string | undefined,
  label: string | undefined,
  pane: string | undefined,
): string | undefined => {
  if (label !== undefined && group !== 'workspace') {
    return '--label belongs to workspace create.';
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
        pane: { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    });

    const json = values.json === true;
    const options = { json, socket: values.socket };
    const [group, action, ...rest] = positionals;
    const stray = strayOptionMessage(group, values.label, values.pane);

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
      pane: values.pane,
      options,
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
