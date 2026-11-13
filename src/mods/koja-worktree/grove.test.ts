import { describe, expect, test } from 'bun:test';

import { baseName, failureText, removeRisk, workspaceRoot, worktreeFolder } from './grove.ts';

describe('grove workspace', () => {
  test('the workspace root is the parent of a .bare common dir', () => {
    expect(workspaceRoot('/work/repo/.bare\n')).toBe('/work/repo');
    expect(workspaceRoot('/work/repo/.bare/')).toBe('/work/repo');
  });

  test('a common dir that is not .bare is outside a Grove workspace', () => {
    expect(workspaceRoot('/work/repo/.git')).toBeNull();
    expect(workspaceRoot('/work/repo.bare')).toBeNull();
  });

  test('a worktree is named by its folder', () => {
    expect(baseName('/work/repo/feat-a/')).toBe('feat-a');
  });
});

describe('remove risk', () => {
  test.each([
    { dirty: true, status: null, risk: 'changes' },
    { dirty: true, status: 'working', risk: 'changes' },
    { dirty: false, status: 'idle', risk: 'agent' },
    { dirty: false, status: 'done', risk: 'agent' },
    { dirty: false, status: null, risk: null },
    { dirty: false, status: undefined, risk: null },
  ] as const)('dirty $dirty with status $status is $risk', ({ dirty, status, risk }) => {
    expect(removeRisk(dirty, status)).toBe(risk);
  });
});

describe('worktree folder', () => {
  const listing = [
    'worktree /work/repo/.bare',
    'bare',
    '',
    'worktree /work/repo/feat-b',
    'HEAD 2222222',
    'branch refs/heads/feat/b',
    '',
    'worktree /work/repo/feat-bb',
    'HEAD 3333333',
    'branch refs/heads/feat/bb',
    '',
  ].join('\n');

  test('finds the folder that checks out the branch', () => {
    expect(worktreeFolder(listing, 'feat/b')).toBe('/work/repo/feat-b');
    expect(worktreeFolder(listing, 'feat/bb')).toBe('/work/repo/feat-bb');
  });

  test('finds nothing for a branch no worktree checks out', () => {
    expect(worktreeFolder(listing, 'feat')).toBeNull();
  });
});

describe('failure text', () => {
  test('prefers stderr, then stdout, then the fallback', () => {
    expect(failureText({ code: 1, stdout: 'out', stderr: ' err\n' }, 'failed')).toBe('err');
    expect(failureText({ code: 1, stdout: 'out\n', stderr: '' }, 'failed')).toBe('out');
    expect(failureText({ code: 1, stdout: ' ', stderr: '' }, 'failed')).toBe('failed');
  });
});
