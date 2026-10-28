import { statSync } from 'node:fs';

import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { focusedPane, paneTheme } from '../store/store.ts';
import type { Fact, Pane, PiRecovery, State } from '../store/store.ts';
import type { Log } from './log.ts';
import { spawnPane } from './pane.ts';
import type { PaneRuntime } from './pane.ts';
import { createReportPass } from './paneEnvironment.ts';
import type { PaneIdentity } from './paneEnvironment.ts';
import { sendToForeground } from './paneNotice.ts';
import type { ForegroundContext } from './paneNotice.ts';
import type { RunningPane } from './paneRecord.ts';
import { fitsReply } from './paneRows.ts';
import { admitRestoredPane } from './piRecoveryStart.ts';
import { readFollowFolder } from './processInfo.ts';
import { createRowPublisher } from './rowPublisher.ts';
import { scheduleRows } from './rowSubscriptions.ts';
import type { RowPublication } from './rowSubscriptions.ts';
import { scopeAvailable } from './scope.ts';

export interface PaneEffectContext {
  options: {
    log: Log;
    environment: Record<string, string | undefined>;
    socketPath: string;
    binaryPath: string;
    version: BuildVersion;
    holdLimitMs?: number;
    scrollbackBytes?: number;
  };
  state: State;
  runtime: ForegroundContext['runtime'] & {
    panes: Map<PaneId, RunningPane>;
    // Whether panes start in a systemd user scope. Decided when the first pane starts.
    paneScopes: boolean | undefined;
    piRecoveries: Map<PaneId, PiRecovery>;
  };
}

interface LivePaneContext {
  state: Pick<State, 'panes'>;
  runtime: { panes: Map<PaneId, RunningPane> };
}

export interface LivePane {
  pane: Pane;
  runtime: PaneRuntime;
  publication: RowPublication;
}

// Effects report facts with this.
type Report = (fact: Fact) => void;

interface PaneExit {
  pane: Pane;
  runtime: PaneRuntime;
  exitCode: number;
  // A pane whose output failed has reported its failure, so its exit reports nothing.
  outputFailed: boolean;
}

// How long a pane whose stop failed gets to exit after it is killed.
const paneExitWaitMs = 1000;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// A failed pane has no record. Only the record of this generation is released. Every release step
// runs even when an earlier one throws, and a failure is logged, never thrown.
export const releasePane = (context: PaneEffectContext, id: PaneId, generation: number): void => {
  const running = context.runtime.panes.get(id);

  if (running?.runtime.generation !== generation) {
    return;
  }

  context.runtime.panes.delete(id);

  const steps = [
    {
      name: 'Disposing the row publisher',
      run: () => {
        running.publication.publisher[Symbol.dispose]();
      },
    },
    {
      name: 'Disposing the pane',
      run: () => {
        running.runtime[Symbol.dispose]();
      },
    },
  ];

  for (const step of steps) {
    try {
      step.run();
    } catch (error) {
      context.options.log.error(`${step.name} failed.`, {
        paneId: id,
        error: describeError(error),
      });
    }
  }
};

const applyAttachedTheme = (context: PaneEffectContext, runtime: PaneRuntime): void => {
  const theme = paneTheme(context.state);

  if (theme !== undefined) {
    runtime.terminal.setDefaultColors(theme.foreground, theme.background, theme.palette);
  }
};

