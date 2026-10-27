import {
  hasWayland,
  hasX11,
  overSsh,
  stopTool,
  toolEnvironment,
  toolExists,
  toolTimeoutMs,
  waitForOutcome,
} from './clipboardTool.ts';
import type { Environment } from './clipboardTool.ts';

interface ClipboardDependencies {
  environment: Environment;
  // Whether the command ran and exited with zero. A missing command is false.
  runCommand: (command: string[], text: string, signal?: AbortSignal) => Promise<boolean>;
  writeTerminal: (bytes: string) => void;
  // Stops the copy: the running tool is killed and no later step runs.
  signal?: AbortSignal;
}

interface CommandLimits {
  // Where to look for the tools. Defaults to the client's PATH.
  searchPath?: string;
  // wl-copy stays running as the clipboard owner, so a copy that is still running after this
  // counts as done.
  wlCopyStartupMs: number;
  // xclip and xsel exit once the copy is done. A tool that runs longer is hung.
  toolTimeoutMs: number;
}

export interface ClipboardQueue {
  // Copies run one at a time in call order, so the newest text ends on the clipboard.
  copy: (text: string) => void;
  // Kills the running tool and drops the copies still waiting.
  close: () => void;
  // Resolves once every copy queued so far has finished or been skipped.
  idle: () => Promise<void>;
}

const waylandCommand = ['wl-copy', '--type', 'text/plain;charset=utf-8'];

const x11Commands = [
  ['xclip', '-selection', 'clipboard', '-in'],
  ['xsel', '--clipboard', '--input'],
];

const defaultLimits: CommandLimits = { wlCopyStartupMs: 100, toolTimeoutMs };

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

const osc52 = (text: string): string => `\u001B]52;c;${Buffer.from(text).toString('base64')}\u0007`;

const spawnTool = (command: string[], text: string, searchPath: string | undefined) => {
  try {
    return Bun.spawn(command, {
      ...toolEnvironment(searchPath),
      detached: true,
      stdin: new Blob([text]),
      stdout: 'ignore',
      stderr: 'ignore',
    });
  } catch {
    return undefined;
  }
};

export const createCommandRunner =
  (limits: CommandLimits = defaultLimits) =>
  async (command: string[], text: string, signal?: AbortSignal): Promise<boolean> => {
    const child =
      !toolExists(command, limits.searchPath) || signal?.aborted === true
        ? undefined
        : spawnTool(command, text, limits.searchPath);

    if (child === undefined) {
      return false;
    }

    const keepsOwning = command[0] === 'wl-copy';

    const outcome = await waitForOutcome(
      child.exited.catch(() => -1),
      keepsOwning ? limits.wlCopyStartupMs : limits.toolTimeoutMs,
      signal,
    );

    if (outcome === 'timeout' && keepsOwning) {
      child.unref();

      return true;
    }

    if (outcome === 'timeout' || outcome === 'aborted') {
      await stopTool(child);
    }

    return outcome === 0;
  };

const defaults = (): ClipboardDependencies => ({
  // oxlint-disable-next-line node/no-process-env -- the client's terminal environment decides how to copy.
  environment: process.env,
  runCommand: createCommandRunner(),
  writeTerminal: (bytes) => process.stdout.write(bytes),
});

// Copies text to the system clipboard. Over SSH the local terminal owns the clipboard, so it gets
// OSC 52. Otherwise the first native tool that succeeds wins, and OSC 52 is the fallback.
export const copyToClipboard = async (
  text: string,
  dependencies: ClipboardDependencies = defaults(),
): Promise<void> => {
  const { environment, writeTerminal, signal } = dependencies;

  if (!overSsh(environment)) {
    for (const command of nativeCommands(environment)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a later tool runs only if this one fails.
      if (await dependencies.runCommand(command, text, signal)) {
        return;
      }
    }
  }

  if (signal?.aborted !== true) {
    writeTerminal(osc52(text));
  }
};

export const createClipboardQueue = (
  copyText: (text: string, signal: AbortSignal) => Promise<void> = (text, signal) =>
    copyToClipboard(text, { ...defaults(), signal }),
): ClipboardQueue => {
  const controller = new AbortController();
  let tail: Promise<void> = Promise.resolve();

  return {
    copy: (text) => {
      tail = tail.then(async () => {
        if (!controller.signal.aborted) {
          await copyText(text, controller.signal).catch(() => undefined);
        }

        return undefined;
      });
    },
    close: () => {
      controller.abort();
    },
    idle: () => tail,
  };
};
