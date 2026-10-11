import { parseArgs } from 'node:util';

import type { PaneCommand } from '../client/client.ts';

interface CommandOptions {
  json: boolean;
  socket: string | undefined;
}

export interface VersionCommand {
  kind: 'version';
  json: boolean;
}

export interface PaneCliCommand extends CommandOptions {
  kind: 'pane';
  pane: PaneCommand;
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
  | ServerCommand
  | AttachCommand
  | DefaultCommand
  | DetachCommand;

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
  phi pane read [--socket <path>] [--json]
  phi pane send <text> [--socket <path>] [--json]`;

const isServerAction = (action: string | undefined): action is ServerAction =>
  serverActions.some((serverAction) => serverAction === action);

const parsePaneCommand = (action: string | undefined, rest: string[]): PaneCommand | string => {
  if (action !== 'read' && action !== 'send') {
    return 'Unknown pane command.';
  }

  if (action === 'read' && rest.length === 0) {
    return { action };
  }

  if (action === 'send' && rest.length === 1) {
    return { action, text: rest[0] ?? '' };
  }

  return 'pane read takes no text; pane send takes one text argument.';
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

export const parseCommand = (argv: string[]): Command | string => {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        version: { type: 'boolean' },
        json: { type: 'boolean' },
        socket: { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    });

    const json = values.json === true;
    const [group, action, ...rest] = positionals;

    if (values.version === true) {
      return parseVersionCommand(positionals, values.socket, json);
    }

    if (positionals.length === 0) {
      return parseDefaultCommand({ json, socket: values.socket });
    }

    if (isSessionGroup(group)) {
      return parseSessionCommand(group, positionals, { json, socket: values.socket });
    }

    if (group === 'pane') {
      const pane = parsePaneCommand(action, rest);

      if (typeof pane === 'string') {
        return pane;
      }

      return { kind: 'pane', pane, json, socket: values.socket };
    }

    if (group !== 'server' || !isServerAction(action)) {
      return 'Unknown command.';
    }

    if (rest.length > 0) {
      return `Unexpected argument '${rest.join(' ')}'.`;
    }

    return { kind: 'server', action, json, socket: values.socket };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
