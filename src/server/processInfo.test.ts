import { expect, it } from 'bun:test';

import { readPaneProcesses, readProcessFolder, splitCommandLine } from './processInfo.ts';

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
