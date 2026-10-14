import { statSync } from 'node:fs';

import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { paneTheme } from '../store/store.ts';
import type { Fact, Pane, State } from '../store/store.ts';
import type { Log } from './log.ts';
import { spawnPane } from './pane.ts';
import type { PaneRuntime } from './pane.ts';
import { readFollowFolder } from './processInfo.ts';
import { createRowPublisher } from './rowPublisher.ts';
import { scheduleRows } from './rowSubscriptions.ts';
import type { RowPublication } from './rowSubscriptions.ts';
import { scopeAvailable } from './scope.ts';

export interface PaneEffectContext {
  options: {
    log: Log;
    environment: Record<string, string | undefined>;
    holdLimitMs?: number;
    scrollbackBytes?: number;
  };
  state: State;
  runtime: {
    panes: Map<PaneId, PaneRuntime>;
    rowPublishers: Map<PaneId, RowPublication>;
    // Whether panes start in a systemd user scope. Decided when the first pane starts.
    paneScopes: boolean | undefined;
  };
  // Why a pane failed to start during the current request, so the request can report it.
  paneStartFailure: string | undefined;
}

interface LivePaneContext {
  state: Pick<State, 'panes'>;
  runtime: { panes: Map<PaneId, PaneRuntime> };
}

export interface LivePane {
  pane: Pane;
  runtime: PaneRuntime;
}

// Effects report facts with this.
type Report = (fact: Fact) => void;

// How long a pane whose stop failed gets to exit after it is killed.
const paneExitWaitMs = 1000;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const disposePane = (context: PaneEffectContext, id: PaneId, generation: number): void => {
  const pane = context.runtime.panes.get(id);

  if (pane?.generation !== generation) {
    return;
  }

  context.runtime.panes.delete(id);
  context.runtime.rowPublishers.get(id)?.publisher[Symbol.dispose]();
  context.runtime.rowPublishers.delete(id);
  pane[Symbol.dispose]();
};

const applyAttachedTheme = (context: PaneEffectContext, runtime: PaneRuntime): void => {
  const theme = paneTheme(context.state);

  if (theme !== undefined) {
    runtime.terminal.setDefaultColors(theme.foreground, theme.background, theme.palette);
  }
};

export const applyThemeToPane = (context: PaneEffectContext): void => {
  for (const runtime of context.runtime.panes.values()) {
    applyAttachedTheme(context, runtime);
  }
};

const paneScopesEnabled = (context: PaneEffectContext): boolean => {
  const { runtime, options } = context;

  if (runtime.paneScopes === undefined) {
    runtime.paneScopes = scopeAvailable(options.environment);

    options.log.info(
      runtime.paneScopes
        ? 'Pane processes run in systemd user scopes.'
        : 'No systemd user scope is available. Stop ends the shell session only.',
    );
  }

  return runtime.paneScopes;
};

const workspaceRootOf = (context: Pick<PaneEffectContext, 'state'>, pane: Pane): string => {
  const tab = context.state.tabs.find((known) => known.id === pane.tabId);
  const workspace = context.state.workspaces.find((known) => known.id === tab?.workspaceId);

  invariant(workspace !== undefined, `Pane ${pane.id} has no workspace.`);

  return workspace.root;
};

export const startFolderOf = (context: Pick<PaneEffectContext, 'state'>, pane: Pane): string =>
  pane.startFolder ?? workspaceRootOf(context, pane);

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const goneFolderMessage = (folder: string): string =>
  `Saved folder ${folder} is unavailable. Restore the folder and restart the Phi server.`;

const savedShellMessage = (detail: string): string =>
  `Could not start the saved shell: ${detail.replace(/\.$/, '')}. Fix the shell configuration and restart the Phi server.`;

const execFailurePattern = /Failed to (?:execute|find executable)[^\n]*/;

