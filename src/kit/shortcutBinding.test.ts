import { describe, expect, test } from 'bun:test';

import { bindingAction } from './binding.ts';
import { commandIdentity } from './commandTitles.ts';
import { bindingFor, hintFor } from './shortcutBinding.ts';

describe('hintFor', () => {
  test('keeps the normal-mode key and the global binding apart by mode', () => {
    const bindings = [{ section: 'global', keys: 'ctrl-shift-p', action: 'palette.open' }];

    expect(hintFor(bindings, 'linux', 'palette.open', 'pane.split:right')).toEqual({
      normal: ['w', 'v'],
      insert: ['Ctrl+Shift+P'],
    });
  });

  test('gives no insert key to an action with only a normal-mode key', () => {
    expect(hintFor([], 'linux', 'pane.split:right')).toEqual({ normal: ['w', 'v'] });
  });

  test('draws a modified normal-mode stroke in its display form', () => {
    expect(hintFor([], 'linux', bindingAction('terminal.scroll', { pages: -0.5 }))).toEqual({
      normal: ['Ctrl+U'],
    });
  });

  test('names a multi-character key and keeps a single key lower case', () => {
    const bindings = [{ section: 'global', keys: 'tab', action: 'mod.open:koja-picker' }];

    expect(hintFor(bindings, 'linux', 'mod.open:koja-picker')).toEqual({
      normal: ['ä'],
      insert: ['Tab'],
    });
  });

  test('keeps a plain shifted normal-mode key whole, so its cap marks the shift', () => {
    expect(hintFor([], 'linux', bindingAction('tab.move', { by: -1 }))).toEqual({
      normal: ['t', 'H'],
    });
  });

  test('gives no normal key to an action with only a global binding', () => {
    const bindings = [{ section: 'global', keys: 'ctrl-alt-o', action: 'worktree:open' }];

    expect(hintFor(bindings, 'linux', 'worktree:open')).toEqual({
      normal: [],
      insert: ['Ctrl+Alt+O'],
    });
  });

  test('draws no hint for a JSON action that names no command', () => {
    const bindings = [{ section: 'global', keys: 'ctrl-alt-y', action: '{"args":{"px":240}}' }];

    expect(hintFor(bindings, 'linux', commandIdentity('layout.resize', { px: 240 }))).toEqual({
      normal: [],
    });
  });
});

describe('bindingFor', () => {
  test('finds the normal-mode key of a command with a number argument', () => {
    expect(bindingFor([], bindingAction('tab.move', { by: -1 }))).toBe('t H');
    expect(bindingFor([], bindingAction('tab.move', { by: 1 }))).toBe('t L');
  });

  test('finds the normal-mode key of a command with a string argument', () => {
    expect(bindingFor([], bindingAction('pane.split', { direction: 'right' }))).toBe('w v');
  });

  test('finds a key whose JSON action runs the same command and arguments', () => {
    const bindings = [
      {
        section: 'global',
        keys: 'ctrl-alt-r',
        action: '{"command":"layout.resize","args":{"px":240,"id":"sidebar"}}',
      },
    ];

    expect(bindingFor(bindings, commandIdentity('layout.resize', { id: 'sidebar', px: 240 }))).toBe(
      'ctrl-alt-r',
    );
  });

  test('finds a key whose JSON action runs the same command and arguments in another key order', () => {
    const bindings = [
      {
        section: 'global',
        keys: 'ctrl-alt-r',
        action: '{"command":"layout.resize","args":{"place":{"row":1,"column":2}}}',
      },
    ];

    const identity = commandIdentity('layout.resize', { place: { column: 2, row: 1 } });

    expect(bindingFor(bindings, identity)).toBe('ctrl-alt-r');
  });

  test('leaves a JSON action with other arguments to its own command', () => {
    const bindings = [
      {
        section: 'global',
        keys: 'ctrl-alt-r',
        action: '{"command":"layout.resize","args":{"px":240}}',
      },
    ];

    expect(bindingFor(bindings, commandIdentity('layout.resize', { px: 320 }))).toBeNull();
    expect(bindingFor(bindings, commandIdentity('tab.new', { px: 240 }))).toBeNull();
  });

  test('ignores a JSON action that does not parse', () => {
    const bindings = [{ section: 'global', keys: 'ctrl-alt-x', action: '{"command":' }];

    expect(bindingFor(bindings, commandIdentity('layout.resize', { px: 240 }))).toBeNull();
  });

  test('ignores a JSON action that names no command', () => {
    const bindings = [{ section: 'global', keys: 'ctrl-alt-y', action: '{"args":{"px":240}}' }];

    expect(bindingFor(bindings, commandIdentity('layout.resize', { px: 240 }))).toBeNull();
  });

  test('draws the key of a JSON action in the row hint', () => {
    const bindings = [
      {
        section: 'global',
        keys: 'ctrl-alt-r',
        action: '{"command":"layout.resize","args":{"id":"sidebar","px":240}}',
      },
    ];

    expect(
      hintFor(bindings, 'linux', commandIdentity('layout.resize', { px: 240, id: 'sidebar' })),
    ).toEqual({
      normal: [],
      insert: ['Ctrl+Alt+R'],
    });
  });
});
