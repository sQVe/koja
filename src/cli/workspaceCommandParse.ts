import type { WorkspaceId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import { parseWorkspaceId } from './idParse.ts';

export type WorkspaceAction =
  | { action: 'list' }
  | { action: 'create'; directory: string; label: string | undefined; background: boolean }
  | { action: 'focus'; workspaceId: WorkspaceId }
  | { action: 'rename'; workspaceId: WorkspaceId; label: string }
  | { action: 'close'; workspaceId: WorkspaceId };

export interface WorkspaceCliCommand extends CommandOptions {
  kind: 'workspace';
  workspace: WorkspaceAction;
}

export interface RawWorkspaceOptions {
  label?: string | undefined;
  background?: boolean | undefined;
}

export const workspaceOptions = {
  label: { type: 'string' },
  background: { type: 'boolean' },
} as const;

export const workspaceUsage = `  phi workspace list [--socket <path>] [--json]
  phi workspace create <dir> [--label <label>] [--background] [--socket <path>] [--json]
  phi workspace focus <id> [--socket <path>] [--json]
  phi workspace rename <id> <label> [--socket <path>] [--json]
  phi workspace close <id> [--socket <path>] [--json]`;

export const strayWorkspaceOptionMessage = (
  group: string | undefined,
  { label, background }: RawWorkspaceOptions,
): string | undefined => {
  if (label !== undefined && group !== 'workspace') {
    return '--label belongs to workspace create.';
  }

  return background === true && group !== 'workspace'
    ? '--background belongs to workspace create.'
    : undefined;
};

const parseWorkspaceTarget = (
  action: 'focus' | 'close',
  rest: string[],
): WorkspaceAction | string => {
  if (rest.length !== 1) {
    return `workspace ${action} takes one workspace id.`;
  }

  const id = parseWorkspaceId(rest[0]);

  return id.ok ? { action, workspaceId: id.id } : id.message;
};

const parseWorkspaceRename = (rest: string[]): WorkspaceAction | string => {
  const [id, label] = rest;

  if (rest.length !== 2 || label === undefined) {
    return 'workspace rename takes a workspace id and a label.';
  }

  const target = parseWorkspaceId(id);

  if (label === '') {
    return 'The label cannot be empty.';
  }

  return target.ok ? { action: 'rename', workspaceId: target.id, label } : target.message;
};

const parseWorkspaceCreate = (
  rest: string[],
  label: string | undefined,
  background: boolean,
): WorkspaceAction | string => {
  const [directory] = rest;

  if (rest.length !== 1 || directory === undefined || directory === '') {
    return 'workspace create takes one directory.';
  }

  if (label === '') {
    return 'The label cannot be empty.';
  }

  return { action: 'create', directory, label, background };
};

const parseWorkspaceAction = (
  action: string | undefined,
  rest: string[],
  label: string | undefined,
  background: boolean,
): WorkspaceAction | string => {
  if (action === 'create') {
    return parseWorkspaceCreate(rest, label, background);
  }

  if (label !== undefined) {
    return '--label belongs to workspace create.';
  }

  if (background) {
    return '--background belongs to workspace create.';
  }

  if (action === 'list') {
    return rest.length === 0 ? { action } : 'workspace list takes no arguments.';
  }

  if (action === 'focus' || action === 'close') {
    return parseWorkspaceTarget(action, rest);
  }

  return action === 'rename' ? parseWorkspaceRename(rest) : 'Unknown workspace command.';
};

export const parseWorkspaceCommand = (
  action: string | undefined,
  rest: string[],
  { label, background }: RawWorkspaceOptions,
  options: CommandOptions,
): WorkspaceCliCommand | string => {
  const workspace = parseWorkspaceAction(action, rest, label, background === true);

  return typeof workspace === 'string' ? workspace : { kind: 'workspace', workspace, ...options };
};
