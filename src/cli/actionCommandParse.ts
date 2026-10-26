import { actionCatalog } from '../actions.ts';
import type { ActionEntry } from '../actions.ts';
import { paneId } from '../ids.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import type { CommandOptions } from './commandOptions.ts';
import { parseId, parseWorkspaceId } from './idParse.ts';
import type { IdResult } from './idParse.ts';

export type ActionCliAction =
  | { action: 'list' }
  | {
      action: 'run';
      entry: ActionEntry;
      pane: PaneId | undefined;
      workspace: WorkspaceId | undefined;
    };

export interface ActionCliCommand extends CommandOptions {
  kind: 'action';
  action: ActionCliAction;
}

interface RawActionOptions {
  pane?: string | undefined;
  workspace?: string | undefined;
}

export const actionUsage = `  koja action list [--socket <path>] [--json]
  koja action run <id> [--pane <id>] [--workspace <id>] [--socket <path>] [--json]`;

const findEntry = (id: string): ActionEntry | undefined =>
  actionCatalog.find((entry) => entry.id === id);

const parseOptionalPane = (value: string | undefined): IdResult<PaneId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  const number = parseId(value, 'pane');

  return number === undefined
    ? { ok: false, message: `'${value}' is not a pane id, such as pane-1.` }
    : { ok: true, id: paneId(number) };
};

const parseOptionalWorkspace = (value: string | undefined): IdResult<WorkspaceId | undefined> => {
  if (value === undefined) {
    return { ok: true, id: undefined };
  }

  return parseWorkspaceId(value);
};

const acceptsPane = (entry: ActionEntry): boolean => entry.intent.kind === 'pane';

const acceptsWorkspace = (entry: ActionEntry): boolean =>
  entry.intent.kind === 'workspace' || entry.intent.kind === 'tab';

const createsWorkspace = (entry: ActionEntry): boolean =>
  entry.intent.kind === 'workspace' && entry.intent.key === 'create';

const targetRefusalOf = (
  entry: ActionEntry,
  pane: string | undefined,
  workspace: string | undefined,
): string | undefined => {
  if (pane !== undefined && !acceptsPane(entry)) {
    return '--pane applies only to pane.* actions.';
  }

  if (workspace !== undefined && !acceptsWorkspace(entry)) {
    return '--workspace applies only to workspace.* and tab.* actions.';
  }

  if (workspace !== undefined && createsWorkspace(entry)) {
    return 'workspace.create makes a new workspace, so it takes no --workspace.';
  }

  return undefined;
};

const parseRunCommand = (rest: string[], raw: RawActionOptions): ActionCliAction | string => {
  if (rest.length !== 1) {
    return 'action run takes one action id.';
  }

  const id = rest[0] ?? '';
  const entry = findEntry(id);

  if (entry === undefined) {
    return `'${id}' is not an action id. Run koja action list to see them.`;
  }

  const refusal = targetRefusalOf(entry, raw.pane, raw.workspace);

  if (refusal !== undefined) {
    return refusal;
  }

  const pane = parseOptionalPane(raw.pane);

  if (!pane.ok) {
    return pane.message;
  }

  const workspace = parseOptionalWorkspace(raw.workspace);

  if (!workspace.ok) {
    return workspace.message;
  }

  return { action: 'run', entry, pane: pane.id, workspace: workspace.id };
};

const parseActionAction = (
  action: string | undefined,
  rest: string[],
  raw: RawActionOptions,
): ActionCliAction | string => {
  if (action === 'list') {
    return rest.length === 0 ? { action } : 'action list takes no arguments.';
  }

  return action === 'run' ? parseRunCommand(rest, raw) : 'Unknown action command.';
};

export const parseActionCommand = (
  action: string | undefined,
  rest: string[],
  raw: RawActionOptions,
  options: CommandOptions,
): ActionCliCommand | string => {
  const parsed = parseActionAction(action, rest, raw);

  return typeof parsed === 'string' ? parsed : { kind: 'action', action: parsed, ...options };
};
