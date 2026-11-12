import { describe, expect, test } from 'bun:test';

import type { KeyBinding } from './shortcutBinding.ts';
import { bindingFor } from './shortcutBinding.ts';

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
    expect(bindingFor([], 'space.new')).toBe('s n');
    expect(bindingFor([], 'layout.toggle:sidebar')).toBe('z s');
    expect(bindingFor([], 'pane.go:left')).toBe('h');
  });

  test('shows the one-key alias of an action that has one', () => {
    expect(bindingFor([], 'space.next')).toBe(']');
    expect(bindingFor([], 'space.prev')).toBe('[');
    expect(bindingFor([], 'tab.next')).toBe(')');
    expect(bindingFor([], 'tab.prev')).toBe('(');
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
