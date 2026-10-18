import type {
  PaneCopyCommand,
  PaneLayoutCommand,
  PaneMoveDestination,
  PaneReadCommand,
  PaneScrollCommand,
  PaneSendCommand,
} from '../client/client.ts';
import { paneId, tabId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import { parseId } from './idParse.ts';
import type { IdResult } from './idParse.ts';
import { parsePaneCopy } from './paneCopyParse.ts';
import { hasReadOptions, parseReadOptions } from './paneReadOptions.ts';
import type { RawReadOptions } from './paneReadOptions.ts';
import { parsePaneScroll } from './paneScrollParse.ts';

type SplitDirection = Extract<PaneLayoutCommand, { action: 'split' }>['direction'];

type ResizeDirection = Extract<PaneLayoutCommand, { action: 'resize' }>['direction'];

type PaneCliAction =
  | PaneReadCommand
  | PaneSendCommand
  | PaneLayoutCommand
  | PaneScrollCommand
  | PaneCopyCommand
  | { action: 'list' }
  | { action: 'process-info'; pane: PaneId };

export interface PaneCliCommand extends CommandOptions {
  kind: 'pane';
  pane: PaneCliAction;
}

export interface RawPaneOptions extends Partial<RawReadOptions> {
  pane?: string | undefined;
  client?: string | undefined;
  print?: boolean | undefined;
  direction?: string | undefined;
  cells?: string | undefined;
  cwd?: string | undefined;
  tab?: string | undefined;
  'new-tab'?: boolean | undefined;
  'new-workspace'?: boolean | undefined;
}

interface MoveOptions {
  tab: string | undefined;
  newTab: boolean | undefined;
  newWorkspace: boolean | undefined;
}

interface LayoutOptions {
  direction: string | undefined;
  cells: string | undefined;
  cwd: string | undefined;
}

interface PaneOptions extends LayoutOptions {
  client: string | undefined;
  print: boolean | undefined;
  read: RawReadOptions;
  move: MoveOptions;
}

export const paneOptions = {
  pane: { type: 'string' },
  direction: { type: 'string' },
  cells: { type: 'string' },
  cwd: { type: 'string' },
  print: { type: 'boolean' },
  tab: { type: 'string' },
  'new-tab': { type: 'boolean' },
  'new-workspace': { type: 'boolean' },
  source: { type: 'string' },
  lines: { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
} as const;

export const paneUsage = `  phi pane list [--socket <path>] [--json]
  phi pane read <id> [--source visible|recent|recent-unwrapped] [--lines <n>]
    [--from <row> --to <row>] [--socket <path>] [--json]
  phi pane send <text> [--pane <id>] [--socket <path>] [--json]
  phi pane split <id> --direction below|right [--cwd <dir>] [--socket <path>] [--json]
  phi pane move <id> --tab <id> | --new-tab | --new-workspace [--socket <path>] [--json]
  phi pane focus <id> [--socket <path>] [--json]
  phi pane close <id> [--socket <path>] [--json]
  phi pane zoom <id> [--socket <path>] [--json]
  phi pane resize <id> --direction left|right|up|down --cells <n> [--socket <path>] [--json]
  phi pane scroll <id> --to top|bottom|<row> [--client <id>] [--socket <path>] [--json]
  phi pane copy <id> --from <row>:<col> --to <row>:<col> [--print] [--socket <path>] [--json]
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

const printMessage = '--print belongs to pane copy.';

const moveOptionsMessage = '--tab, --new-tab, and --new-workspace belong to pane move.';

const hasMoveOptions = ({ tab, newTab, newWorkspace }: MoveOptions): boolean =>
  tab !== undefined || newTab !== undefined || newWorkspace !== undefined;

export const strayPaneOptionMessage = (
  group: string | undefined,
  {
    pane,
    print,
    direction,
    cells,
    tab,
    'new-tab': newTab,
    'new-workspace': newWorkspace,
    ...read
  }: RawPaneOptions,
): string | undefined => {
  if (group === 'pane') {
    return undefined;
  }

  if (print !== undefined) {
    return printMessage;
  }

  if (hasMoveOptions({ tab, newTab, newWorkspace })) {
    return moveOptionsMessage;
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

  return pane === undefined ? undefined : '--pane belongs to pane send.';
};

const parseSplitDirection = (value: string | undefined): SplitDirection | undefined =>
  value === 'below' || value === 'right' ? value : undefined;

const resizeDirections: readonly ResizeDirection[] = ['left', 'right', 'up', 'down'];

const parseResizeDirection = (value: string | undefined): ResizeDirection | undefined =>
  resizeDirections.find((direction) => direction === value);

const parseCells = (value: string | undefined): number | undefined => {
  // Stryker disable next-line ConditionalExpression: The check is needed for the type of `value`.
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

const moveDestinationOf = ({
  tab,
  newTab,
  newWorkspace,
}: MoveOptions): PaneMoveDestination | string => {
  const chosen = [tab !== undefined, newTab === true, newWorkspace === true].filter(Boolean);

  if (chosen.length === 0) {
    return 'pane move takes one of --tab, --new-tab, or --new-workspace.';
  }

  if (chosen.length > 1) {
    return 'pane move takes only one of --tab, --new-tab, or --new-workspace.';
  }

  if (tab === undefined) {
    return newTab === true ? { kind: 'newTab' } : { kind: 'newWorkspace' };
  }

  const number = parseId(tab, 'tab');

  return number === undefined
    ? `'${tab}' is not a tab id, such as tab-1.`
    : { kind: 'tab', tabId: tabId(number) };
};

const parseMoveCommand = (
  rest: string[],
  pane: string | undefined,
  options: PaneOptions,
): PaneLayoutCommand | string => {
  if (pane !== undefined) {
    return '--pane belongs to pane read and pane send.';
  }

  if (rest.length !== 1) {
    return 'pane move takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  if (target === undefined) {
    return `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`;
  }

  if (options.direction !== undefined) {
    return '--direction belongs to pane split and pane resize.';
  }

  if (options.cells !== undefined) {
    return '--cells belongs to pane resize.';
  }

  if (options.cwd !== undefined) {
    return '--cwd belongs to pane split and tab create.';
  }

  const destination = moveDestinationOf(options.move);

  return typeof destination === 'string'
    ? destination
    : { action: 'move', pane: paneId(target), destination };
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
    return '--pane belongs to pane send.';
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
  pane: string | undefined,
  read: RawReadOptions,
): PaneReadCommand | string => {
  if (pane !== undefined) {
    return '--pane belongs to pane send. pane read takes the pane id as an argument.';
  }

  if (rest.length !== 1) {
    return 'pane read takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  if (target === undefined) {
    return `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`;
  }

  const options = parseReadOptions(read);

  return typeof options === 'string'
    ? options
    : { action: 'read', pane: paneId(target), ...options };
};

const parsePaneSend = (rest: string[], pane: PaneId | undefined): PaneSendCommand | string => {
  return rest.length === 1
    ? { action: 'send', text: rest[0] ?? '', pane }
    : 'pane send takes one text argument.';
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

  if (action === 'read') {
    return parsePaneRead(rest, pane, read);
  }

  if (action !== 'send') {
    return 'Unknown pane command.';
  }

  const target = parsePaneId(pane);

  if (!target.ok) {
    return target.message;
  }

  return parsePaneSend(rest, target.id);
};

const strayReadFlagMessage = ({ source, lines, from, to }: RawReadOptions): string | undefined => {
  const flags = { '--source': source, '--lines': lines, '--from': from, '--to': to };
  const stray = Object.entries(flags).find(([, value]) => value !== undefined);

  return stray === undefined ? undefined : `${stray[0]} belongs to pane read.`;
};

// pane scroll takes its position in --to, and pane copy takes its range in --from and --to.
const strayReadMessage = (action: string | undefined, read: RawReadOptions): string | undefined => {
  if (action === 'read') {
    return undefined;
  }

  if (action === 'copy') {
    return strayReadFlagMessage({ ...read, from: undefined, to: undefined });
  }

  return strayReadFlagMessage(action === 'scroll' ? { ...read, to: undefined } : read);
};

const strayFlagMessage = (action: string | undefined, options: PaneOptions): string | undefined =>
  options.print !== undefined && action !== 'copy'
    ? printMessage
    : strayReadMessage(action, options.read);

const parsePaneAction = (
  action: string | undefined,
  rest: string[],
  pane: string | undefined,
  options: PaneOptions,
): PaneCliAction | string => {
  const stray = strayFlagMessage(action, options);

  if (stray !== undefined) {
    return stray;
  }

  if (action === 'move') {
    return parseMoveCommand(rest, pane, options);
  }

  if (hasMoveOptions(options.move)) {
    return moveOptionsMessage;
  }

  if (isPaneLayoutAction(action)) {
    return pane === undefined
      ? parsePaneLayoutCommand(action, rest, options)
      : '--pane belongs to pane send.';
  }

  if (options.direction !== undefined) {
    return '--direction belongs to pane split and pane resize.';
  }

  if (options.cwd !== undefined) {
    return '--cwd belongs to pane split and tab create.';
  }

  if (options.cells !== undefined) {
    return '--cells belongs to pane resize.';
  }

  if (action === 'copy') {
    const { from, to } = options.read;

    return parsePaneCopy(rest, pane, from, to, options.print === true);
  }

  if (action === 'process-info') {
    return parseProcessInfoCommand(rest, pane);
  }

  if (action === 'scroll') {
    return parsePaneScroll(rest, pane, options.read.to, options.client);
  }

  return parsePaneTargetCommand(action, rest, pane, options.read);
};

const textByDefaultActions: ReadonlySet<string> = new Set(['read', 'send', 'copy']);

const printsJsonByDefault = (action: string): boolean => !textByDefaultActions.has(action);

export const parsePaneCommand = (
  action: string | undefined,
  rest: string[],
  {
    pane,
    client,
    print,
    direction,
    cells,
    cwd,
    tab,
    'new-tab': newTab,
    'new-workspace': newWorkspace,
    source,
    lines,
    from,
    to,
  }: RawPaneOptions,
  options: CommandOptions,
): PaneCliCommand | string => {
  if (client !== undefined && action !== 'scroll') {
    return '--client belongs to detach and pane scroll.';
  }

  const parsed = parsePaneAction(action, rest, pane, {
    direction,
    cells,
    cwd,
    client,
    print,
    read: { source, lines, from, to },
    move: { tab, newTab, newWorkspace },
  });

  if (typeof parsed === 'string') {
    return parsed;
  }

  const json = options.json || printsJsonByDefault(parsed.action);

  return { kind: 'pane', pane: parsed, ...options, json };
};
