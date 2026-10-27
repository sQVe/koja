export type Environment = Record<string, string | undefined>;

interface ToolProcess {
  pid: number;
  exitCode: number | null;
  signalCode: string | null;
  exited: Promise<number>;
}

// xclip, xsel, and wl-paste finish quickly. A tool that runs longer is hung.
export const toolTimeoutMs = 2000;

const isSet = (value: string | undefined): boolean => value !== undefined && value !== '';

export const overSsh = (environment: Environment): boolean =>
  isSet(environment.SSH_CONNECTION) || isSet(environment.SSH_TTY);

export const hasWayland = (environment: Environment): boolean => isSet(environment.WAYLAND_DISPLAY);

export const hasX11 = (environment: Environment): boolean => isSet(environment.DISPLAY);

// The spawn environment that finds tools in searchPath, or the client's own when it is unset.
export const toolEnvironment = (
  searchPath: string | undefined,
): { env?: Record<string, string | undefined> } =>
  searchPath === undefined ? {} : { env: { ...Bun.env, PATH: searchPath } };

export const toolExists = (command: string[], searchPath: string | undefined): boolean =>
  Bun.which(command[0] ?? '', searchPath === undefined ? {} : { PATH: searchPath }) !== null;

export const waitForOutcome = async <Value>(
  work: Promise<Value>,
  waitMs: number,
  signal: AbortSignal | undefined,
): Promise<Value | 'timeout' | 'aborted'> => {
  const gate = Promise.withResolvers<Value | 'timeout' | 'aborted'>();

  const timer = setTimeout(() => {
    gate.resolve('timeout');
  }, waitMs);

  const abort = (): void => {
    gate.resolve('aborted');
  };

  signal?.addEventListener('abort', abort);
  work.then(gate.resolve).catch(gate.reject);

  try {
    return await gate.promise;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
};

// Tools start detached, so a tool's pid is also its process group id. SIGKILL to the group also
// stops a tool that ignores SIGTERM and any child that still holds the tool's pipes. Once the tool
// is reaped, its group may be gone and the id reused, so call this only before that or at the
// moment the exit is observed.
export const killToolGroup = (pid: number): void => {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // The group has already exited.
  }
};

const reaped = (child: ToolProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;

export const stopTool = async (child: ToolProcess): Promise<void> => {
  if (!reaped(child)) {
    killToolGroup(child.pid);
  }

  await child.exited.catch(() => undefined);
};
