import { actionCatalog, defaultTargetOf, paneCommandOf, workspaceNeighborOf } from '../actions.ts';
import type {
  ActionEntry,
  ActionIntent,
  ActionTarget,
  PaneAction,
  WorkspaceKey,
} from '../actions.ts';
import { activeTabIdOf, runSnapshot, tabToFocus } from '../client/client.ts';
import type { StoreSnapshot, TabRoute } from '../client/client.ts';
import { invariant } from '../invariant.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import type { ActionCliAction, ActionCliCommand } from './actionCommandParse.ts';
import type { CommandOptions } from './commandOptions.ts';
import { runDetachCommand } from './detachCommand.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { connectionFailureMessage, print } from './output.ts';
import type { Outcome } from './output.ts';
import { runPaneAction } from './paneCommands.ts';
import type { TabAction } from './tabCommandParse.ts';
import { runTabAction } from './tabCommands.ts';
import type { WorkspaceAction } from './workspaceCommandParse.ts';
import { runWorkspaceAction } from './workspaceCommands.ts';

type RunAction = Extract<ActionCliAction, { action: 'run' }>;

type LayoutChoice = Extract<ActionIntent, { kind: 'layout' }>['choice'];

interface ActionEntryOutput {
  id: string;
  title: string;
  keys: string[];
  cli: boolean;
  available: boolean;
}

interface RunContext {
  options: CommandOptions;
  snapshot: StoreSnapshot;
  target: ActionTarget;
  version: BuildVersion;
  environment: Environment;
}

const noFocusedWorkspace: Outcome = {
  ok: false,
  message: 'There is no focused workspace. Pass --workspace <id>.',
};

const attachedOnlyOutcome = (id: string): Outcome => ({
  ok: false,
  message: `${id} runs only in an attached client. Attach with koja attach.`,
});

const listedActionsOf = (snapshot: StoreSnapshot): ActionEntryOutput[] => {
  const target = defaultTargetOf(snapshot);

  return actionCatalog.map((entry) => ({
    id: entry.id,
    title: entry.title,
    keys: [...entry.keys],
    cli: entry.cli,
    available: entry.available(snapshot, target),
  }));
};

const listTextOf = (entry: ActionEntryOutput): string =>
  `${entry.id}  ${entry.keys.join(' ')}  ${entry.title}  cli=${entry.cli}  available=${entry.available}`;

const runActionList = async (
  options: CommandOptions,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(options.socket, environment);
  const result = await runSnapshot(socketPath, version);

  if (!result.ok) {
    return {
      ok: false,
      message: connectionFailureMessage(result, socketPath, 'action list'),
    };
  }

  const actions = listedActionsOf(result.snapshot);

  print<ActionEntryOutput[]>(options.json, {
    json: actions,
    text: actions.map(listTextOf).join('\n'),
  });

  return { ok: true };
};

const missingTargetOf = (run: RunAction, snapshot: StoreSnapshot): string | undefined => {
  if (run.pane !== undefined && !snapshot.panes.some((pane) => pane.id === run.pane)) {
    return `There is no pane ${run.pane}.`;
  }

  if (
    run.workspace !== undefined &&
    !snapshot.workspaces.some((known) => known.id === run.workspace)
  ) {
    return `There is no workspace ${run.workspace}.`;
  }

  return undefined;
};

const targetOf = (run: RunAction, snapshot: StoreSnapshot): ActionTarget => {
  const defaults = defaultTargetOf(snapshot);

  return {
    paneId: run.pane ?? defaults.paneId,
    workspaceId: run.workspace ?? defaults.workspaceId,
  };
};

const runPaneIntent = (action: PaneAction, context: RunContext): Promise<Outcome> => {
  const pane = context.target.paneId;

  invariant(pane !== undefined, 'A pane action is only available with a pane.');

  const layout = paneCommandOf(context.snapshot, pane, action);

  invariant(layout !== undefined, 'A pane focus action is only available with a neighbor.');

  return runPaneAction(
    { kind: 'pane', pane: layout, ...context.options },
    context.version,
    context.environment,
  );
};

