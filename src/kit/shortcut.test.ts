import { describe, expect, test } from 'bun:test';

import { bindingAction } from './binding.ts';
import type { KeyBinding } from './shortcutBinding.ts';
import { bindingFor, hintFor } from './shortcutBinding.ts';

const binding = (action: string, keys: string, section = 'global'): KeyBinding => ({
  section,
  keys,
  action,
});

describe('bindingFor', () => {
  test('returns the binding of the first action that has one', () => {
    const bindings = [binding('palette.open', 'ctrl-shift-p'), binding('picker.open', 'ctrl-p')];

    expect(bindingFor(bindings, 'picker.open', 'palette.open')).toBe('ctrl-p');
  });

  test('ignores bindings outside the global section', () => {
    expect(bindingFor([binding('picker.open', 'ctrl-p', 'pane')], 'picker.open')).toBeNull();
  });

  test('answers null when no action has a binding', () => {
    expect(bindingFor([binding('other.open', 'ctrl-p')], 'picker.open')).toBeNull();
  });

  test('falls back to the first normal-mode key for an action', () => {
    expect(bindingFor([], 'pane.split:right')).toBe('w v');
  });

  test('prefers the normal-mode key over a global binding', () => {
    const bindings = [binding('pane.split:right', 'ctrl-shift-o')];

    expect(bindingFor(bindings, 'pane.split:right')).toBe('w v');
  });

  test('shows the plain-letter form of each part, not its ctrl-w alias', () => {
    expect(bindingFor([], 'tab.new')).toBe('t n');
    expect(bindingFor([], 'tab.next')).toBe('t l');
    expect(bindingFor([], 'tab.prev')).toBe('t h');
    expect(bindingFor([], 'space.new')).toBe('s n');
    expect(bindingFor([], 'layout.toggle:sidebar')).toBe('z s');
    expect(bindingFor([], 'pane.go:left')).toBe('h');
  });

  test('shows the one-key alias of an action that has one', () => {
    expect(bindingFor([], 'space.next')).toBe(']');
    expect(bindingFor([], 'space.prev')).toBe('[');
    expect(bindingFor([], 'mod.open:koja-picker')).toBe('ä');
  });

  test('shows the first of several keys of the same length', () => {
    expect(bindingFor([], 'pane.go:left')).toBe('h');
    expect(bindingFor([], 'mod.open:koja-palette')).toBe(':');
  });

  test('answers null for an action with only ambiguous normal-mode keys', () => {
    expect(bindingFor([], 'terminal.scroll')).toBeNull();
  });

  test('uses the first normal-mode key when an action has several', () => {
    expect(bindingFor([], 'pane.close')).toBe('w q');
  });

  test('returns an earlier action normal-mode key before a later global binding', () => {
    const bindings = [binding('palette.open', 'ctrl-shift-p')];

    expect(bindingFor(bindings, 'pane.split:right', 'palette.open')).toBe('w v');
  });

  test('continues to a later action when an earlier one has no key', () => {
    const bindings = [binding('palette.open', 'ctrl-shift-p')];

    expect(bindingFor(bindings, 'unknown.action', 'palette.open')).toBe('ctrl-shift-p');
  });
});

describe('hintFor', () => {
  test('gives a command its fewest-key normal sequence', () => {
    expect(hintFor([], 'linux', 'tab.new')).toEqual({ normal: ['t', 'n'] });
    expect(hintFor([], 'linux', 'space.next')).toEqual({ normal: [']'] });
  });

  test('gives the global binding as formatted keys in insert mode', () => {
    const bindings = [binding('terminal.copy', 'ctrl-shift-c')];

    expect(hintFor(bindings, 'linux', 'terminal.copy')).toEqual({
      normal: [],
      insert: ['Ctrl+Shift+C'],
    });

    expect(hintFor(bindings, 'macos', 'terminal.copy')).toEqual({
      normal: [],
      insert: ['⌃⇧C'],
    });
  });

  test('gives one key per stroke of the global binding', () => {
    const bindings = [binding('palette.open', 'ctrl-b :')];

    expect(hintFor(bindings, 'linux', 'palette.open')).toEqual({
      normal: [],
      insert: ['Ctrl+B', ':'],
    });
  });

  test('leaves the insert hint out without a global binding', () => {
    expect(hintFor([], 'linux', 'pane.split:right')).toEqual({ normal: ['w', 'v'] });
  });

  test('draws a modified normal-mode stroke in its display form', () => {
    expect(hintFor([], 'linux', bindingAction('terminal.scroll', { pages: -0.5 }))).toEqual({
      normal: ['Ctrl+U'],
    });
  });

  test('keeps a plain shifted normal-mode key whole, so its cap marks the shift', () => {
    expect(hintFor([], 'linux', bindingAction('tab.move', { by: -1 }))).toEqual({
      normal: ['t', 'H'],
    });
  });

  test('ignores a binding outside the global section in insert mode', () => {
    const bindings = [binding('palette.open', 'ctrl-shift-p', 'pane')];

    expect(hintFor(bindings, 'linux', 'palette.open')).toEqual({ normal: [] });
  });

  test('falls back to a later action when the first has no hint', () => {
    expect(hintFor([], 'linux', 'unknown.action', 'pane.split:right')).toEqual({
      normal: ['w', 'v'],
    });
  });
});
