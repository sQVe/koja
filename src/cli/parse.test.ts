import { expect, it } from 'bun:test';

import { paneId, workspaceId } from '../ids.ts';
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

it('parses the workspace commands', () => {
  const socket = undefined;

  expect(parseCommand(['workspace', 'list', '--json'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'list' },
    json: true,
    socket,
  });

  expect(parseCommand(['workspace', 'create', 'work/api', '--label', 'API'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'create', directory: 'work/api', label: 'API' },
    json: false,
    socket,
  });

  expect(parseCommand(['workspace', 'create', 'work/api'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'create', directory: 'work/api', label: undefined },
    json: false,
    socket,
  });

  expect(parseCommand(['workspace', 'focus', 'workspace-2'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'focus', workspaceId: workspaceId(2) },
    json: false,
    socket,
  });

  expect(parseCommand(['workspace', 'rename', 'workspace-2', 'docs'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'rename', workspaceId: workspaceId(2), label: 'docs' },
    json: false,
    socket,
  });

  expect(parseCommand(['workspace', 'close', 'workspace-2', '--socket', '/tmp/p.sock'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'close', workspaceId: workspaceId(2) },
    json: false,
    socket: '/tmp/p.sock',
  });
});

it.each([
  ['an unknown action', ['workspace', 'open']],
  ['no action', ['workspace']],
  ['arguments for list', ['workspace', 'list', 'extra']],
  ['no directory for create', ['workspace', 'create']],
  ['two directories for create', ['workspace', 'create', 'a', 'b']],
  ['an empty label', ['workspace', 'create', 'a', '--label', '']],
  ['an empty directory', ['workspace', 'create', '']],
  ['a label for focus', ['workspace', 'focus', 'workspace-1', '--label', 'x']],
  ['no id for focus', ['workspace', 'focus']],
  ['a malformed id for focus', ['workspace', 'focus', 'pane-1']],
  ['an id with a leading zero', ['workspace', 'close', 'workspace-01']],
  ['no id for close', ['workspace', 'close']],
  ['no label for rename', ['workspace', 'rename', 'workspace-1']],
  ['an empty label for rename', ['workspace', 'rename', 'workspace-1', '']],
  ['a malformed id for rename', ['workspace', 'rename', '1', 'docs']],
  ['--label on a server command', ['server', 'start', '--label', 'x']],
  ['--label on the default command', ['--label', 'x']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('parses pane list, and the pane target of read and send', () => {
  expect(parseCommand(['pane', 'list', '--json'])).toEqual({
    kind: 'pane',
    pane: { action: 'list' },
    json: true,
    socket: undefined,
  });

  expect(parseCommand(['pane', 'read'])).toEqual({
    kind: 'pane',
    pane: { action: 'read', pane: undefined },
    json: false,
    socket: undefined,
  });

  expect(parseCommand(['pane', 'read', '--pane', 'pane-3'])).toEqual({
    kind: 'pane',
    pane: { action: 'read', pane: paneId(3) },
    json: false,
    socket: undefined,
  });

  expect(parseCommand(['pane', 'send', 'ls', '--pane', 'pane-3'])).toEqual({
    kind: 'pane',
    pane: { action: 'send', text: 'ls', pane: paneId(3) },
    json: false,
    socket: undefined,
  });
});

it.each([
  ['a malformed pane id', ['pane', 'read', '--pane', 'workspace-1']],
  ['a pane id without a number', ['pane', 'send', 'ls', '--pane', 'pane-']],
  ['--pane without a value', ['pane', 'read', '--pane']],
  ['--pane on pane list', ['pane', 'list', '--pane', 'pane-1']],
  ['arguments for pane list', ['pane', 'list', 'extra']],
  ['text for pane read', ['pane', 'read', 'text']],
  ['no text for pane send', ['pane', 'send', '--pane', 'pane-1']],
  ['--pane on a workspace command', ['workspace', 'list', '--pane', 'pane-1']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('lists the workspace and pane commands in the usage', () => {
  const lines = usage.split('\n').map((line) => line.trim());

  expect(lines).toContain('phi workspace list [--socket <path>] [--json]');
  expect(lines).toContain('phi pane list [--socket <path>] [--json]');
  expect(lines).toContain('phi pane read [--pane <id>] [--socket <path>] [--json]');
});