const runWorkspaceIntent = async (key: WorkspaceKey, context: RunContext): Promise<Outcome> => {
  const { options, version, environment } = context;

  if (key === 'create') {
    const workspace: WorkspaceAction = {
      action: 'create',
      directory: process.cwd(),
      label: undefined,
      focus: true,
    };

    return runWorkspaceAction({ kind: 'workspace', workspace, ...options }, version, environment);
  }

  const workspaceId = context.target.workspaceId;

  if (workspaceId === undefined) {
    return noFocusedWorkspace;
  }

  if (key === 'close') {
    const workspace: WorkspaceAction = { action: 'close', workspaceId };

    return runWorkspaceAction({ kind: 'workspace', workspace, ...options }, version, environment);
  }

  const ids = context.snapshot.workspaces.map((workspace) => workspace.id);
  const neighbor = workspaceNeighborOf(ids, workspaceId, key === 'next' ? 1 : -1);

  invariant(neighbor !== undefined, 'A workspace step is only available with a workspace.');

  const workspace: WorkspaceAction = { action: 'focus', workspaceId: neighbor };

  return runWorkspaceAction({ kind: 'workspace', workspace, ...options }, version, environment);
};

const runTabIntent = async (route: TabRoute, context: RunContext): Promise<Outcome> => {
  const { options, snapshot, version, environment } = context;
  const workspaceId = context.target.workspaceId;

  if (workspaceId === undefined) {
    return noFocusedWorkspace;
  }

  if (route.kind === 'create') {
    const tab: TabAction = {
      action: 'create',
      workspaceId,
      cwd: undefined,
      focus: true,
    };

    return runTabAction({ kind: 'tab', tab, ...options }, version, environment);
  }

  const workspace = snapshot.workspaces.find((known) => known.id === workspaceId);

  invariant(workspace !== undefined, 'A tab route is only available with a known workspace.');

  const activeId = activeTabIdOf(snapshot.defaultView, workspaceId);
  const tabId = tabToFocus(workspace, activeId, route);

  if (tabId === undefined) {
    return {
      ok: false,
      message: 'There is no tab to focus in that direction.',
    };
  }

  return runTabAction(
    { kind: 'tab', tab: { action: 'focus', tabId }, ...options },
    version,
    environment,
  );
};

const runLayoutIntent = (choice: LayoutChoice, context: RunContext): Promise<Outcome> => {
  const { options, snapshot, version, environment } = context;
  const pane = snapshot.panes.find((known) => known.id === context.target.paneId);

  invariant(pane !== undefined, 'A layout action is only available with a pane.');

  return runTabAction(
    { kind: 'tab', tab: { action: 'layout', tabId: pane.tabId, choice }, ...options },
    version,
    environment,
  );
};

const runDetachIntent = (context: RunContext): Promise<Outcome> =>
  runDetachCommand(
    { kind: 'detach', client: undefined, ...context.options },
    context.version,
    context.environment,
  );

const runIntent = (entry: ActionEntry, context: RunContext): Promise<Outcome> => {
  const { intent } = entry;

  if (intent.kind === 'pane') {
    return runPaneIntent(intent.action, context);
  }

  if (intent.kind === 'workspace') {
    return runWorkspaceIntent(intent.key, context);
  }

  if (intent.kind === 'tab') {
    return runTabIntent(intent.route, context);
  }

  if (intent.kind === 'layout') {
    return runLayoutIntent(intent.choice, context);
  }

  if (intent.kind === 'detach') {
    return runDetachIntent(context);
  }

  return Promise.resolve(attachedOnlyOutcome(entry.id));
};

const runActionRun = async (
  run: RunAction,
  options: CommandOptions,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const { entry } = run;

  if (!entry.cli) {
    return attachedOnlyOutcome(entry.id);
  }

  const socketPath = resolveSocketPath(options.socket, environment);
  const result = await runSnapshot(socketPath, version);

  if (!result.ok) {
    return {
      ok: false,
      message: connectionFailureMessage(result, socketPath, 'action run'),
    };
  }

  const missing = missingTargetOf(run, result.snapshot);

  if (missing !== undefined) {
    return { ok: false, message: missing };
  }

  const target = targetOf(run, result.snapshot);

  if (!entry.available(result.snapshot, target)) {
    return { ok: false, message: `${entry.id} is not available here.` };
  }

  return runIntent(entry, {
    options,
    snapshot: result.snapshot,
    target,
    version,
    environment,
  });
};

export const runActionCommand = (
  command: ActionCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const { action } = command;

  if (action.action === 'list') {
    return runActionList(command, version, environment);
  }

  return runActionRun(action, command, version, environment);
};
