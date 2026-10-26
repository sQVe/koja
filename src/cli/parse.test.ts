import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { parseCommand, usage } from './parse.ts';

it('parses no command as the default command, with an optional socket', () => {
  expect(parseCommand([])).toEqual({ kind: 'default', socket: undefined });

  expect(parseCommand(['--socket', '/tmp/koja.sock'])).toEqual({
    kind: 'default',
    socket: '/tmp/koja.sock',
  });
});

it('refuses --json on the default command', () => {
  expect(typeof parseCommand(['--json'])).toBe('string');
});

it('lists koja, koja attach, and koja detach in the usage', () => {
  const lines = usage.split('\n').map((line) => line.trim());

  expect(lines).toContain('koja [--socket <path>]');
  expect(lines).toContain('koja attach [--socket <path>]');
  expect(lines).toContain('koja detach [--client <id>] [--socket <path>] [--json]');
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
    workspace: { action: 'create', directory: 'work/api', label: 'API', focus: false },
    json: true,
    socket,
  });

  expect(parseCommand(['workspace', 'create', 'work/api'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'create', directory: 'work/api', label: undefined, focus: false },
    json: true,
    socket,
  });

  expect(parseCommand(['workspace', 'focus', 'workspace-2'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'focus', workspaceId: workspaceId(2) },
    json: true,
    socket,
  });

  expect(parseCommand(['workspace', 'rename', 'workspace-2', 'docs'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'rename', workspaceId: workspaceId(2), label: 'docs' },
    json: true,
    socket,
  });

  expect(parseCommand(['workspace', 'close', 'workspace-2', '--socket', '/tmp/p.sock'])).toEqual({
    kind: 'workspace',
    workspace: { action: 'close', workspaceId: workspaceId(2) },
    json: true,
    socket: '/tmp/p.sock',
  });
});

it.each([
  [['--focus'], true],
  [['--no-focus'], false],
  [['--focus', '--no-focus'], false],
  [['--no-focus', '--focus'], true],
])('parses %j on workspace create', (flags, focus) => {
  expect(parseCommand(['workspace', 'create', 'work/api', ...flags])).toEqual({
    kind: 'workspace',
    workspace: { action: 'create', directory: 'work/api', label: undefined, focus },
    json: true,
    socket: undefined,
  });
});

it('parses the tab commands', () => {
  const options = { json: true, socket: undefined };

  expect(parseCommand(['tab', 'list'])).toEqual({
    kind: 'tab',
    tab: { action: 'list' },
    ...options,
  });

  expect(parseCommand(['tab', 'create'])).toEqual({
    kind: 'tab',
    tab: { action: 'create', workspaceId: undefined, cwd: undefined, focus: false },
    ...options,
  });

  expect(parseCommand(['tab', 'create', '--workspace', 'workspace-2', '--json'])).toEqual({
    kind: 'tab',
    tab: { action: 'create', workspaceId: workspaceId(2), cwd: undefined, focus: false },
    json: true,
    socket: undefined,
  });

  expect(parseCommand(['tab', 'focus', 'tab-3'])).toEqual({
    kind: 'tab',
    tab: { action: 'focus', tabId: tabId(3) },
    ...options,
  });

  expect(parseCommand(['tab', 'rename', 'tab-3', 'build'])).toEqual({
    kind: 'tab',
    tab: { action: 'rename', tabId: tabId(3), label: 'build' },
    ...options,
  });

  expect(parseCommand(['tab', 'close', 'tab-3'])).toEqual({
    kind: 'tab',
    tab: { action: 'close', tabId: tabId(3) },
    ...options,
  });
});

it.each([
  [['tab', 'create', '--focus'], true],
  [['tab', 'create', '--no-focus'], false],
  [['tab', 'create', '--focus', '--no-focus'], false],
  [['tab', 'create', '--no-focus', '--focus'], true],
])('parses %j with focus %p', (argv, focus) => {
  expect(parseCommand(argv)).toMatchObject({ tab: { action: 'create', focus } });
});

it.each([
  ['tab focus', ['tab', 'focus', 'tab-1', '--focus']],
  ['tab focus', ['tab', 'focus', 'tab-1', '--no-focus']],
  ['workspace list', ['workspace', 'list', '--focus']],
  ['another group', ['pane', 'list', '--focus']],
])('refuses --focus on %s', (_name, argv) => {
  expect(parseCommand(argv)).toContain('belong to workspace create and tab create');
});

