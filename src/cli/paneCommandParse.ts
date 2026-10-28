import type {
  PaneCopyCommand,
  PaneLayoutCommand,
  PaneMoveDestination,
  PanePasteCommand,
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
import { parseReadOptions } from './paneReadOptions.ts';
import type { RawReadOptions } from './paneReadOptions.ts';
import { parsePaneScroll } from './paneScrollParse.ts';

type SplitDirection = Extract<PaneLayoutCommand, { action: 'split' }>['direction'];

type ResizeDirection = Extract<PaneLayoutCommand, { action: 'resize' }>['direction'];

type PaneLayoutAction = 'split' | 'add' | 'focus' | 'close' | 'zoom' | 'resize';

type PaneCliAction =
  | PaneReadCommand
  | PaneSendCommand
  | PanePasteCommand
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
  authorize?: string | undefined;
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
  authorize: string | undefined;
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
  authorize: { type: 'string' },
} as const;

export const paneUsage = `  koja pane list [--socket <path>] [--json]
  koja pane read <id> [--source visible|recent|recent-unwrapped] [--lines <n>]
    [--from <row> --to <row>] [--socket <path>] [--json]
  koja pane send <text> [--pane <id>] [--socket <path>] [--json]
  koja pane paste <text> [--pane <id>] [--authorize <token>] [--socket <path>] [--json]
  koja pane split <id> --direction below|right [--cwd <dir>] [--socket <path>] [--json]
  koja pane add <id> [--cwd <dir>] [--socket <path>] [--json]
  koja pane move <id> --tab <id> | --new-tab | --new-workspace [--socket <path>] [--json]
  koja pane focus <id> [--socket <path>] [--json]
  koja pane close <id> [--socket <path>] [--json]
  koja pane zoom <id> [--socket <path>] [--json]
  koja pane resize <id> --direction left|right|up|down --cells <n> [--socket <path>] [--json]
  koja pane scroll <id> --to top|bottom|<row> [--client <id>] [--socket <path>] [--json]
  koja pane copy <id> --from <row>:<col> --to <row>:<col> [--print] [--socket <path>] [--json]
  koja pane process-info <id> [--socket <path>] [--json]`;

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
  action: PaneLayoutAction,
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

  if (action === 'split') {
    return parseSplitCommand(paneId(target), direction, cwd);
  }

  if (action === 'add') {
    return cwd === '' ? 'The --cwd folder cannot be empty.' : { action, pane: paneId(target), cwd };
  }

  if (action === 'resize') {
    return parseResizeCommand(paneId(target), direction, cells);
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

const parseMoveCommand = (rest: string[], move: MoveOptions): PaneLayoutCommand | string => {
  if (rest.length !== 1) {
    return 'pane move takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  if (target === undefined) {
    return `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`;
  }

  const destination = moveDestinationOf(move);

  return typeof destination === 'string'
    ? destination
    : { action: 'move', pane: paneId(target), destination };
};

const paneLayoutActions: ReadonlySet<string | undefined> = new Set([
  'split',
  'add',
  'focus',
  'close',
  'zoom',
  'resize',
]);

const isPaneLayoutAction = (action: string | undefined): action is PaneLayoutAction =>
  paneLayoutActions.has(action);

const parseProcessInfoCommand = (rest: string[]): PaneCliAction | string => {
  if (rest.length !== 1) {
    return 'pane process-info takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  return target === undefined
    ? `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`
    : { action: 'process-info', pane: paneId(target) };
};

const parsePaneRead = (rest: string[], read: RawReadOptions): PaneReadCommand | string => {
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

const parsePanePaste = (
  rest: string[],
  pane: string | undefined,
  authorization: string | undefined,
): PanePasteCommand | string => {
  if (rest.length !== 1) {
    return 'pane paste takes one text argument.';
  }

  const target = parsePaneId(pane);

  return target.ok
    ? { action: 'paste', text: rest[0] ?? '', pane: target.id, authorization }
    : target.message;
};

const parsePaneTargetCommand = (
  action: string | undefined,
  rest: string[],
  pane: string | undefined,
  read: RawReadOptions,
): PaneCliAction | string => {
  if (action === 'list') {
    return rest.length === 0 ? { action } : 'pane list takes no arguments.';
  }

  if (action === 'read') {
    return parsePaneRead(rest, read);
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

const parsePaneAction = (
  action: string | undefined,
  rest: string[],
  pane: string | undefined,
  options: PaneOptions,
): PaneCliAction | string => {
  if (action === 'move') {
    return parseMoveCommand(rest, options.move);
  }

  if (isPaneLayoutAction(action)) {
    return parsePaneLayoutCommand(action, rest, options);
  }

  if (action === 'copy') {
    const { from, to } = options.read;

    return parsePaneCopy(rest, from, to, options.print === true);
  }

  if (action === 'process-info') {
    return parseProcessInfoCommand(rest);
  }

  if (action === 'paste') {
    return parsePanePaste(rest, pane, options.authorize);
  }

  if (action === 'scroll') {
    return parsePaneScroll(rest, options.read.to, options.client);
  }

  return parsePaneTargetCommand(action, rest, pane, options.read);
};

const textByDefaultActions: ReadonlySet<string> = new Set(['read', 'send', 'paste', 'copy']);

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
    authorize,
  }: RawPaneOptions,
  options: CommandOptions,
): PaneCliCommand | string => {
  const parsed = parsePaneAction(action, rest, pane, {
    direction,
    cells,
    cwd,
    client,
    print,
    authorize,
    read: { source, lines, from, to },
    move: { tab, newTab, newWorkspace },
  });

  if (typeof parsed === 'string') {
    return parsed;
  }

  const json = options.json || printsJsonByDefault(parsed.action);

  return { kind: 'pane', pane: parsed, ...options, json };
};
