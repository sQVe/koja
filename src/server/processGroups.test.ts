import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { parseStat, sessionGroups } from './processGroups.ts';

// Starts a shell whose background job leads a new process group in the session of this process.
// Job control gives the job a group of its own. The shell prints the group and waits.
const startGroupLeader = async () => {
  const shell = Bun.spawn(['bash', '-c', 'set -m; sleep 60 & echo $!; wait'], {
    stdout: 'pipe',
    stderr: 'ignore',
  });

  const reader = shell.stdout.getReader();
  const { value } = await reader.read();

  reader.releaseLock();

  const group = Number(new TextDecoder().decode(value).trim());

  return {
    group,
    stop: () => {
      process.kill(group);
      shell.kill();
    },
  };
};

it.each(['S', 'R', 'Z', 'X'])('reads process state %s from field 3', (state) => {
  const line = `4242 (sleep) ${state} 4200 4242 4200 34817 4242 0 0 0 0 0 0 0 0 0 0 0 0 0 987654 0`;

  expect(parseStat(line)).toMatchObject({ state });
});

it('reads the process start time from field 22', () => {
  const line = '4242 (sleep) S 4200 4242 4200 34817 4242 0 0 0 0 0 0 0 0 0 0 0 0 0 987654 0';

  expect(parseStat(line)).toEqual({
    group: 4242,
    session: 4200,
    terminalGroup: 4242,
    startTime: 987654,
    state: 'S',
  });
});

it('reads the process group and session after the command name', () => {
  expect(
    parseStat('4242 (sleep) S 4200 4242 4200 34817 4242 4194304 99 0 0 0 0 0 0 0 0 0 0 0 123'),
  ).toEqual({
    group: 4242,
    session: 4200,
    terminalGroup: 4242,
    startTime: 123,
    state: 'S',
  });
});

it('reads a command name that holds spaces and parentheses', () => {
  expect(parseStat('17 (a) b (c)) R 1 23 19 0 -1 0 0 0 0 0 0 0 0 0 0 0 0 0 456')).toEqual({
    group: 23,
    session: 19,
    terminalGroup: -1,
    startTime: 456,
    state: 'R',
  });
});

it('refuses a process state longer than one character', () => {
  expect(parseStat('17 (sh) invalid 1 23 19 0 -1 0 0 0 0 0 0 0 0 0 0 0 0 0 456')).toBeUndefined();
});

it('refuses a line without a command name', () => {
  expect(parseStat('17 R 1 23 19 0 5')).toBeUndefined();
});

it.each([
  ['process group', '17 (sh) R 1 abc 19 0 5'],
  ['session', '17 (sh) R 1 23 abc 0 5'],
  ['terminal group', '17 (sh) R 1 23 19 0 abc'],
])('refuses a line with a %s that is not a number', (_name, line) => {
  expect(parseStat(line)).toBeUndefined();
});

it('refuses a line cut off before the session', () => {
  expect(parseStat('17 (sh) R 1 23')).toBeUndefined();
});

it('refuses a line cut off before the terminal group', () => {
  expect(parseStat('17 (sh) R 1 23 19 0')).toBeUndefined();
});

it.each(['', 'abc', '-1', '1.5', '9007199254740992'])(
  'refuses an invalid start time %s',
  (startTime) => {
    expect(
      parseStat(`17 (sh) R 1 23 19 0 -1 0 0 0 0 0 0 0 0 0 0 0 0 0 ${startTime}`),
    ).toBeUndefined();
  },
);

it('finds the process group of this process in its session', () => {
  const own = parseStat(readFileSync('/proc/self/stat', 'utf8'));

  if (own === undefined) {
    throw new Error('Cannot read this process.');
  }

  expect(sessionGroups(own.session)).toContain(own.group);
});

it('finds no process group in a session that has no processes', () => {
  expect(sessionGroups(0x7f_ff_ff_ff)).toEqual([]);
});

it('finds the process group of another process in the session', async () => {
  const own = parseStat(readFileSync('/proc/self/stat', 'utf8'));

  if (own === undefined) {
    throw new Error('Cannot read this process.');
  }

  const leader = await startGroupLeader();

  try {
    expect(leader.group).not.toBe(own.group);
    expect(sessionGroups(own.session)).toContain(leader.group);
  } finally {
    leader.stop();
  }
});
