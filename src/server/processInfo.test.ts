import { expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readFollowFolder,
  readPaneProcesses,
  readProcessFolder,
  readSavedFolder,
  splitCommandLine,
} from './processInfo.ts';

const missingPid = 0x7f_ff_ff_ff;

it('splits a command line on NUL and drops the trailing empty field', () => {
  expect(splitCommandLine('sleep\u000060\u0000')).toEqual(['sleep', '60']);
});

it('keeps an empty argument inside a command line', () => {
  expect(splitCommandLine('echo\u0000\u0000x\u0000')).toEqual(['echo', '', 'x']);
});

it('gives no arguments for an empty command line', () => {
  expect(splitCommandLine('')).toEqual([]);
});

it('reads the folder of this process', () => {
  expect(readProcessFolder(process.pid)).toBe(process.cwd());
});

it('gives no folder or processes for a pid without a /proc entry', () => {
  expect(readProcessFolder(missingPid)).toBeUndefined();

  expect(readPaneProcesses(missingPid)).toEqual({
    shellPid: missingPid,
    cwd: undefined,
    foregroundGroup: undefined,
    foregroundCwd: undefined,
    foregroundProcesses: [],
  });
});

it('follows the folder of this process when the folder is enterable', () => {
  expect(readFollowFolder(process.pid)).toBe(process.cwd());
});

it('has no follow folder for a pid without a /proc entry', () => {
  expect(readFollowFolder(missingPid)).toBeUndefined();
});

const withSleepIn = (folder: string, run: (pid: number) => void): void => {
  const child = Bun.spawn(['sleep', '60'], { cwd: folder });

  try {
    run(child.pid);
  } finally {
    child.kill();
  }
};

it('saves the original path of a deleted folder', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'koja-saved-')));

  try {
    mkdirSync(join(root, 'work'));
    mkdirSync(join(root, 'work (deleted)'));

    withSleepIn(join(root, 'work'), (pid) => {
      rmSync(join(root, 'work'), { recursive: true });

      expect(readSavedFolder(pid)).toBe(join(root, 'work'));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('saves a live folder whose name ends in (deleted) as it is', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'koja-saved-')));
  const live = join(root, 'live (deleted)');

  try {
    mkdirSync(live);

    withSleepIn(live, (pid) => {
      expect(readSavedFolder(pid)).toBe(live);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('saves no folder for a pid without a /proc entry', () => {
  expect(readSavedFolder(missingPid)).toBeUndefined();
});
