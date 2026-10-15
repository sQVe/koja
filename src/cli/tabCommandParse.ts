import { tabId } from '../ids.ts';
import type { TabId, WorkspaceId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import type { IdResult } from './idParse.ts';
import { parseId, parseWorkspaceId } from './idParse.ts';
import { strayFocusMessage } from './workspaceCommandParse.ts';

export type TabAction =
  | { action: 'list' }
  | {
      action: 'create';
      workspaceId: WorkspaceId | undefined;
      cwd: string | undefined;
      focus: boolean;
    }
  | { action: 'focus'; tabId: TabId }
  | { action: 'close'; tabId: TabId };

export interface TabCliCommand extends CommandOptions {
  kind: 'tab';
  tab: TabAction;
}

export interface RawTabOptions {
  workspace?: string | undefined;
  cwd?: string | undefined;
  focus?: boolean | undefined;
}

export const tabOptions = {
  workspace: { type: 'string' },
  cwd: { type: 'string' },
} as const;

export const tabUsage = `  phi tab list [--socket <path>] [--json]
  phi tab create [--workspace <id>] [--cwd <dir>] [--focus | --no-focus]
    [--socket <path>] [--json]
  phi tab focus <id> [--socket <path>] [--json]
  phi tab close <id> [--socket <path>] [--json]`;

const parseTabId = (value: string | undefined): IdResult<TabId> => {
  const number = parseId(value ?? '', 'tab');

  return number === undefined
    ? { ok: false, message: `'${value ?? ''}' is not a tab id, such as tab-1.` }
    : { ok: true, id: tabId(number) };
};

export const strayFolderOptionMessage = (
  group: string | undefined,
  { cwd }: RawTabOptions,
): string | undefined => {
  const takesFolder = group === 'pane' || group === 'tab';

  return cwd === undefined || takesFolder
    ? undefined
    : '--cwd belongs to pane split and tab create.';
};

export const strayTabOptionMessage = (
  group: string | undefined,
  { workspace }: RawTabOptions,
): string | undefined =>
  workspace !== undefined && group !== 'tab' ? '--workspace belongs to tab create.' : undefined;

const parseTabTarget = (action: 'focus' | 'close', rest: string[]): TabAction | string => {
  if (rest.length !== 1) {
    return `tab ${action} takes one tab id.`;
  }

  const id = parseTabId(rest[0]);

  return id.ok ? { action, tabId: id.id } : id.message;
};

const parseTabCreate = (
  rest: string[],
  workspace: string | undefined,
  cwd: string | undefined,
  focus: boolean,
): TabAction | string => {
  if (rest.length > 0) {
    return 'tab create takes no arguments.';
  }

  if (cwd === '') {
    return 'The --cwd folder cannot be empty.';
  }

  if (workspace === undefined) {
    return { action: 'create', workspaceId: undefined, cwd, focus };
  }

  const id = parseWorkspaceId(workspace);

  return id.ok ? { action: 'create', workspaceId: id.id, cwd, focus } : id.message;
};

const parseTabAction = (
  action: string | undefined,
  rest: string[],
  { workspace, cwd, focus }: RawTabOptions,
): TabAction | string => {
  if (action === 'create') {
    return parseTabCreate(rest, workspace, cwd, focus === true);
  }

  if (cwd !== undefined) {
    return '--cwd belongs to pane split and tab create.';
  }

  if (workspace !== undefined) {
    return '--workspace belongs to tab create.';
  }

  if (focus !== undefined) {
    return strayFocusMessage;
  }

  if (action === 'list') {
    return rest.length === 0 ? { action } : 'tab list takes no arguments.';
  }

  if (action === 'focus' || action === 'close') {
    return parseTabTarget(action, rest);
  }

  return 'Unknown tab command.';
};

export const parseTabCommand = (
  action: string | undefined,
  rest: string[],
  raw: RawTabOptions,
  options: CommandOptions,
): TabCliCommand | string => {
  const tab = parseTabAction(action, rest, raw);

  return typeof tab === 'string' ? tab : { kind: 'tab', tab, ...options };
};
