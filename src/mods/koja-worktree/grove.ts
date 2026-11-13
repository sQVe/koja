import type { ExecResult, Status } from 'herdr';

export interface Workspace {
  space: string;
  machine: string | null;
  folder: string;
  root: string;
  name: string;
}

export type RemoveRisk = 'changes' | 'agent' | null;

const bareFolder = '.bare';

const trimSlashes = (path: string): string => path.replace(/\/+$/, '');

export const baseName = (path: string): string => trimSlashes(path).split('/').at(-1) ?? '';

export const workspaceRoot = (commonDirectory: string): string | null => {
  const trimmed = trimSlashes(commonDirectory.trim());

  if (baseName(trimmed) !== bareFolder) {
    return null;
  }

  return trimmed.slice(0, -bareFolder.length - 1);
};

export const isWorkspaceWorktree = (folder: string, root: string): boolean => {
  const parent = trimSlashes(folder).split('/').slice(0, -1).join('/');

  return parent === trimSlashes(root);
};

export const removeRisk = (dirty: boolean, status: Status | null | undefined): RemoveRisk => {
  if (dirty) {
    return 'changes';
  }

  return status === null || status === undefined ? null : 'agent';
};

export const addArguments = (branch: string): string[] => ['add', branch];

export const removeArguments = (name: string, confirmed: boolean): string[] =>
  confirmed ? ['remove', '--force', name] : ['remove', name];

export const worktreeFolder = (porcelain: string, branch: string): string | null => {
  const entries = porcelain.split(/\n\s*\n/).map((entry) => entry.split('\n'));
  const branchLine = `branch refs/heads/${branch}`;
  const entry = entries.find((lines) => lines.includes(branchLine));
  const folderLine = entry?.find((line) => line.startsWith('worktree '));

  return folderLine === undefined ? null : folderLine.slice('worktree '.length);
};

export const failureText = (result: ExecResult, fallback: string): string => {
  const text = result.stderr.trim() === '' ? result.stdout.trim() : result.stderr.trim();

  return text === '' ? fallback : text;
};
