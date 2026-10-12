import { expect, it } from 'bun:test';

import { parseCommand, usage } from './parse.ts';

it('parses no command as the default command, with an optional socket', () => {
  expect(parseCommand([])).toEqual({ kind: 'default', socket: undefined });

  expect(parseCommand(['--socket', '/tmp/phi.sock'])).toEqual({
    kind: 'default',
    socket: '/tmp/phi.sock',
  });
});

it('refuses --json on the default command', () => {
  expect(typeof parseCommand(['--json'])).toBe('string');
});

it('lists phi, phi attach, and phi detach in the usage', () => {
  const lines = usage.split('\n').map((line) => line.trim());

  expect(lines).toContain('phi [--socket <path>]');
  expect(lines).toContain('phi attach [--socket <path>]');
  expect(lines).toContain('phi detach [--socket <path>] [--json]');
});