export const applyThemeToPane = (context: PaneEffectContext): void => {
  for (const running of context.runtime.panes.values()) {
    applyAttachedTheme(context, running.runtime);
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
  `Saved folder ${folder} is unavailable. Restore the folder and restart the Koja server.`;

const savedShellMessage = (detail: string): string =>
  `Could not start the saved shell: ${detail.replace(/\.$/, '')}. Fix the shell configuration and restart the Koja server.`;

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

const paneIdentityOf = (context: PaneEffectContext, pane: Pane): PaneIdentity => {
  const tab = context.state.tabs.find((known) => known.id === pane.tabId);

  invariant(tab !== undefined, `Pane ${pane.id} has no tab.`);

  return {
    paneId: pane.id,
    tabId: tab.id,
    workspaceId: tab.workspaceId,
    socketPath: context.options.socketPath,
    binaryPath: context.options.binaryPath,
    version: context.options.version.version,
    reportPass: createReportPass(),
  };
};

export const paneNumber = (id: PaneId): number => Number(id.slice('pane-'.length));

export const reportOutputFailure = (
  context: PaneEffectContext,
  pane: Pane,
  cause: string,
  report: Report,
): void => {
  const { id, generation } = pane;
  const message = `Pane output failed: ${cause}`;

  context.options.log.error('The pane output failed.', { paneId: id, message });
  releasePane(context, id, generation);
  report({ type: 'paneFailed', paneId: id, generation, message });
};

export const reportPaneExit = (
  context: PaneEffectContext,
  exit: PaneExit,
  report: Report,
): void => {
  const { log } = context.options;
  const { pane, runtime, exitCode } = exit;
  const { id, generation } = pane;

  log.info('The pane exited.', { paneId: id, exitCode });

  if (exit.outputFailed) {
    return;
  }

  const message = context.state.stopping ? undefined : scopedExecFailure(pane, runtime, exitCode);

  if (message === undefined) {
    report({ type: 'paneExited', paneId: id, generation, exitCode });

    return;
  }

  log.error('The restored pane failed to start.', { paneId: id, message });
  releasePane(context, id, generation);
  report({ type: 'paneFailedToStart', paneId: id, generation, message });
};

export const recordPane = (
  context: Pick<PaneEffectContext, 'runtime'>,
  id: PaneId,
  running: RunningPane,
): void => {
  context.runtime.panes.set(id, running);
};

// Returns the message of a new pane that failed to start. A restored pane reports no failure.
export const startPane = (
  context: PaneEffectContext,
  pane: Pane,
  report: Report,
  spawn: typeof spawnPane = spawnPane,
): string | undefined => {
  const { log } = context.options;
  const { id, generation } = pane;

  if (!admitRestoredPane(context, pane, report)) {
    return undefined;
  }

  const directory = startFolderOf(context, pane);

  if (pane.restored && !isDirectory(directory)) {
    const message = goneFolderMessage(directory);

    log.error('The restored pane has no folder.', { paneId: id, message });
    report({ type: 'paneFailedToStart', paneId: id, generation, message });

    return undefined;
  }

  let outputFailed = false;

  const identity = paneIdentityOf(context, pane);

  const spawned = spawn({
    generation,
    size: pane.size,
    environment: context.options.environment,
    identity,
    directory,
    useScope: paneScopesEnabled(context),
    ...(context.options.scrollbackBytes === undefined
      ? {}
      : { scrollbackBytes: context.options.scrollbackBytes }),
    onOutput: () => {
      scheduleRows(context, id, generation);
    },
    onRenumbered: (renumbered) => {
      report({ type: 'paneRowsRenumbered', paneId: id, generation, ...renumbered });
    },
    onBell: (count) => {
      sendToForeground(context, { type: 'bell', count });
    },
    onClipboard: (text) => {
      const message: ControlMessage = { type: 'clipboardWrite', text };

      if (fitsReply(message)) {
        sendToForeground(context, message);
      }
    },
    onFailed: (cause) => {
      outputFailed = true;
      reportOutputFailure(context, pane, cause, report);
    },
  });

  if (!spawned.ok) {
    log.error('The pane failed to start.', { paneId: id, message: spawned.message });

    const message = pane.restored ? savedShellMessage(spawned.message) : spawned.message;

    report({ type: 'paneFailedToStart', paneId: id, generation, message });

    return pane.restored ? undefined : spawned.message;
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

  recordPane(context, id, {
    runtime: spawned.pane,
    reportPass: identity.reportPass,
    publication: { publisher, pending: false },
  });

  log.info('Started the pane.', { paneId: id });

  spawned.pane.exited
    .then((exitCode) => {
      reportPaneExit(context, { pane, runtime: spawned.pane, exitCode, outputFailed }, report);
    })
    .catch((error: unknown) => {
      log.error('Handling the pane exit failed.', { paneId: id, error: describeError(error) });
    });

  report({ type: 'paneStarted', paneId: id, generation });

  return undefined;
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
  running: RunningPane,
): Promise<string[]> => {
  const { log } = context.options;
  const { runtime: pane, publication } = running;
  const failures: string[] = [];

  publication.publisher[Symbol.dispose]();

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
  const running = context.runtime.panes.get(id);
  const size = context.state.panes.find((known) => known.id === id)?.size;

  if (running === undefined || size === undefined) {
    return;
  }

  try {
    running.runtime.resize(size);
    running.publication.publisher.resize(size);
  } catch (error) {
    context.options.log.error('Resizing the pane failed.', {
      paneId: id,
      error: describeError(error),
    });

    return;
  }

  scheduleRows(context, id, running.runtime.generation);
};

// Stops the process of a pane the store dropped. A pane that already exited has no runtime left.
export const removePane = (context: PaneEffectContext, id: PaneId): void => {
  const running = context.runtime.panes.get(id);

  if (running === undefined) {
    return;
  }

  // stopPane disposes the row publisher, which releases held pane reads.
  const stopping = stopPane(context, id, running);

  context.runtime.panes.delete(id);

  stopping.catch((error: unknown) => {
    context.options.log.error('Stopping the pane failed.', {
      paneId: id,
      error: describeError(error),
    });
  });
};

export const focusedRuntime = (
  state: State,
  panes: ReadonlyMap<PaneId, RunningPane>,
): PaneRuntime | undefined => {
  const pane = focusedPane(state);

  return pane === undefined ? undefined : panes.get(pane.id)?.runtime;
};

export const findLivePane = (context: LivePaneContext, paneId: PaneId): LivePane | undefined => {
  const pane = context.state.panes.find((known) => known.id === paneId);
  const running = context.runtime.panes.get(paneId);
  const isLive = pane?.lifecycle === 'running';

  if (!isLive || running === undefined) {
    return undefined;
  }

  return { pane, runtime: running.runtime, publication: running.publication };
};

export const followFolderOf = (
  context: LivePaneContext,
  id: PaneId | undefined,
): string | undefined => {
  const live = id === undefined ? undefined : findLivePane(context, id);

  return live === undefined ? undefined : readFollowFolder(live.runtime.processId);
};