// systemd-run starts before it runs the shell, so a shell that cannot execute looks like a pane
// that started and exited with code 1. Its only trace is the message in the terminal text. A shell
// that prints that message itself and exits 1 is taken for a failed start as well.
const scopedExecFailure = (
  pane: Pane,
  runtime: PaneRuntime,
  exitCode: number,
): string | undefined => {
  if (!pane.restored || !runtime.scoped || exitCode !== 1) {
    return undefined;
  }

  const line = execFailurePattern.exec(runtime.text({ unwrap: true }))?.[0].trim();

  return line === undefined ? undefined : savedShellMessage(line);
};

// A failed pane has no runtime. Only the runtime of this generation is released.
const releaseRuntime = (context: PaneEffectContext, id: PaneId, runtime: PaneRuntime): void => {
  if (context.runtime.panes.get(id) !== runtime) {
    return;
  }

  context.runtime.rowPublishers.get(id)?.publisher[Symbol.dispose]();
  context.runtime.rowPublishers.delete(id);
  context.runtime.panes.delete(id);
  runtime[Symbol.dispose]();
};

export const paneNumber = (id: PaneId): number => Number(id.slice('pane-'.length));

export const startPane = (context: PaneEffectContext, pane: Pane, report: Report): void => {
  const { log } = context.options;
  const { id, generation } = pane;
  const directory = startFolderOf(context, pane);

  if (pane.restored && !isDirectory(directory)) {
    const message = goneFolderMessage(directory);

    log.error('The restored pane has no folder.', { paneId: id, message });
    report({ type: 'paneFailedToStart', paneId: id, generation, message });

    return;
  }

  const spawned = spawnPane({
    generation,
    size: pane.size,
    environment: context.options.environment,
    directory,
    useScope: paneScopesEnabled(context),
    ...(context.options.scrollbackBytes === undefined
      ? {}
      : { scrollbackBytes: context.options.scrollbackBytes }),
    onOutput: () => {
      scheduleRows(context, id, generation);
    },
  });

  if (!spawned.ok) {
    log.error('The pane failed to start.', { paneId: id, message: spawned.message });

    if (!pane.restored) {
      context.paneStartFailure = spawned.message;
    }

    const message = pane.restored ? savedShellMessage(spawned.message) : spawned.message;

    report({ type: 'paneFailedToStart', paneId: id, generation, message });

    return;
  }

  const number = paneNumber(id);

  const publisher = createRowPublisher(spawned.pane.terminal, number, pane.size, {
    ...(context.options.holdLimitMs === undefined
      ? {}
      : { holdLimitMs: context.options.holdLimitMs }),
    requestPublication: () => {
      scheduleRows(context, id, generation);
    },
  });

  applyAttachedTheme(context, spawned.pane);
  context.runtime.panes.set(id, spawned.pane);
  context.runtime.rowPublishers.set(id, { publisher, pending: false });
  log.info('Started the pane.', { paneId: id });

  spawned.pane.exited
    .then((exitCode) => {
      log.info('The pane exited.', { paneId: id, exitCode });

      const message = context.state.stopping
        ? undefined
        : scopedExecFailure(pane, spawned.pane, exitCode);

      if (message === undefined) {
        report({ type: 'paneExited', paneId: id, generation, exitCode });

        return;
      }

      log.error('The restored pane failed to start.', { paneId: id, message });
      releaseRuntime(context, id, spawned.pane);
      report({ type: 'paneFailedToStart', paneId: id, generation, message });
    })
    .catch((error: unknown) => {
      log.error('Handling the pane exit failed.', { paneId: id, error: describeError(error) });
    });

  report({ type: 'paneStarted', paneId: id, generation });
};

// Runs one shutdown step, and logs and records its failure instead of throwing.
export const runStep = (
  context: PaneEffectContext,
  failures: string[],
  step: string,
  run: () => void,
): void => {
  try {
    run();
  } catch (error) {
    const message = `${step}: ${describeError(error)}`;

    context.options.log.error(`${step} failed.`, { error: describeError(error) });
    failures.push(message);
  }
};

