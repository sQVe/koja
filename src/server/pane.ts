import type { TerminalSize } from '../layout.ts';
import { createTerminal } from '../vt/vt.ts';
import type { Terminal } from '../vt/vt.ts';
import { sessionGroups } from './processGroups.ts';
import {
  killScopeDetached,
  scopedCommand,
  scopeUnitName,
  signalScope,
  waitForScopeActive,
  waitForScopeExit,
} from './scope.ts';

type Environment = Record<string, string | undefined>;

interface SpawnPaneOptions {
  generation: number;
  size: TerminalSize;
  environment: Environment;
  directory: string;
  // Start the shell in its own systemd user scope, and end the scope on stop.
  useScope: boolean;
  onOutput: () => void;
}

export interface PaneRuntime {
  generation: number;
  terminal: Terminal;
  // Resolves with the shell's exit code once it has exited.
  exited: Promise<number>;
  write: (bytes: Uint8Array) => void;
  // Resizes the PTY and the terminal, and answers whatever the terminal replies to the shell.
  resize: (size: TerminalSize) => void;
  text: () => string;
  // Sends SIGHUP to every process in the pane's scope, or to every process group in the shell's
  // session without one, then SIGKILL to what is left after the grace time. Resolves with what
  // failed, after the session is killed.
  stop: () => Promise<string[]>;
  // Kills the shell's session and the pane's scope at once, and frees the terminal. The scope
  // kill runs in the background.
  [Symbol.dispose]: () => void;
}

type SpawnPaneResult = { ok: true; pane: PaneRuntime } | { ok: false; message: string };

type OnOutput = (pty: Bun.Terminal, bytes: Uint8Array) => void;

// 10 MiB of history per pane.
const paneScrollbackBytes = 0xa0_00_00;

// How long a pane's processes get to exit after SIGHUP before they get SIGKILL.
const hangupGraceMs = 1000;

// How long stop waits for systemd to register a new scope.
const registrationWaitMs = 1000;

const sessionPollMs = 10;

const terminalName = 'xterm-256color';

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const signalGroup = (group: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-group, signal);
  } catch {
    // The group ended.
  }
};

// The PTY makes the shell a session leader, so its process id names its session and its own
// process group. Job control moves the shell's jobs to other groups in the same session.
// The shell's own group gets the signal first, since it needs no /proc scan, which can fail.
const signalSession = (session: number, signal: NodeJS.Signals): void => {
  signalGroup(session, signal);

  for (const group of sessionGroups(session)) {
    if (group !== session) {
      signalGroup(group, signal);
    }
  }
};

const waitForSessionExit = async (session: number, graceMs: number): Promise<void> => {
  const deadline = performance.now() + graceMs;

  while (performance.now() < deadline && sessionGroups(session).length > 0) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each check must follow the last wait.
    await Bun.sleep(sessionPollMs);
  }
};

const shellOf = (environment: Environment): string => environment.SHELL ?? '/bin/sh';

// systemd-run reports a missing shell only after the pane started, so a missing shell skips the
// scope and fails to start here. systemd-run also expands `$` in the shell path, and the flag that
// turns this off is missing before systemd 254, so such a path skips the scope too.
const scopeCanRun = (shell: string): boolean => Bun.which(shell) !== null && !shell.includes('$');

const spawnShell = (options: SpawnPaneOptions, onOutput: OnOutput, unit: string | undefined) => {
  const { size, environment, directory } = options;
  const shell = shellOf(environment);
  const command = unit === undefined ? [shell] : scopedCommand(unit, shell);

  return Bun.spawn(command, {
    cwd: directory,
    env: { ...environment, TERM: terminalName },
    terminal: {
      cols: size.columns,
      rows: size.rows,
      name: terminalName,
      data: onOutput,
    },
  });
};

// Spawns the shell in a PTY at size, and parses every byte it writes.
export const spawnPane = (options: SpawnPaneOptions): SpawnPaneResult => {
  const created = createTerminal(options.size.columns, options.size.rows, paneScrollbackBytes);

  if (!created.ok) {
    return { ok: false, message: `Cannot create the pane terminal: ${created.reason}` };
  }

  const { terminal } = created;
  let disposed = false;

  const onOutput: OnOutput = (pty, bytes) => {
    if (disposed) {
      return;
    }

    const reply = terminal.write(bytes);

    if (reply !== undefined) {
      pty.write(reply);
    }

    terminal.stableRows();
    options.onOutput();
  };

  let shell: ReturnType<typeof spawnShell>;
  const scoped = options.useScope && scopeCanRun(shellOf(options.environment));
  const unit = scoped ? scopeUnitName(process.pid) : undefined;

  try {
    shell = spawnShell(options, onOutput, unit);
  } catch (error) {
    terminal[Symbol.dispose]();

    return {
      ok: false,
      message: `Cannot start ${shellOf(options.environment)}: ${describeError(error)}`,
    };
  }

  const session = shell.pid;

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;

    try {
      if (unit !== undefined) {
        killScopeDetached(options.environment, unit);
      }

      signalSession(session, 'SIGKILL');
    } finally {
      shell.terminal?.close();
      terminal[Symbol.dispose]();
    }
  };

  const endSession = async (): Promise<void> => {
    signalSession(session, 'SIGHUP');
    await waitForSessionExit(session, hangupGraceMs);
  };

  // Returns what failed, so stop can still kill the session before it reports.
  const endScope = async (scope: string): Promise<string[]> => {
    const failures: string[] = [];

    const registration = await waitForScopeActive(
      options.environment,
      scope,
      () => shell.exitCode !== null || shell.signalCode !== null,
      registrationWaitMs,
    );

    if (registration === 'unresolved') {
      await endSession();

      return [`Scope ${scope} did not register`];
    }

    const hangup = await signalScope(options.environment, scope, 'SIGHUP');

    if (!hangup.ok) {
      failures.push(hangup.message);
    }

    const state = await waitForScopeExit(options.environment, scope, hangupGraceMs);

    if (state === 'unknown') {
      failures.push(`Cannot query scope ${scope}`);
    }

    const kill = await signalScope(options.environment, scope, 'SIGKILL');

    if (!kill.ok) {
      failures.push(kill.message);
    }

    return failures;
  };

  const stop = async (): Promise<string[]> => {
    let failures: string[] = [];

    if (unit === undefined) {
      await endSession();
    } else {
      failures = await endScope(unit);
    }

    dispose();
    await shell.exited;

    return failures;
  };

  const pane: PaneRuntime = {
    generation: options.generation,
    terminal,
    exited: shell.exited,
    write: (bytes) => {
      shell.terminal?.write(bytes);
    },
    resize: (size) => {
      shell.terminal?.resize(size.columns, size.rows);

      const reply = terminal.resize(size.columns, size.rows);

      if (reply !== undefined) {
        shell.terminal?.write(reply);
      }
    },
    text: () => terminal.text(),
    stop,
    [Symbol.dispose]: dispose,
  };

  return { ok: true, pane };
};
