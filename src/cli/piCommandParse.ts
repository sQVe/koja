import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import { parseId } from './idParse.ts';

type PiCliAction = { action: 'report' } | { action: 'status'; pane: PaneId };

export interface PiCliCommand extends CommandOptions {
  kind: 'pi';
  pi: PiCliAction;
}

export const piUsage = `  koja pi report [--socket <path>] [--json] < report.json
  koja pi status <id> [--socket <path>] [--json]`;

const parseStatus = (rest: string[]): PiCliAction | string => {
  if (rest.length !== 1) {
    return 'pi status takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  return target === undefined
    ? `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`
    : { action: 'status', pane: paneId(target) };
};

const parsePiAction = (action: string | undefined, rest: string[]): PiCliAction | string => {
  if (action === 'status') {
    return parseStatus(rest);
  }

  if (action !== 'report') {
    return 'Unknown command.';
  }

  return rest.length > 0
    ? 'pi report takes no arguments. It reads the report from stdin.'
    : { action: 'report' };
};

export const parsePiCommand = (
  action: string | undefined,
  rest: string[],
  options: CommandOptions,
): PiCliCommand | string => {
  const parsed = parsePiAction(action, rest);

  return typeof parsed === 'string' ? parsed : { kind: 'pi', pi: parsed, ...options };
};
