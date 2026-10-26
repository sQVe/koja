import type { BuildVersion } from '../protocol/protocol.ts';
import { runActionCommand } from './actionCommands.ts';
import { runAttachCommand } from './attachCommand.ts';
import type { AttachCommand } from './clientCommandParse.ts';
import { runClientAction } from './clientCommands.ts';
import { runDefaultCommand } from './defaultCommand.ts';
import { runDetachCommand } from './detachCommand.ts';
import type { Environment } from './environment.ts';
import { print } from './output.ts';
import type { Outcome } from './output.ts';
import { runPaneAction } from './paneCommands.ts';
import { parseCommand, usage } from './parse.ts';
import type { Command, DefaultCommand, VersionCommand } from './parse.ts';
import { runPiAction } from './piCommands.ts';
import { runServerAction } from './serverCommands.ts';
import { runTabAction } from './tabCommands.ts';
import { readVersions } from './versions.ts';
import { runWorkspaceAction } from './workspaceCommands.ts';

interface VersionOutput {
  version: string;
  ghostty: string;
}

const writeError = (message: string, suffix = ''): void => {
  process.stderr.write(`koja: ${message}${suffix}\n`);
};

const runRequestCommand = (
  command: Exclude<Command, VersionCommand | AttachCommand | DefaultCommand>,
  versions: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  if (command.kind === 'pane') {
    return runPaneAction(command, versions, environment);
  }

  if (command.kind === 'pi') {
    return runPiAction(command, versions, environment);
  }

  if (command.kind === 'workspace') {
    return runWorkspaceAction(command, versions, environment);
  }

  if (command.kind === 'tab') {
    return runTabAction(command, versions, environment);
  }

  if (command.kind === 'client') {
    return runClientAction(command, versions, environment);
  }

  if (command.kind === 'detach') {
    return runDetachCommand(command, versions, environment);
  }

  if (command.kind === 'action') {
    return runActionCommand(command, versions, environment);
  }

  return runServerAction(command, versions, environment);
};

// Returns the exit code: 0 on success, 1 on failure, and 2 on bad arguments.
export const runCli = async (argv: string[], environment: Environment): Promise<number> => {
  const command = parseCommand(argv);

  if (typeof command === 'string') {
    writeError(command, `\n${usage}`);

    return 2;
  }

  const result = readVersions();

  if (!result.ok) {
    writeError(result.message);

    return 1;
  }

  if (command.kind === 'version') {
    const { version, ghostty } = result.versions;

    print<VersionOutput>(command.json, {
      json: { version, ghostty },
      text: `koja ${version} (ghostty ${ghostty})`,
    });

    return 0;
  }

  if (command.kind === 'attach' || command.kind === 'default') {
    const outcome =
      command.kind === 'attach'
        ? await runAttachCommand(command, result.versions, environment)
        : await runDefaultCommand(command, result.versions, environment);

    if (!outcome.ok) {
      writeError(outcome.message);

      return 1;
    }

    return 0;
  }

  const outcome = await runRequestCommand(command, result.versions, environment);

  if (!outcome.ok) {
    writeError(outcome.message);

    return 1;
  }

  return 0;
};
