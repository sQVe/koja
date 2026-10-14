import type { CommandOptions } from './commandOptions.ts';

export interface ServerCommand extends CommandOptions {
  kind: 'server';
  action: ServerAction;
}

const serverActions = ['run', 'start', 'stop'] as const;

type ServerAction = (typeof serverActions)[number];

export const serverUsage = `  phi server run [--socket <path>] [--json]
  phi server start [--socket <path>] [--json]
  phi server stop [--socket <path>] [--json]`;

const isServerAction = (action: string | undefined): action is ServerAction =>
  serverActions.some((serverAction) => serverAction === action);

export const parseServerCommand = (
  action: string | undefined,
  rest: string[],
  options: CommandOptions,
): ServerCommand | string => {
  if (!isServerAction(action)) {
    return 'Unknown command.';
  }

  if (rest.length > 0) {
    return `Unexpected argument '${rest.join(' ')}'.`;
  }

  return { kind: 'server', action, ...options };
};
