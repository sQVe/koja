import type { ExecResult, Status } from 'herdr';

import { folderNameOf } from '../../data/fields.ts';

export interface Workspace {
  space: string;
  machine: string | null;
  folder: string;
  root: string;
  name: string;
}

export type RiskKind = 'changes' | 'agent';

export type RemoveRisks = RiskKind[];

// The close dialog only warns about an agent, because the worktree is already gone by then.
export type AgentRisk = 'agent';

export type GroveArguments =
  | { kind: 'arguments'; args: string[] }
  | { kind: 'refused'; name: string; role: 'branch' | 'worktree' };

const bareFolder = '.bare';

const trimSlashes = (path: string): string => path.replace(/\/+$/, '');

export const workspaceRoot = (commonDirectory: string): string | null => {
  const trimmed = trimSlashes(commonDirectory.trim());

  if (folderNameOf(trimmed) !== bareFolder) {
    return null;
  }

  return trimmed.slice(0, -bareFolder.length - 1);
};

export const isWorkspaceWorktree = (folder: string, root: string): boolean => {
  const parent = trimSlashes(folder).split('/').slice(0, -1).join('/');

  return parent === trimSlashes(root);
};

export const removeRisks = (dirty: boolean, status: Status | null | undefined): RemoveRisks => {
  const risks: RemoveRisks = [];

  if (dirty) {
    risks.push('changes');
  }

  if (status !== null && status !== undefined) {
    risks.push('agent');
  }

  return risks;
};

const refusedName = (name: string, role: 'branch' | 'worktree'): GroveArguments | null => {
  if (!name.startsWith('-')) {
    return null;
  }

  return { kind: 'refused', name, role };
};

export const addArguments = (branch: string): GroveArguments => {
  const refused = refusedName(branch, 'branch');

  return refused ?? { kind: 'arguments', args: ['add', branch] };
};

export const removeArguments = (name: string, force: boolean): GroveArguments => {
  const refused = refusedName(name, 'worktree');

  if (refused !== null) {
    return refused;
  }

  return { kind: 'arguments', args: force ? ['remove', '--force', name] : ['remove', name] };
};

export const worktreeFolder = (porcelain: string, branch: string): string | null => {
  const branchField = `branch refs/heads/${branch}`;
  let folder: string | null = null;

  for (const field of porcelain.split('\0')) {
    if (field === '') {
      folder = null;
    } else if (field.startsWith('worktree ')) {
      folder = field.slice('worktree '.length);
    } else if (field === branchField) {
      return folder;
    }
  }

  return null;
};

export const failureText = (result: ExecResult, fallback: string): string => {
  const text = result.stderr.trim() === '' ? result.stdout.trim() : result.stderr.trim();

  return text === '' ? fallback : text;
};
