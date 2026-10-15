import type { PaneLayoutCommand, PaneReadCommand, PaneSendCommand } from '../client/client.ts';
import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import { parseId } from './idParse.ts';
import type { IdResult } from './idParse.ts';
import { hasReadOptions, parseReadOptions } from './paneReadOptions.ts';
import type { RawReadOptions } from './paneReadOptions.ts';

type SplitDirection = Extract<PaneLayoutCommand, { action: 'split' }>['direction'];

type ResizeDirection = Extract<PaneLayoutCommand, { action: 'resize' }>['direction'];

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

export interface RawPaneOptions extends Partial<RawReadOptions> {
  pane?: string | undefined;
  direction?: string | undefined;
  cells?: string | undefined;
  cwd?: string | undefined;
}

interface LayoutOptions {
  direction: string | undefined;
  cells: string | undefined;
  cwd: string | undefined;
}

interface PaneOptions extends LayoutOptions {
  read: RawReadOptions;
}

export const paneOptions = {
  pane: { type: 'string' },
  direction: { type: 'string' },
  cells: { type: 'string' },
  cwd: { type: 'string' },
  source: { type: 'string' },
  lines: { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
} as const;

export const paneUsage = `  phi pane list [--socket <path>] [--json]
  phi pane read [--pane <id>] [--source visible|recent|recent-unwrapped] [--lines <n>]
    [--from <row> --to <row>] [--socket <path>] [--json]
  phi pane send <text> [--pane <id>] [--socket <path>] [--json]
  phi pane split <id> --direction below|right [--cwd <dir>] [--socket <path>] [--json]
  phi pane focus <id> [--socket <path>] [--json]
  phi pane close <id> [--socket <path>] [--json]
  phi pane zoom <id> [--socket <path>] [--json]
  phi pane resize <id> --direction left|right|up|down --cells <n> [--socket <path>] [--json]
  phi pane process-info <id> [--socket <path>] [--json]`;

const parsePaneId = (value: string | undefined): IdResult<PaneId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  const number = parseId(value, 'pane');

  return number === undefined
    ? { ok: false, message: `'${value}' is not a pane id, such as pane-1.` }
    : { ok: true, id: paneId(number) };
};

export const strayPaneOptionMessage = (
  group: string | undefined,
  { pane, direction, cells, ...read }: RawPaneOptions,
): string | undefined => {
  if (group === 'pane') {
    return undefined;
  }

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

const parsePaneAction = (
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

const textByDefaultActions: ReadonlySet<string> = new Set(['read', 'send']);

const printsJsonByDefault = (action: string): boolean => !textByDefaultActions.has(action);

export const parsePaneCommand = (
  action: string | undefined,
  rest: string[],
  { pane, direction, cells, cwd, source, lines, from, to }: RawPaneOptions,
  options: CommandOptions,
): PaneCliCommand | string => {
  const parsed = parsePaneAction(action, rest, pane, {
    direction,
    cells,
    cwd,
    read: { source, lines, from, to },
  });

  if (typeof parsed === 'string') {
    return parsed;
  }

  const json = options.json || printsJsonByDefault(parsed.action);

  return { kind: 'pane', pane: parsed, ...options, json };
};
