import type { SpaceInfo } from 'herdr';
import { exec, panes, spaces, terminals } from 'herdr';

import { rollupStatuses, spaceFolder } from '../../kit/index.ts';
import type { RemoveRisk, Workspace } from './grove.ts';
import {
  baseName,
  failureText,
  isWorkspaceWorktree,
  removeRisk,
  workspaceRoot,
  worktreeFolder,
} from './grove.ts';

const probe = async (args: string[], cwd: string, machine: string | null): Promise<string> => {
  const result = await exec('git', args, { cwd, on: machine });

  if (result.code !== 0) {
    throw new Error(failureText(result, `git ${args.join(' ')} failed.`));
  }

  return result.stdout;
};

export const readWorkspace = async (space: SpaceInfo): Promise<Workspace> => {
  const start = spaceFolder(space, panes());
  const top = await probe(['rev-parse', '--show-toplevel'], start, space.machine);
  const folder = top.trim();

  const common = await probe(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    folder,
    space.machine,
  );

  const root = workspaceRoot(common);

  if (root === null) {
    throw new Error(`${folder} is not in a Grove workspace.`);
  }

  if (!isWorkspaceWorktree(folder, root)) {
    throw new Error(`${folder} is not directly in the Grove workspace ${root}.`);
  }

  return { space: space.id, machine: space.machine, folder, root, name: baseName(folder) };
};

export const readRisk = async (workspace: Workspace): Promise<RemoveRisk> => {
  const status = await probe(
    ['--no-optional-locks', 'status', '--porcelain'],
    workspace.folder,
    workspace.machine,
  );

  const statuses = rollupStatuses(spaces(), panes(), terminals());

  return removeRisk(status.trim() !== '', statuses.spaces[workspace.space]);
};

export const findWorktreeFolder = async (
  workspace: Workspace,
  branch: string,
): Promise<string | null> => {
  const listing = await probe(
    ['worktree', 'list', '--porcelain'],
    workspace.folder,
    workspace.machine,
  );

  return worktreeFolder(listing, branch);
};

export const runGrove = async (workspace: Workspace, args: string[]): Promise<string | null> => {
  const result = await exec('grove', args, { cwd: workspace.root, on: workspace.machine });

  return result.code === 0 ? null : failureText(result, `grove ${args[0] ?? ''} failed.`);
};
