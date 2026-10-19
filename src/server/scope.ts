import { randomUUID } from 'node:crypto';

// A systemd user scope holds one pane's processes. systemd tracks them in a cgroup, so a process
// cannot leave the scope with setsid or by outliving its parent.

type Environment = Record<string, string | undefined>;

export type ScopeState = 'running' | 'gone' | 'unknown';

export type RegistrationResult = 'active' | 'exited' | 'unresolved';

export type SignalScopeResult = { ok: true } | { ok: false; message: string };

const systemdRun = 'systemd-run';

const scopeArguments = ['--user', '--scope', '--quiet', '-p', 'KillMode=control-group'];

const scopePollMs = 20;

// Every call to the systemd manager gets a deadline, since a stalled manager must not stall stop.
const systemctlTimeoutMs = 500;

const probeTimeoutMs = 2000;

const killedOnTimeout = { killSignal: 'SIGKILL' } as const;

const inactiveExitCode = 3;

const unknownUnitExitCode = 4;

export const scopeUnitName = (serverProcessId: number): string =>
  `koja-pane-${serverProcessId}-${randomUUID()}.scope`;

// The command runs the shell inside a new scope. systemd-run executes the shell in place, so the
// shell keeps the process id that the server spawned. systemd-run expands `$` in arguments, so
// the shell path must not hold one.
export const scopedCommand = (unit: string, shell: string): string[] => [
  systemdRun,
  ...scopeArguments,
  '--collect',
  '--unit',
  unit,
  '--',
  shell,
];

// True when this machine can start a user scope. Expected to fail without a systemd user manager.
export const scopeAvailable = (environment: Environment): boolean => {
  try {
    const probe = Bun.spawnSync(
      [
        systemdRun,
        ...scopeArguments,
        '--collect',
        '--unit',
        scopeUnitName(process.pid),
        '--',
        'true',
      ],
      {
        env: environment,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: probeTimeoutMs,
        ...killedOnTimeout,
      },
    );

    return probe.exitCode === 0;
  } catch {
    // systemd-run is not installed.
    return false;
  }
};

// Resolves with the exit code, or undefined when systemctl did not run or did not finish in time.
const systemctl = async (
  environment: Environment,
  timeoutMs: number,
  args: string[],
): Promise<number | undefined> => {
  try {
    const child = Bun.spawn(['systemctl', '--user', ...args], {
      env: environment,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      timeout: timeoutMs,
      ...killedOnTimeout,
    });

    const exitCode = await child.exited;

    return child.signalCode === null ? exitCode : undefined;
  } catch {
    return undefined;
  }
};

// Exit code 3 and 4 mean the unit is inactive or unknown, which --collect causes once every
// process in the scope has ended. Any other failure says nothing about the scope.
const queryScope = async (environment: Environment, unit: string): Promise<ScopeState> => {
  const exitCode = await systemctl(environment, systemctlTimeoutMs, ['is-active', '--quiet', unit]);

  if (exitCode === 0) {
    return 'running';
  }

  return exitCode === inactiveExitCode || exitCode === unknownUnitExitCode ? 'gone' : 'unknown';
};

// systemd registers a new scope a few milliseconds after systemd-run starts, and until then it
// reports the scope as unknown. Waits until a query says the scope is running or the shell has
// exited. A query that fails or times out proves nothing, so the wait goes on. 'unresolved' means
// no positive answer came in time while the shell lives.
export const waitForScopeActive = async (
  environment: Environment,
  unit: string,
  shellExited: () => boolean,
  waitMs: number,
): Promise<RegistrationResult> => {
  const deadline = performance.now() + waitMs;

  while (performance.now() < deadline) {
    if (shellExited()) {
      return 'exited';
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- each check must follow the last wait.
    const state = await queryScope(environment, unit);

    if (state === 'running') {
      return 'active';
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- each check must follow the last wait.
    await Bun.sleep(scopePollMs);
  }

  return shellExited() ? 'exited' : 'unresolved';
};

// A signal that cannot reach a scope that has already ended is not a failure.
export const signalScope = async (
  environment: Environment,
  unit: string,
  signal: 'SIGHUP' | 'SIGKILL',
): Promise<SignalScopeResult> => {
  const exitCode = await systemctl(environment, systemctlTimeoutMs, [
    'kill',
    `--signal=${signal}`,
    unit,
  ]);

  if (exitCode === 0) {
    return { ok: true };
  }

  const state = await queryScope(environment, unit);

  if (state === 'gone') {
    return { ok: true };
  }

  return { ok: false, message: `Cannot send ${signal} to scope ${unit}` };
};

// Sends SIGKILL without waiting, for callers that cannot wait. The call ends at its deadline.
export const killScopeDetached = (environment: Environment, unit: string): void => {
  systemctl(environment, systemctlTimeoutMs, ['kill', '--signal=SIGKILL', unit]).catch(
    () => undefined,
  );
};

// Resolves with the last state seen, which is 'running' when the grace time ran out.
export const waitForScopeExit = async (
  environment: Environment,
  unit: string,
  graceMs: number,
): Promise<ScopeState> => {
  const deadline = performance.now() + graceMs;
  let state: ScopeState = 'running';

  while (performance.now() < deadline) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each check must follow the last wait.
    state = await queryScope(environment, unit);

    if (state === 'gone') {
      return state;
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- each check must follow the last wait.
    await Bun.sleep(scopePollMs);
  }

  return state;
};
