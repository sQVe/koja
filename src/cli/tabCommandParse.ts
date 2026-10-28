import { tabId } from '../ids.ts';
import type { TabId, WorkspaceId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import type { IdResult } from './idParse.ts';
import { parseId, parseWorkspaceId } from './idParse.ts';

export type TabAction =
  | { action: 'list' }
  | {
      action: 'create';
      workspaceId: WorkspaceId | undefined;
      cwd: string | undefined;
      focus: boolean;
    }
  | { action: 'focus'; tabId: TabId }
  | { action: 'rename'; tabId: TabId; label: string }
  | { action: 'close'; tabId: TabId }
  | { action: 'layout'; tabId: TabId; choice: 'legacy' | 'master' };

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

export const tabUsage = `  koja tab list [--socket <path>] [--json]
  koja tab create [--workspace <id>] [--cwd <dir>] [--focus | --no-focus]
    [--socket <path>] [--json]
  koja tab focus <id> [--socket <path>] [--json]
  koja tab rename <id> <label> [--socket <path>] [--json]
  koja tab close <id> [--socket <path>] [--json]
  koja tab layout <id> master|legacy [--socket <path>] [--json]`;

const parseTabId = (value: string | undefined): IdResult<TabId> => {
  const number = parseId(value ?? '', 'tab');

  return number === undefined
    ? { ok: false, message: `'${value ?? ''}' is not a tab id, such as tab-1.` }
    : { ok: true, id: tabId(number) };
};

const parseTabTarget = (action: 'focus' | 'close', rest: string[]): TabAction | string => {
  if (rest.length !== 1) {
    return `tab ${action} takes one tab id.`;
  }

  const id = parseTabId(rest[0]);

  return id.ok ? { action, tabId: id.id } : id.message;
};

const parseTabRename = (rest: string[]): TabAction | string => {
  const [id, label] = rest;

  if (rest.length !== 2 || label === undefined) {
    return 'tab rename takes a tab id and a label.';
  }

  const target = parseTabId(id);

  if (label === '') {
    return 'The label cannot be empty.';
  }

  return target.ok ? { action: 'rename', tabId: target.id, label } : target.message;
};

const parseTabLayout = (rest: string[]): TabAction | string => {
  const [id, choice] = rest;

  if (rest.length !== 2) {
    return 'tab layout takes a tab id and master or legacy.';
  }

  if (choice !== 'master' && choice !== 'legacy') {
    return `'${choice ?? ''}' is not a layout. Use master or legacy.`;
  }

  const target = parseTabId(id);

  return target.ok ? { action: 'layout', tabId: target.id, choice } : target.message;
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

  if (action === 'list') {
    return rest.length === 0 ? { action } : 'tab list takes no arguments.';
  }

  if (action === 'rename') {
    return parseTabRename(rest);
  }

  if (action === 'layout') {
    return parseTabLayout(rest);
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

  return typeof tab === 'string' ? tab : { kind: 'tab', tab, ...options, json: true };
};
