import { describe, expect, test } from 'bun:test';

import { bindingAction } from './binding.ts';
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
});

describe('bindingFor', () => {
  test('finds the normal-mode key of a command with a number argument', () => {
    expect(bindingFor([], bindingAction('tab.move', { by: -1 }))).toBe('t H');
    expect(bindingFor([], bindingAction('tab.move', { by: 1 }))).toBe('t L');
  });

  test('finds the normal-mode key of a command with a string argument', () => {
    expect(bindingFor([], bindingAction('pane.split', { direction: 'right' }))).toBe('w v');
  });
});
