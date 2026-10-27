import {
  hasWayland,
  hasX11,
  killToolGroup,
  overSsh,
  stopTool,
  toolEnvironment,
  toolExists,
  toolTimeoutMs,
  waitForOutcome,
} from './clipboardTool.ts';
import type { Environment } from './clipboardTool.ts';

type ToolResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'failed' | 'timeout' | 'aborted' };

export type ClipboardReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'unsupported' | 'empty' | 'failed' | 'timeout' | 'aborted' };

interface ClipboardReadDependencies {
  environment: Environment;
  // A missing command or a nonzero exit is `failed`.
  runCommand: (command: string[], signal?: AbortSignal) => Promise<ToolResult>;
  // Stops the read: the running tool is killed and no later tool runs.
  signal?: AbortSignal;
}

interface ReadLimits {
  // Where to look for the tools. Defaults to the client's PATH.
  searchPath?: string;
  toolTimeoutMs: number;
}

const waylandCommand = ['wl-paste', '--no-newline', '--type', 'text/plain'];

const x11Commands = [
  ['xclip', '-selection', 'clipboard', '-out'],
  ['xsel', '--clipboard', '--output'],
];

const defaultLimits: ReadLimits = { toolTimeoutMs };

const nativeCommands = (environment: Environment): string[][] => {
  const commands: string[][] = [];

  if (hasWayland(environment)) {
    commands.push(waylandCommand);
  }

  if (hasX11(environment)) {
    commands.push(...x11Commands);
  }

  return commands;
};

const spawnTool = (command: string[], searchPath: string | undefined) => {
  try {
    return Bun.spawn(command, {
      ...toolEnvironment(searchPath),
      detached: true,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
      // The read is over once the tool exits. Ending its group closes stdout for any child that
      // still holds it.
      onExit: (tool) => {
        killToolGroup(tool.pid);
      },
    });
  } catch {
    return undefined;
  }
};

export const createReadRunner =
  (limits: ReadLimits = defaultLimits) =>
  async (command: string[], signal?: AbortSignal): Promise<ToolResult> => {
    if (signal?.aborted === true) {
      return { ok: false, reason: 'aborted' };
    }

    const child = toolExists(command, limits.searchPath)
      ? spawnTool(command, limits.searchPath)
      : undefined;

    if (child === undefined) {
      return { ok: false, reason: 'failed' };
    }

    // Reading stdout while the tool runs keeps a full pipe from blocking it.
    const finished = Promise.all([child.exited, new Response(child.stdout).text()]).then(
      ([code, text]): ToolResult =>
        code === 0 ? { ok: true, text } : { ok: false, reason: 'failed' },
      (): ToolResult => ({ ok: false, reason: 'failed' }),
    );

    const outcome = await waitForOutcome(finished, limits.toolTimeoutMs, signal);

    await stopTool(child);

    if (outcome === 'timeout' || outcome === 'aborted') {
      return { ok: false, reason: outcome };
    }

    return outcome;
  };

const defaults = (): ClipboardReadDependencies => ({
  // oxlint-disable-next-line node/no-process-env -- the client's terminal environment decides how to paste.
  environment: process.env,
  runCommand: createReadRunner(),
});

// Reads text from the system clipboard with the first native tool that succeeds. Over SSH the
// clipboard belongs to the user's machine, which this host cannot read.
export const readClipboard = async (
  dependencies: ClipboardReadDependencies = defaults(),
): Promise<ClipboardReadResult> => {
  const { environment, signal } = dependencies;
  const commands = overSsh(environment) ? [] : nativeCommands(environment);

  if (commands.length === 0) {
    return { ok: false, reason: 'unsupported' };
  }

  let timedOut = false;

  for (const command of commands) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a later tool runs only if this one fails.
    const result = await dependencies.runCommand(command, signal);

    if (result.ok) {
      return result.text === '' ? { ok: false, reason: 'empty' } : result;
    }

    if (result.reason === 'aborted') {
      return { ok: false, reason: 'aborted' };
    }

    timedOut ||= result.reason === 'timeout';
  }

  return { ok: false, reason: timedOut ? 'timeout' : 'failed' };
};
