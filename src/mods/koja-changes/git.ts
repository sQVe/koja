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

export const readFlags = [
  '--no-optional-locks',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.autoRefreshIndex=false',
];

const fileLimit = 1000;

export const readChanges = async (
  run: RunCommand,
  cwd: string,
  on: string | null,
  isCurrent: () => boolean,
): Promise<ReadOutcome | null> => {
  const identity = await readGitIdentity(run, on, cwd);

  if (!isCurrent()) {
    return null;
  }

  if (identity.kind === 'failed') {
    throw new Error(identity.error);
  }

  if (identity.kind === 'none' || identity.kind === 'bare') {
    return { failure: 'Not a git repository' };
  }

  const root = identity.worktree.top;

  const git = (args: string[]): Promise<ExecResult> =>
    run('git', [...readFlags, ...args], { cwd: root, on });

  const status = await git([
    'status',
    '--porcelain=v1',
    '-z',
    '--no-renames',
    '--untracked-files=all',
  ]);

  if (status.code !== 0) {
    throw new Error(status.stderr);
  }

  const head = await git(['rev-parse', '--verify', 'HEAD']);
  const outputs: string[] = [];

  const collect = async (args: string[]): Promise<void> => {
    const result = await git(args);

    if (result.code !== 0) {
      throw new Error(result.stderr);
    }

    outputs.push(result.stdout);
  };

  if (head.code === 0) {
    await collect(['diff', 'HEAD', '--numstat', '-z', '--no-renames']);
  } else {
    await collect(['diff', '--cached', '--numstat', '-z', '--no-renames']);
    await collect(['diff', '--numstat', '-z', '--no-renames']);
  }

  const entries = parseStatus(status.stdout);

  return {
    snapshot: {
      root,
      on,
      hasHead: head.code === 0,
      files: mergeNumstat(entries.slice(0, fileLimit), outputs),
      limited: entries.length > fileLimit,
    },
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
