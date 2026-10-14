import { clientId } from '../ids.ts';
import type { ClientId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import type { IdResult } from './idParse.ts';
import { parseId } from './idParse.ts';

export interface ClientCliCommand extends CommandOptions {
  kind: 'client';
  client: { action: 'list' };
}

export interface AttachCommand {
  kind: 'attach';
  socket: string | undefined;
}

export interface DetachCommand extends CommandOptions {
  kind: 'detach';
  client: ClientId | undefined;
}

export interface RawClientOptions {
  client?: string | undefined;
}

export const clientOptions = {
  client: { type: 'string' },
} as const;

export const clientUsage = `  phi attach [--socket <path>]
  phi detach [--client <id>] [--socket <path>] [--json]
  phi client list [--socket <path>] [--json]`;

const parseClientId = (value: string | undefined): IdResult<ClientId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  const number = parseId(value, 'client');

  return number === undefined
    ? { ok: false, message: `'${value}' is not a client id, such as client-1.` }
    : { ok: true, id: clientId(number) };
};

export const strayClientOptionMessage = (
  group: string | undefined,
  { client }: RawClientOptions,
): string | undefined =>
  client !== undefined && group !== 'detach' ? '--client belongs to detach.' : undefined;

export const parseAttachCommand = (
  positionals: string[],
  options: CommandOptions,
): AttachCommand | string => {
  if (positionals.length !== 1 || options.json) {
    return 'attach takes only --socket.';
  }

  return { kind: 'attach', socket: options.socket };
};

export const parseDetachCommand = (
  positionals: string[],
  options: CommandOptions,
  { client }: RawClientOptions,
): DetachCommand | string => {
  if (positionals.length !== 1) {
    return 'detach takes only --client, --socket, and --json.';
  }

  const target = parseClientId(client);

  return target.ok ? { kind: 'detach', client: target.id, ...options } : target.message;
};

export const parseClientCommand = (
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
