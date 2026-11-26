import { describe, expect, test } from 'bun:test';

import type { Status } from 'herdr';

import type { RiskKind } from './grove.ts';
import {
  addArguments,
  failureText,
  isWorkspaceWorktree,
  removeArguments,
  removeRisks,
  workspaceRoot,
  worktreeFolder,
} from './grove.ts';

describe('grove workspace', () => {
  test('the workspace root is the parent of a .bare common dir', () => {
    expect(workspaceRoot('/work/repo/.bare\n')).toBe('/work/repo');
    expect(workspaceRoot('/work/repo/.bare/')).toBe('/work/repo');
  });

  test('the workspace root ignores several trailing slashes on the common dir', () => {
    expect(workspaceRoot('/work/repo/.bare//')).toBe('/work/repo');
  });

  test('a common dir that is not .bare is outside a Grove workspace', () => {
    expect(workspaceRoot('/work/repo/.git')).toBeNull();
    expect(workspaceRoot('/work/repo.bare')).toBeNull();
  });

  test('a checkout directly under the workspace root is a workspace worktree', () => {
    expect(isWorkspaceWorktree('/work/repo/feat-a', '/work/repo')).toBe(true);
    expect(isWorkspaceWorktree('/work/repo/feat-a//', '/work/repo/')).toBe(true);
  });

  test('a checkout outside the workspace root or nested deeper is not a workspace worktree', () => {
    expect(isWorkspaceWorktree('/elsewhere/feat-a', '/work/repo')).toBe(false);
    expect(isWorkspaceWorktree('/work/repo/nested/feat-a', '/work/repo')).toBe(false);
    expect(isWorkspaceWorktree('/work/repo', '/work/repo')).toBe(false);
    expect(isWorkspaceWorktree('/work/repository/feat-a', '/work/repo')).toBe(false);
  });
});

describe('remove risks', () => {
  const cases: {
    label: string;
    dirty: boolean;
    status: Status | null | undefined;
    risks: RiskKind[];
  }[] = [
    { label: 'dirty without an agent', dirty: true, status: null, risks: ['changes'] },
    { label: 'dirty with an agent', dirty: true, status: 'working', risks: ['changes', 'agent'] },
    { label: 'clean and idle', dirty: false, status: 'idle', risks: ['agent'] },
    { label: 'clean and done', dirty: false, status: 'done', risks: ['agent'] },
    { label: 'clean without an agent', dirty: false, status: null, risks: [] },
    { label: 'clean with no status', dirty: false, status: undefined, risks: [] },
  ];

  test.each(cases)('$label', ({ dirty, status, risks }) => {
    expect(removeRisks(dirty, status)).toEqual(risks);
  });
});

describe('grove arguments', () => {
  test('add names the branch as a positional argument', () => {
    expect(addArguments('feat/b')).toEqual({ kind: 'arguments', args: ['add', 'feat/b'] });
  });

  test('remove passes --force only when asked', () => {
    expect(removeArguments('feat-a', true)).toEqual({
      kind: 'arguments',
      args: ['remove', '--force', 'feat-a'],
    });

    expect(removeArguments('feat-a', false)).toEqual({
      kind: 'arguments',
      args: ['remove', 'feat-a'],
    });
  });

  test('a branch that starts with a dash is refused', () => {
    expect(addArguments('-x')).toEqual({ kind: 'refused', name: '-x', role: 'branch' });
  });

  test('a worktree name that starts with a dash is refused', () => {
    expect(removeArguments('-a', true)).toEqual({ kind: 'refused', name: '-a', role: 'worktree' });
  });
});

describe('worktree folder', () => {
  const listing = [
    `worktree /work/repo/.bare\0bare\0\0`,
    `worktree /work/repo/feat-b\0HEAD 2222222\0branch refs/heads/feat/b\0\0`,
    `worktree /work/repo/feat-bb\0HEAD 3333333\0branch refs/heads/feat/bb\0\0`,
  ].join('');

  test('finds the folder that checks out the branch', () => {
    expect(worktreeFolder(listing, 'feat/b')).toBe('/work/repo/feat-b');
    expect(worktreeFolder(listing, 'feat/bb')).toBe('/work/repo/feat-bb');
  });

  test('finds nothing for a branch no worktree checks out', () => {
    expect(worktreeFolder(listing, 'feat')).toBeNull();
  });

  test('a record without its own folder does not borrow the folder of the record before it', () => {
    const malformed = [
      `worktree /work/repo/feat-b\0HEAD 2222222\0branch refs/heads/feat/b\0\0`,
      `branch refs/heads/feat/c\0\0`,
    ].join('');

    expect(worktreeFolder(malformed, 'feat/c')).toBeNull();
  });

  test('keeps a folder path and branch with a non-ASCII character whole', () => {
    const unicode = [
      `worktree /work/repo/.bare\0bare\0\0`,
      `worktree /work/repo/wt ü\0HEAD 4444444\0branch refs/heads/feat/ü\0\0`,
    ].join('');

    expect(worktreeFolder(unicode, 'feat/ü')).toBe('/work/repo/wt ü');
  });

  test('keeps a folder path with a newline whole', () => {
    const newline = [
      `worktree /work/repo/.bare\0bare\0\0`,
      `worktree /work/repo/two\nlines\0HEAD 5555555\0branch refs/heads/feat/nl\0\0`,
    ].join('');

    expect(worktreeFolder(newline, 'feat/nl')).toBe('/work/repo/two\nlines');
  });
});

describe('failure text', () => {
  test('prefers stderr, then stdout, then the fallback', () => {
    expect(failureText({ code: 1, stdout: 'out', stderr: ' err\n' }, 'failed')).toBe('err');
    expect(failureText({ code: 1, stdout: 'out\n', stderr: '' }, 'failed')).toBe('out');
    expect(failureText({ code: 1, stdout: ' ', stderr: '' }, 'failed')).toBe('failed');
  });

  test('uses stdout when stderr holds only whitespace', () => {
    expect(failureText({ code: 1, stdout: 'out', stderr: '\n' }, 'failed')).toBe('out');
  });
});