it.each([
  ['a workspace id as a tab id', ['tab', 'focus', 'workspace-1']],
  ['no tab id', ['tab', 'close']],
  ['no label for tab rename', ['tab', 'rename', 'tab-1']],
  ['an empty label for tab rename', ['tab', 'rename', 'tab-1', '']],
  ['a bad tab id for tab rename', ['tab', 'rename', '1', 'build']],
  ['an unknown action', ['tab', 'open']],
  ['--workspace on tab focus', ['tab', 'focus', 'tab-1', '--workspace', 'workspace-1']],
  ['--workspace on another group', ['workspace', 'list', '--workspace', 'workspace-1']],
  ['a bad workspace id', ['tab', 'create', '--workspace', 'tab-1']],
])('rejects %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
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
  ['--background on workspace create', ['workspace', 'create', 'work/api', '--background']],
  ['--focus on workspace focus', ['workspace', 'focus', 'workspace-1', '--focus']],
  ['--no-focus on workspace focus', ['workspace', 'focus', 'workspace-1', '--no-focus']],
  ['--focus on a pane command', ['pane', 'list', '--focus']],
  ['--no-focus on a pane command', ['pane', 'list', '--no-focus']],
  ['--focus on a server command', ['server', 'start', '--focus']],
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

  expect(parseCommand(['pane', 'read', 'pane-3'])).toEqual({
    kind: 'pane',
    pane: { action: 'read', pane: paneId(3), source: 'recent', lines: undefined, range: undefined },
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

it('parses pane split, focus, and close with the pane id as an argument', () => {
  expect(parseCommand(['pane', 'split', 'pane-2', '--direction', 'below', '--json'])).toEqual({
    kind: 'pane',
    pane: { action: 'split', pane: paneId(2), direction: 'below', cwd: undefined },
    json: true,
    socket: undefined,
  });

  expect(parseCommand(['pane', 'split', 'pane-2', '--direction', 'right'])).toEqual({
    kind: 'pane',
    pane: { action: 'split', pane: paneId(2), direction: 'right', cwd: undefined },
    json: true,
    socket: undefined,
  });

  expect(parseCommand(['pane', 'focus', 'pane-3'])).toEqual({
    kind: 'pane',
    pane: { action: 'focus', pane: paneId(3) },
    json: true,
    socket: undefined,
  });

  expect(parseCommand(['pane', 'close', 'pane-3', '--socket', '/tmp/p.sock'])).toEqual({
    kind: 'pane',
    pane: { action: 'close', pane: paneId(3) },
    json: true,
    socket: '/tmp/p.sock',
  });
});

it.each([
  ['--tab', ['--tab', 'tab-2'], { kind: 'tab', tabId: tabId(2) }],
  ['--new-tab', ['--new-tab'], { kind: 'newTab' }],
  ['--new-workspace', ['--new-workspace'], { kind: 'newWorkspace' }],
] as const)('parses pane move with %s', (_name, flags, destination) => {
  expect(parseCommand(['pane', 'move', 'pane-2', ...flags, '--json'])).toEqual({
    kind: 'pane',
    pane: { action: 'move', pane: paneId(2), destination },
    json: true,
    socket: undefined,
  });
});

it('names the missing destination and the several destinations of pane move in turn', () => {
  expect(parseCommand(['pane', 'move', 'pane-1'])).toBe(
    'pane move takes one of --tab, --new-tab, or --new-workspace.',
  );

  expect(parseCommand(['pane', 'move', 'pane-1', '--new-tab', '--new-workspace'])).toBe(
    'pane move takes only one of --tab, --new-tab, or --new-workspace.',
  );
});

it.each([
  ['no id for move', ['pane', 'move', '--new-tab']],
  ['a malformed id for move', ['pane', 'move', 'tab-1', '--new-tab']],
  ['a malformed tab id', ['pane', 'move', 'pane-1', '--tab', 'pane-1']],
  ['--tab with --new-tab', ['pane', 'move', 'pane-1', '--tab', 'tab-1', '--new-tab']],
  ['--pane on move', ['pane', 'move', 'pane-1', '--new-tab', '--pane', 'pane-1']],
  ['--direction on move', ['pane', 'move', 'pane-1', '--new-tab', '--direction', 'right']],
  ['--new-tab on pane close', ['pane', 'close', 'pane-1', '--new-tab']],
  ['--tab on pane read', ['pane', 'read', '--tab', 'tab-1']],
  ['--new-workspace on tab create', ['tab', 'create', '--new-workspace']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('parses pane process-info with the pane id as an argument', () => {
  expect(parseCommand(['pane', 'process-info', 'pane-1', '--json'])).toEqual({
    kind: 'pane',
    pane: { action: 'process-info', pane: paneId(1) },
    json: true,
    socket: undefined,
  });
});

it.each([
  ['no id for process-info', ['pane', 'process-info']],
  ['a malformed id for process-info', ['pane', 'process-info', 'tab-1']],
  ['two ids for process-info', ['pane', 'process-info', 'pane-1', 'pane-2']],
  ['--pane on process-info', ['pane', 'process-info', 'pane-1', '--pane', 'pane-1']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('parses pane zoom and pane resize', () => {
  expect(parseCommand(['pane', 'zoom', 'pane-2', '--json'])).toEqual({
    kind: 'pane',
    pane: { action: 'zoom', pane: paneId(2) },
    json: true,
    socket: undefined,
  });

  expect(
    parseCommand(['pane', 'resize', 'pane-2', '--direction', 'left', '--cells', '12']),
  ).toEqual({
    kind: 'pane',
    pane: { action: 'resize', pane: paneId(2), direction: 'left', cells: 12 },
    json: true,
    socket: undefined,
  });

  for (const direction of ['right', 'up', 'down'] as const) {
    expect(
      parseCommand(['pane', 'resize', 'pane-1', '--cells', '1', '--direction', direction]),
    ).toMatchObject({ pane: { action: 'resize', direction, cells: 1 } });
  }
});

it.each([
  ['no id for zoom', ['pane', 'zoom']],
  ['a malformed id for zoom', ['pane', 'zoom', 'tab-1']],
  ['a direction for zoom', ['pane', 'zoom', 'pane-1', '--direction', 'left']],
  ['cells for zoom', ['pane', 'zoom', 'pane-1', '--cells', '2']],
  ['cells for split', ['pane', 'split', 'pane-1', '--direction', 'right', '--cells', '2']],
  ['cells for pane list', ['pane', 'list', '--cells', '2']],
  ['cells on a workspace command', ['workspace', 'list', '--cells', '2']],
  ['no id for resize', ['pane', 'resize', '--direction', 'left', '--cells', '2']],
  ['no direction for resize', ['pane', 'resize', 'pane-1', '--cells', '2']],
  [
    'an invalid direction for resize',
    ['pane', 'resize', 'pane-1', '--direction', 'below', '--cells', '2'],
  ],
  [
    'an empty direction for resize',
    ['pane', 'resize', 'pane-1', '--direction', '', '--cells', '2'],
  ],
  ['left for split', ['pane', 'split', 'pane-1', '--direction', 'left']],
  ['no cells for resize', ['pane', 'resize', 'pane-1', '--direction', 'left']],
  ['zero cells', ['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', '0']],
  ['negative cells', ['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', '-3']],
  ['fractional cells', ['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', '1.5']],
  ['non-numeric cells', ['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', 'many']],
  ['empty cells', ['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', '']],
  [
    'cells past the safe integers',
    ['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', '9007199254740993'],
  ],
  [
    '--pane on pane resize',
    ['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', '2', '--pane', 'pane-1'],
  ],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each([
  ['no id for split', ['pane', 'split', '--direction', 'right']],
  ['no id for focus', ['pane', 'focus']],
  ['no id for close', ['pane', 'close']],
  ['a malformed id for split', ['pane', 'split', 'tab-1', '--direction', 'right']],
  ['a malformed id for focus', ['pane', 'focus', 'workspace-1']],
  ['a malformed id for close', ['pane', 'close', 'pane-01']],
  ['two ids for focus', ['pane', 'focus', 'pane-1', 'pane-2']],
  ['no direction for split', ['pane', 'split', 'pane-1']],
  ['an invalid direction', ['pane', 'split', 'pane-1', '--direction', 'left']],
  ['an empty direction', ['pane', 'split', 'pane-1', '--direction', '']],
  ['a direction for focus', ['pane', 'focus', 'pane-1', '--direction', 'right']],
  ['a direction for pane read', ['pane', 'read', 'pane-1', '--direction', 'right']],
  ['a direction on a workspace command', ['workspace', 'list', '--direction', 'right']],
  ['--pane on pane split', ['pane', 'split', 'pane-1', '--direction', 'right', '--pane', 'pane-1']],
  ['--pane on pane close', ['pane', 'close', 'pane-1', '--pane', 'pane-1']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each([
  ['a malformed pane id for send', ['pane', 'send', 'ls', '--pane', 'workspace-1']],
  ['no id for pane read', ['pane', 'read']],
  ['--pane on pane read', ['pane', 'read', '--pane', 'pane-3']],
  ['--pane on pane read with an id', ['pane', 'read', 'pane-3', '--pane', 'pane-3']],
  ['a malformed id for pane read', ['pane', 'read', 'workspace-1']],
  ['a padded id for pane read', ['pane', 'read', 'pane-03']],
  ['two ids for pane read', ['pane', 'read', 'pane-1', 'pane-2']],
  ['a pane id without a number', ['pane', 'send', 'ls', '--pane', 'pane-']],
  ['--pane without a value', ['pane', 'send', 'ls', '--pane']],
  ['--pane on pane list', ['pane', 'list', '--pane', 'pane-1']],
  ['arguments for pane list', ['pane', 'list', 'extra']],
  ['no text for pane send', ['pane', 'send', '--pane', 'pane-1']],
  ['--pane on a workspace command', ['workspace', 'list', '--pane', 'pane-1']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('lists the workspace and pane commands in the usage', () => {
  const lines = usage.split('\n').map((line) => line.trim());

  expect(lines).toContain('koja workspace list [--socket <path>] [--json]');
  expect(lines).toContain('koja pane list [--socket <path>] [--json]');

  expect(lines).toContain(
    'koja pane read <id> [--source visible|recent|recent-unwrapped] [--lines <n>]',
  );

  expect(lines).toContain('[--from <row> --to <row>] [--socket <path>] [--json]');

  expect(lines).toContain(
    'koja pane split <id> --direction below|right [--cwd <dir>] [--socket <path>] [--json]',
  );

  expect(lines).toContain('koja pane focus <id> [--socket <path>] [--json]');
  expect(lines).toContain('koja pane close <id> [--socket <path>] [--json]');
  expect(lines).toContain('koja pane zoom <id> [--socket <path>] [--json]');

  expect(lines).toContain(
    'koja pane scroll <id> --to top|bottom|<row> [--client <id>] [--socket <path>] [--json]',
  );

  expect(lines).toContain(
    'koja pane resize <id> --direction left|right|up|down --cells <n> [--socket <path>] [--json]',
  );
});

it('parses client list and detach with a client id', () => {
  expect(parseCommand(['client', 'list', '--json'])).toEqual({
    kind: 'client',
    client: { action: 'list' },
    json: true,
    socket: undefined,
  });

  expect(parseCommand(['detach', '--client', 'client-3'])).toEqual({
    kind: 'detach',
    client: clientId(3),
    json: false,
    socket: undefined,
  });

  expect(parseCommand(['detach'])).toMatchObject({ kind: 'detach', client: undefined });
});

it.each([
  ['a malformed client id', ['detach', '--client', 'pane-1']],
  ['an id with a leading zero', ['detach', '--client', 'client-01']],
  ['an empty client id', ['detach', '--client', '']],
  ['--client without a value', ['detach', '--client']],
  ['--client on another command', ['workspace', 'list', '--client', 'client-1']],
  ['an unknown client action', ['client', 'kill']],
  ['no client action', ['client']],
  ['arguments for client list', ['client', 'list', 'extra']],
])('rejects %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('parses --cwd on pane split and tab create', () => {
  expect(parseCommand(['pane', 'split', 'pane-2', '--direction', 'right', '--cwd', 'sub'])).toEqual(
    {
      kind: 'pane',
      pane: { action: 'split', pane: paneId(2), direction: 'right', cwd: 'sub' },
      json: true,
      socket: undefined,
    },
  );

  expect(parseCommand(['tab', 'create', '--cwd', '/srv', '--workspace', 'workspace-2'])).toEqual({
    kind: 'tab',
    tab: { action: 'create', workspaceId: workspaceId(2), cwd: '/srv', focus: false },
    json: true,
    socket: undefined,
  });
});

it.each([
  ['pane focus', ['pane', 'focus', 'pane-1', '--cwd', '/srv']],
  ['pane list', ['pane', 'list', '--cwd', '/srv']],
  ['tab focus', ['tab', 'focus', 'tab-1', '--cwd', '/srv']],
  ['workspace create', ['workspace', 'create', '/srv', '--cwd', '/srv']],
  [
    'an empty folder on pane split',
    ['pane', 'split', 'pane-1', '--direction', 'below', '--cwd', ''],
  ],
  ['an empty folder on tab create', ['tab', 'create', '--cwd', '']],
])('refuses --cwd on %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

const readCommand = (...flags: string[]) => parseCommand(['pane', 'read', 'pane-3', ...flags]);

it('parses the pane read source, line count, and row range', () => {
  const pane = { action: 'read', pane: paneId(3) } as const;
  const options = { json: false, socket: undefined };

  expect(readCommand('--source', 'visible')).toEqual({
    kind: 'pane',
    pane: { ...pane, source: 'visible', lines: undefined, range: undefined },
    ...options,
  });

  expect(readCommand('--source', 'recent_unwrapped', '--lines', '5')).toEqual({
    kind: 'pane',
    pane: { ...pane, source: 'recentUnwrapped', lines: 5, range: undefined },
    ...options,
  });

  expect(readCommand('--from', '0', '--to', '9', '--source', 'recent-unwrapped')).toEqual({
    kind: 'pane',
    pane: { ...pane, source: 'recentUnwrapped', lines: undefined, range: { from: 0, to: 9 } },
    ...options,
  });
});

it('clamps a line count to 1000 and accepts zero', () => {
  expect(readCommand('--lines', '5000')).toMatchObject({ pane: { lines: 1000 } });
  expect(readCommand('--lines', '0')).toMatchObject({ pane: { lines: 0 } });
});

it.each([
  ['an unknown source', ['--source', 'screen'], "'screen' is not a source"],
  ['a negative line count', ['--lines=-1'], '--lines takes a whole number'],
  ['a non-numeric line count', ['--lines', 'many'], '--lines takes a whole number'],
  ['a fractional line count', ['--lines', '1.5'], '--lines takes a whole number'],
  ['--from without --to', ['--from', '2'], '--from and --to come together.'],
  ['--to without --from', ['--to', '2'], '--from and --to come together.'],
  ['a non-numeric row', ['--from', 'a', '--to', '2'], '--from and --to take whole row numbers'],
  ['a negative row', ['--from=-1', '--to', '2'], '--from and --to take whole row numbers'],
  ['from past to', ['--from', '5', '--to', '4'], '--from cannot be greater than --to.'],
  [
    '--from with --lines',
    ['--from', '1', '--to', '2', '--lines', '3'],
    '--from and --to cannot be combined with --lines.',
  ],
  [
    '--from with the visible source',
    ['--from', '1', '--to', '2', '--source', 'visible'],
    '--from and --to cannot be combined with --source visible.',
  ],
])('refuses %s with its own error', (_name, flags, message) => {
  const result = readCommand(...flags);

  expect(typeof result === 'string' ? result : '').toContain(message);
});

it.each([
  ['pane send', ['pane', 'send', 'ls', '--lines', '3'], '--lines belongs to pane read.'],
  ['pane list', ['pane', 'list', '--lines', '3'], '--lines belongs to pane read.'],
  [
    'pane list with --source',
    ['pane', 'list', '--source', 'recent'],
    '--source belongs to pane read.',
  ],
  [
    'pane focus',
    ['pane', 'focus', 'pane-1', '--from', '1', '--to', '2'],
    '--from belongs to pane read and pane copy.',
  ],
  [
    'pane zoom',
    ['pane', 'zoom', 'pane-1', '--to', '2'],
    '--to belongs to pane read, pane scroll, and pane copy.',
  ],
  [
    'a workspace command',
    ['workspace', 'list', '--from', '1', '--to', '2'],
    '--from belongs to pane read and pane copy.',
  ],
])('refuses read flags on %s with its own error', (_name, argv, message) => {
  expect(parseCommand(argv)).toBe(message);
});

it('names only the commands that accept --pane when pane move gets it', () => {
  expect(parseCommand(['pane', 'move', 'pane-1', '--tab', 'tab-2', '--pane', 'pane-1'])).toBe(
    '--pane belongs to pane send and action run.',
  );
});

const jsonDefaultCommands = [
  ['workspace', 'list'],
  ['workspace', 'create', 'work/api'],
  ['workspace', 'focus', 'workspace-2'],
  ['workspace', 'rename', 'workspace-2', 'docs'],
  ['workspace', 'close', 'workspace-2'],
  ['tab', 'list'],
  ['tab', 'create'],
  ['tab', 'focus', 'tab-3'],
  ['tab', 'rename', 'tab-3', 'build'],
  ['tab', 'close', 'tab-3'],
  ['pane', 'list'],
  ['pane', 'split', 'pane-2', '--direction', 'below'],
  ['pane', 'focus', 'pane-3'],
  ['pane', 'zoom', 'pane-2'],
  ['pane', 'resize', 'pane-2', '--direction', 'left', '--cells', '12'],
  ['pane', 'close', 'pane-3'],
  ['pane', 'process-info', 'pane-1'],
];

it.each(jsonDefaultCommands)('prints JSON by default for %s %s', (...argv) => {
  const without = parseCommand(argv);
  const withFlag = parseCommand([...argv, '--json']);

  expect(without).toMatchObject({ json: true });
  expect(withFlag).toEqual(without);
});

it.each([[['pane', 'read', 'pane-1']], [['pane', 'send', 'ls']]])(
  'prints text by default for %j',
  (argv) => {
    expect(parseCommand(argv)).toMatchObject({ json: false });
  },
);

it('parses pane scroll to top, bottom, or a row', () => {
  expect(parseCommand(['pane', 'scroll', 'pane-2', '--to', 'top'])).toEqual({
    kind: 'pane',
    pane: { action: 'scroll', pane: paneId(2), to: 'top', client: undefined },
    json: true,
    socket: undefined,
  });

  expect(parseCommand(['pane', 'scroll', 'pane-2', '--to', 'bottom'])).toMatchObject({
    pane: { action: 'scroll', to: 'bottom' },
  });

  expect(parseCommand(['pane', 'scroll', 'pane-2', '--to', '0'])).toMatchObject({
    pane: { action: 'scroll', to: 0 },
  });

  expect(parseCommand(['pane', 'scroll', 'pane-2', '--to', '120'])).toMatchObject({
    pane: { action: 'scroll', to: 120 },
  });
});

it('parses pane scroll with a client', () => {
  expect(
    parseCommand(['pane', 'scroll', 'pane-1', '--to', 'top', '--client', 'client-3']),
  ).toMatchObject({ pane: { action: 'scroll', client: clientId(3) } });
});

it.each([
  ['no position', ['pane', 'scroll', 'pane-1']],
  ['an empty position', ['pane', 'scroll', 'pane-1', '--to', '']],
  ['a word that is not a position', ['pane', 'scroll', 'pane-1', '--to', 'middle']],
  ['a negative row', ['pane', 'scroll', 'pane-1', '--to', '-1']],
  ['a fractional row', ['pane', 'scroll', 'pane-1', '--to', '1.5']],
  ['a row too large to count', ['pane', 'scroll', 'pane-1', '--to', '99999999999999999999']],
  ['no id', ['pane', 'scroll', '--to', 'top']],
  ['a malformed id', ['pane', 'scroll', 'tab-1', '--to', 'top']],
  ['two ids', ['pane', 'scroll', 'pane-1', 'pane-2', '--to', 'top']],
  ['--pane', ['pane', 'scroll', 'pane-1', '--to', 'top', '--pane', 'pane-1']],
  ['a malformed client id', ['pane', 'scroll', 'pane-1', '--to', 'top', '--client', 'pane-1']],
  ['an empty client id', ['pane', 'scroll', 'pane-1', '--to', 'top', '--client', '']],
  ['--from', ['pane', 'scroll', 'pane-1', '--to', 'top', '--from', '1']],
  ['--cells', ['pane', 'scroll', 'pane-1', '--to', 'top', '--cells', '1']],
  ['--client on pane read', ['pane', 'read', 'pane-1', '--client', 'client-1']],
  ['--client on pane zoom', ['pane', 'zoom', 'pane-1', '--client', 'client-1']],
  ['--to on pane zoom', ['pane', 'zoom', 'pane-1', '--to', 'top']],
])('refuses pane scroll with %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('parses pane copy with a range and print', () => {
  expect(parseCommand(['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0'])).toEqual({
    kind: 'pane',
    pane: {
      action: 'copy',
      pane: paneId(1),
      start: { row: 4, column: 2 },
      end: { row: 5, column: 0 },
      print: false,
    },
    json: false,
    socket: undefined,
  });

  expect(
    parseCommand(['pane', 'copy', 'pane-1', '--from', '0:0', '--to', '0:0', '--print', '--json']),
  ).toMatchObject({ json: true, pane: { action: 'copy', print: true } });
});

it.each([
  ['no --to', ['pane', 'copy', 'pane-1', '--from', '4:2']],
  ['no --from', ['pane', 'copy', 'pane-1', '--to', '4:2']],
  ['a value without a column', ['pane', 'copy', 'pane-1', '--from', '4', '--to', '5:0']],
  ['a negative column', ['pane', 'copy', 'pane-1', '--from', '4:-1', '--to', '5:0']],
  ['a fractional row', ['pane', 'copy', 'pane-1', '--from', '1.5:0', '--to', '5:0']],
  ['three parts', ['pane', 'copy', 'pane-1', '--from', '1:2:3', '--to', '5:0']],
  ['a start after the end row', ['pane', 'copy', 'pane-1', '--from', '5:0', '--to', '4:9']],
  ['a start after the end column', ['pane', 'copy', 'pane-1', '--from', '4:3', '--to', '4:2']],
  ['no id', ['pane', 'copy', '--from', '4:2', '--to', '5:0']],
  ['--pane', ['pane', 'copy', 'pane-1', '--pane', '1', '--from', '4:2', '--to', '5:0']],
  ['--client', ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--client', 'client-1']],
  ['--lines', ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--lines', '3']],
  ['--tab', ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--tab', 'tab-1']],
  ['--new-tab', ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--new-tab']],
  [
    '--new-workspace',
    ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--new-workspace'],
  ],
  [
    '--direction',
    ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--direction', 'below'],
  ],
  ['--cwd', ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--cwd', '/tmp']],
  ['--cells', ['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '5:0', '--cells', '2']],
  ['--print on pane read', ['pane', 'read', 'pane-1', '--print']],
  ['--print on tab list', ['tab', 'list', '--print']],
])('refuses pane copy with %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each([
  ['a second pane id', ['pane', 'copy', 'pane-1', 'extra', '--from', '4:2', '--to', '5:0']],
  ['a malformed pane id', ['pane', 'copy', 'pane-x', '--from', '4:2', '--to', '5:0']],
  ['text after a row number', ['pane', 'copy', 'pane-1', '--from', '1e3:0', '--to', '2000:0']],
  ['text after a column number', ['pane', 'copy', 'pane-1', '--from', '0:0', '--to', '1:2x']],
])('refuses pane copy given %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('parses pane copy positions with several digits', () => {
  expect(
    parseCommand(['pane', 'copy', 'pane-1', '--from', '12:30', '--to', '100:7']),
  ).toMatchObject({
    pane: { start: { row: 12, column: 30 }, end: { row: 100, column: 7 } },
  });
});

it('keeps a start equal to the end', () => {
  expect(parseCommand(['pane', 'copy', 'pane-1', '--from', '4:2', '--to', '4:2'])).toMatchObject({
    pane: { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
  });
});

it('parses koja attach with an optional socket', () => {
  expect(parseCommand(['attach'])).toEqual({ kind: 'attach', socket: undefined });

  expect(parseCommand(['attach', '--socket', '/tmp/koja.sock'])).toEqual({
    kind: 'attach',
    socket: '/tmp/koja.sock',
  });
});

it.each([
  ['an argument', ['attach', 'extra']],
  ['--json', ['attach', '--json']],
])('refuses koja attach with %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it('parses koja --version with an optional --json', () => {
  expect(parseCommand(['--version'])).toEqual({ kind: 'version', json: false });
  expect(parseCommand(['--version', '--json'])).toEqual({ kind: 'version', json: true });
});

it.each([
  ['an argument', ['--version', 'extra']],
  ['a command', ['--version', 'pane', 'list']],
  ['--socket', ['--version', '--socket', '/tmp/koja.sock']],
])('refuses koja --version with %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each(['run', 'start', 'stop'] as const)('parses server %s', (action) => {
  expect(parseCommand(['server', action])).toEqual({
    kind: 'server',
    action,
    json: false,
    socket: undefined,
  });

  expect(parseCommand(['server', action, '--json', '--socket', '/tmp/p.sock'])).toEqual({
    kind: 'server',
    action,
    json: true,
    socket: '/tmp/p.sock',
  });
});

it.each([
  ['an unknown group with an action', ['nope', 'start']],
  ['an unknown group', ['nope']],
  ['an unknown server action', ['server', 'restart']],
  ['no server action', ['server']],
  ['an argument for a server action', ['server', 'start', 'extra']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each([
  ['detach', ['detach', 'extra']],
  ['tab create', ['tab', 'create', 'extra']],
  ['tab list', ['tab', 'list', 'extra']],
  ['tab focus', ['tab', 'focus', 'tab-1', 'tab-2']],
  ['tab rename', ['tab', 'rename', 'tab-1', 'a', 'b']],
  ['workspace focus', ['workspace', 'focus', 'workspace-1', 'workspace-2']],
  ['workspace rename', ['workspace', 'rename', 'workspace-1', 'a', 'b']],
  ['pane move', ['pane', 'move', 'pane-1', 'pane-2', '--new-tab']],
])('refuses an extra argument for %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each([
  ['tab', ['tab', 'open', 'tab-1']],
  ['workspace', ['workspace', 'open', 'workspace-1', 'x']],
  ['pane', ['pane', 'open', 'ls']],
])('refuses an unknown %s action that has arguments', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each([
  ['--cells on pane move', ['pane', 'move', 'pane-1', '--new-tab', '--cells', '2']],
  ['--cwd on pane move', ['pane', 'move', 'pane-1', '--new-tab', '--cwd', '/srv']],
  ['--tab on a workspace command', ['workspace', 'list', '--tab', 'tab-1']],
  ['--tab on a tab command', ['tab', 'list', '--tab', 'tab-1']],
])('refuses %s', (_name, argv) => {
  expect(typeof parseCommand(argv)).toBe('string');
});

it.each([
  ['a signed cell count', ['--cells=-3']],
  ['a cell count with a leading zero', ['--cells', '01']],
  ['a cell count with an exponent', ['--cells=1e3']],
  ['a cell count in hexadecimal', ['--cells=0x10']],
])('refuses pane resize with %s', (_name, flags) => {
  expect(typeof parseCommand(['pane', 'resize', 'pane-1', '--direction', 'left', ...flags])).toBe(
    'string',
  );
});

it.each([
  ['a signed row', ['--to=-1']],
  ['a row with an exponent', ['--to', '1e3']],
  ['a row in hexadecimal', ['--to', '0x10']],
  ['a row with a sign', ['--to=+5']],
])('refuses pane scroll with %s', (_name, flags) => {
  expect(typeof parseCommand(['pane', 'scroll', 'pane-1', ...flags])).toBe('string');
});

it.each([
  ['a signed line count', ['--lines=-1']],
  ['a line count with an exponent', ['--lines=1e3']],
  ['a signed row range end', ['--from', '1', '--to=-1']],
  ['a row range end with an exponent', ['--from', '1', '--to', '1e3']],
  ['a row range start in hexadecimal', ['--from', '0x1', '--to', '5']],
])('refuses pane read with %s', (_name, flags) => {
  expect(typeof readCommand(...flags)).toBe('string');
});

it('parses pane read with the recent source named', () => {
  expect(readCommand('--source', 'recent')).toMatchObject({ pane: { source: 'recent' } });
});

it('refuses a row range with a bad end', () => {
  expect(typeof readCommand('--from', '1', '--to', 'x')).toBe('string');
});

it('reads a one-row range', () => {
  expect(readCommand('--from', '5', '--to', '5')).toMatchObject({
    pane: { source: 'recent', range: { from: 5, to: 5 } },
  });
});

it('leaves an unknown pane command to its own parser', () => {
  expect(parseCommand(['pane', 'bogus', '--cwd', 'x'])).toBe(parseCommand(['pane', 'bogus']));
});

it.each(['read', 'scroll', 'copy'])('hints at the pane id argument for pane %s', (action) => {
  const message = parseCommand(['pane', action, '--pane', 'pane-3']);

  expect(message).toContain(`pane ${action} takes the pane id as an argument.`);
});

it('gives no pane id hint for other stray options or commands', () => {
  const otherOption = parseCommand(['pane', 'read', 'pane-3', '--cwd', 'x']);
  const otherCommand = parseCommand(['pane', 'focus', '--pane', 'pane-3']);

  expect(otherOption).not.toContain('takes the pane id');
  expect(otherCommand).not.toContain('takes the pane id');
  expect(typeof otherOption).toBe('string');
  expect(typeof otherCommand).toBe('string');
});

it('refuses a stray option next to --version', () => {
  const message = parseCommand(['--version', '--label', 'x']);

  expect(message).toBe('--label belongs to workspace create.');
});

it.each(['attach', 'detach'])('refuses a stray option on %s', (command) => {
  expect(parseCommand([command, '--label', 'x'])).toBe('--label belongs to workspace create.');
});

it('refuses --client on attach', () => {
  expect(parseCommand(['attach', '--client', 'client-1'])).toBe(
    '--client belongs to detach and pane scroll.',
  );
});

it('checks options for koja --version before its arguments', () => {
  const message = parseCommand(['--version', 'workspace', 'create', '--label', 'x']);

  expect(message).toBe('--label belongs to workspace create.');
});

it.each(['attach', 'detach'])('checks options for %s even with an extra argument', (command) => {
  const message = parseCommand([command, 'workspace', 'create', '--label', 'x']);

  expect(message).toBe('--label belongs to workspace create.');
});

it('explains why pane list refuses extra arguments', () => {
  const message = parseCommand(['pane', 'list', 'extra']);

  expect(typeof message === 'string' && message.length > 0).toBe(true);
});

it('leaves an unknown command to its own parser even with an option', () => {
  expect(parseCommand(['koja', '--label', 'x'])).toBe(parseCommand(['koja']));
});

it('parses action list with --json', () => {
  expect(parseCommand(['action', 'list', '--json'])).toEqual({
    kind: 'action',
    action: { action: 'list' },
    json: true,
    socket: undefined,
  });
});

it('parses action run with the pane or workspace it names', () => {
  expect(parseCommand(['action', 'run', 'pane.zoom', '--pane', 'pane-2'])).toMatchObject({
    kind: 'action',
    action: { action: 'run', entry: { id: 'pane.zoom' }, pane: paneId(2) },
    json: false,
  });

  expect(parseCommand(['action', 'run', 'tab.next', '--workspace', 'workspace-3'])).toMatchObject({
    kind: 'action',
    action: { action: 'run', entry: { id: 'tab.next' }, workspace: workspaceId(3) },
  });
});

it('refuses an unknown action id, so the caller prints usage', () => {
  expect(typeof parseCommand(['action', 'run', 'pane.unknown'])).toBe('string');
});

it('refuses an action run without exactly one action id', () => {
  expect(typeof parseCommand(['action', 'run'])).toBe('string');
  expect(typeof parseCommand(['action', 'run', 'pane.zoom', 'pane.close'])).toBe('string');
});

it('refuses --pane on an action that is not a pane action', () => {
  expect(typeof parseCommand(['action', 'run', 'tab.next', '--pane', 'pane-1'])).toBe('string');
});

it('refuses --workspace on a pane action', () => {
  expect(typeof parseCommand(['action', 'run', 'pane.zoom', '--workspace', 'workspace-1'])).toBe(
    'string',
  );
});

it('refuses --pane and --workspace together', () => {
  const both = ['action', 'run', 'pane.zoom', '--pane', 'pane-1', '--workspace', 'workspace-1'];

  expect(typeof parseCommand(both)).toBe('string');
});

it('refuses target flags on action list', () => {
  expect(typeof parseCommand(['action', 'list', '--pane', 'pane-1'])).toBe('string');
});

it('refuses --workspace on workspace.create, which makes a new workspace', () => {
  expect(
    typeof parseCommand(['action', 'run', 'workspace.create', '--workspace', 'workspace-1']),
  ).toBe('string');
});