const exitedWithin = async (pane: PaneRuntime, waitMs: number): Promise<boolean> => {
  const timedOut = Bun.sleep(waitMs).then(() => false);
  const exited = pane.exited.then(() => true);

  return Promise.race([exited, timedOut]);
};

// A failed stop still kills the pane and waits a bounded time for its shell, so the rest of the
// shutdown can go on. Returns what failed.
export const stopPane = async (
  context: PaneEffectContext,
  id: PaneId,
  pane: PaneRuntime,
): Promise<string[]> => {
  const { log } = context.options;
  const failures: string[] = [];

  context.runtime.rowPublishers.get(id)?.publisher[Symbol.dispose]();

  try {
    const stopFailures = await pane.stop();

    for (const failure of stopFailures) {
      log.error('Stopping the pane failed.', { paneId: id, error: failure });
      failures.push(`Stopping pane ${id}: ${failure}`);
    }

    return failures;
  } catch (error) {
    log.error('Stopping the pane failed.', { paneId: id, error: describeError(error) });
    failures.push(`Stopping pane ${id}: ${describeError(error)}`);
  }

  runStep(context, failures, `Ending pane ${id}`, () => {
    pane[Symbol.dispose]();
  });

  if (!(await exitedWithin(pane, paneExitWaitMs))) {
    log.error('The pane did not exit in time.', { paneId: id, waitMs: paneExitWaitMs });
    failures.push(`Pane ${id} did not exit within ${paneExitWaitMs} ms`);
  }

  return failures;
};

// Sizes the PTY from the current state, not from the change. A transition nested in the same effect
// batch, such as a failed pane start, may have replaced the size the change carries.
export const resizePane = (context: PaneEffectContext, id: PaneId): void => {
  const pane = context.runtime.panes.get(id);
  const publication = context.runtime.rowPublishers.get(id);
  const size = context.state.panes.find((known) => known.id === id)?.size;

  if (pane === undefined || publication === undefined || size === undefined) {
    return;
  }

  try {
    pane.resize(size);
    publication.publisher.resize(size);
  } catch (error) {
    context.options.log.error('Resizing the pane failed.', {
      paneId: id,
      error: describeError(error),
    });

    return;
  }

  scheduleRows(context, id, pane.generation);
};

// Stops the process of a pane the store dropped. A pane that already exited has no runtime left.
export const removePane = (context: PaneEffectContext, id: PaneId): void => {
  const pane = context.runtime.panes.get(id);

  if (pane === undefined) {
    return;
  }

  // stopPane disposes the row publisher it finds in the registry, which releases held pane reads.
  const stopping = stopPane(context, id, pane);

  context.runtime.panes.delete(id);
  context.runtime.rowPublishers.delete(id);

  stopping.catch((error: unknown) => {
    context.options.log.error('Stopping the pane failed.', {
      paneId: id,
      error: describeError(error),
    });
  });
};

export const findLivePane = (context: LivePaneContext, paneId: PaneId): LivePane | undefined => {
  const pane = context.state.panes.find((known) => known.id === paneId);
  const runtime = context.runtime.panes.get(paneId);
  const isLive = pane?.lifecycle === 'running';

  if (!isLive || runtime === undefined) {
    return undefined;
  }

  return { pane, runtime };
};

export const followFolderOf = (
  context: LivePaneContext,
  id: PaneId | undefined,
): string | undefined => {
  const live = id === undefined ? undefined : findLivePane(context, id);

  return live === undefined ? undefined : readFollowFolder(live.runtime.processId);
};

export const takePaneStartFailure = (
  context: Pick<PaneEffectContext, 'paneStartFailure'>,
): string | undefined => {
  const failure = context.paneStartFailure;

  context.paneStartFailure = undefined;

  return failure;
};
