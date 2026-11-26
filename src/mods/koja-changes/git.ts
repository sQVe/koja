import type { ExecResult } from 'herdr';

import type { RunCommand } from '../../data/gitIdentity.ts';
import { readGitIdentity } from '../../data/gitIdentity.ts';
import type { ChangeFile } from './status.ts';
import { mergeNumstat, parseStatus } from './status.ts';

export interface ChangesSnapshot {
  root: string;
  on: string | null;
  hasHead: boolean;
  files: ChangeFile[];
  limited: boolean;
}

export type ReadOutcome = { snapshot: ChangesSnapshot } | { failure: string };

export type Repository =
  | { kind: 'root'; root: string }
  | { kind: 'missing' }
  | { kind: 'failed'; error: string };

export const readFlags = [
  '--no-optional-locks',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.autoRefreshIndex=false',
];

const statusArguments = ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'];

const fileLimit = 1000;

export const readRepository = async (
  run: RunCommand,
  cwd: string,
  on: string | null,
): Promise<Repository> => {
  const identity = await readGitIdentity(run, on, cwd);

  if (identity.kind === 'failed') {
    return { kind: 'failed', error: identity.error };
  }

  if (identity.kind === 'none' || identity.kind === 'bare') {
    return { kind: 'missing' };
  }

  return { kind: 'root', root: identity.worktree.top };
};

export const statusCommand = (
  run: RunCommand,
  root: string,
  on: string | null,
): Promise<ExecResult> => run('git', [...readFlags, ...statusArguments], { cwd: root, on });

const countOutputs = async (
  git: (args: string[]) => Promise<ExecResult>,
  hasHead: boolean,
): Promise<string[]> => {
  const requests = hasHead
    ? [['diff', 'HEAD', '--numstat', '-z', '--no-renames']]
    : [
        ['diff', '--cached', '--numstat', '-z', '--no-renames'],
        ['diff', '--numstat', '-z', '--no-renames'],
      ];

  const outputs: string[] = [];

  for (const args of requests) {
    // eslint-disable-next-line no-await-in-loop -- one count read at a time, so a failure stops the rest
    const result = await git(args);

    if (result.code !== 0) {
      throw new Error(result.stderr);
    }

    outputs.push(result.stdout);
  }

  return outputs;
};

// Counts need a commit and a tracked file; a folder of only untracked files has neither to read.
export const changeSnapshot = async (
  run: RunCommand,
  root: string,
  on: string | null,
  statusText: string,
): Promise<ChangesSnapshot> => {
  const git = (args: string[]): Promise<ExecResult> =>
    run('git', [...readFlags, ...args], { cwd: root, on });

  const entries = parseStatus(statusText);
  const shown = entries.slice(0, fileLimit);
  const tracked = shown.some((entry) => !entry.fresh);
  const head = tracked ? await git(['rev-parse', '--verify', 'HEAD']) : null;
  const hasHead = head?.code === 0;
  const outputs = tracked ? await countOutputs(git, hasHead) : [];

  return {
    root,
    on,
    hasHead,
    files: mergeNumstat(shown, outputs),
    limited: entries.length > fileLimit,
  };
};

export const commitAll = async (
  run: RunCommand,
  root: string,
  on: string | null,
  message: string,
): Promise<void> => {
  const add = await run('git', ['add', '-A'], { cwd: root, on });

  if (add.code !== 0) {
    throw new Error((add.stderr || add.stdout).trim());
  }

  const commit = await run('git', ['commit', '-m', message], { cwd: root, on });

  if (commit.code !== 0) {
    throw new Error((commit.stderr || commit.stdout).trim());
  }
};
