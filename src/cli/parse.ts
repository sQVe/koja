import { parseArgs } from 'node:util';

import {
  clientOptions,
  clientUsage,
  parseAttachCommand,
  parseClientCommand,
  parseDetachCommand,
} from './clientCommandParse.ts';
import type {
  AttachCommand,
  ClientCliCommand,
  DetachCommand,
  RawClientOptions,
} from './clientCommandParse.ts';
import { strayOptionMessage } from './commandOptions.ts';
import type { CommandOptions } from './commandOptions.ts';
import { paneOptions, paneUsage, parsePaneCommand } from './paneCommandParse.ts';
import type { PaneCliCommand, RawPaneOptions } from './paneCommandParse.ts';
import { parseServerCommand, serverUsage } from './serverCommandParse.ts';
import type { ServerCommand } from './serverCommandParse.ts';
import { parseTabCommand, tabOptions, tabUsage } from './tabCommandParse.ts';
import type { RawTabOptions, TabCliCommand } from './tabCommandParse.ts';
import {
  lastFocusFlag,
  parseWorkspaceCommand,
  workspaceOptions,
  workspaceUsage,
} from './workspaceCommandParse.ts';
import type { RawWorkspaceOptions, WorkspaceCliCommand } from './workspaceCommandParse.ts';

type RawOptions = RawPaneOptions & RawWorkspaceOptions & RawTabOptions & RawClientOptions;

interface GroupInput {
  action: string | undefined;
  rest: string[];
  positionals: string[];
  values: RawOptions;
  options: CommandOptions;
}

export interface VersionCommand {
  kind: 'version';
  json: boolean;
}

export interface DefaultCommand {
  kind: 'default';
  socket: string | undefined;
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

export const usage = `Usage:
  koja [--socket <path>]
  koja --version [--json]
${clientUsage}
${serverUsage}
${workspaceUsage}
${tabUsage}
${paneUsage}`;

const parseVersionCommand = (
  positionals: string[],
  socket: string | undefined,
  json: boolean,
): VersionCommand | string => {
  const hasExtra = positionals.length > 0 || socket !== undefined;

  return hasExtra ? '--version takes only --json.' : { kind: 'version', json };
};

const parseDefaultCommand = (options: CommandOptions): DefaultCommand | string =>
  options.json ? 'koja takes only --socket.' : { kind: 'default', socket: options.socket };

const parseSessionCommand = ({ positionals, values, options }: GroupInput, group: string) =>
  group === 'attach'
    ? parseAttachCommand(positionals, options)
    : parseDetachCommand(positionals, options, values);

const parseGroupCommand = (group: string | undefined, input: GroupInput): Command | string => {
  const { action, rest, values, options } = input;

  if (group === 'attach' || group === 'detach') {
    return parseSessionCommand(input, group);
  }

  if (group === 'workspace') {
    return parseWorkspaceCommand(action, rest, values, options);
  }

  if (group === 'tab') {
    return parseTabCommand(action, rest, values, options);
  }

  if (group === 'pane') {
    return parsePaneCommand(action, rest, values, options);
  }

  if (group === 'client') {
    return parseClientCommand(action, rest, options);
  }

  return group === 'server' ? parseServerCommand(action, rest, options) : 'Unknown command.';
};

const commandNameOf = (version: boolean, positionals: string[]): string => {
  const [group, action] = positionals;

  if (version) {
    return 'koja --version';
  }

  if (group === undefined) {
    return 'koja';
  }

  const takesAction = group !== 'attach' && group !== 'detach';

  return takesAction ? `${group} ${action ?? ''}`.trim() : group;
};

export const parseCommand = (argv: string[]): Command | string => {
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        version: { type: 'boolean' },
        json: { type: 'boolean' },
        socket: { type: 'string' },
        ...workspaceOptions,
        ...paneOptions,
        ...tabOptions,
        ...clientOptions,
      },
      allowPositionals: true,
      strict: true,
      tokens: true,
    });

    const values = { ...parsed.values, focus: lastFocusFlag(parsed.tokens) };
    const { positionals } = parsed;
    const json = values.json === true;
    const options = { json, socket: values.socket };
    const [group, action, ...rest] = positionals;
    const commandName = commandNameOf(values.version === true, positionals);
    const stray = strayOptionMessage(commandName, Object.keys(parsed.values));

    if (stray !== undefined) {
      return stray;
    }

    if (values.version === true) {
      return parseVersionCommand(positionals, values.socket, json);
    }

    if (positionals.length === 0) {
      return parseDefaultCommand(options);
    }

    return parseGroupCommand(group, { action, rest, values, positionals, options });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
