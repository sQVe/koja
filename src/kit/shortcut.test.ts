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
    expect(bindingFor([], 'pane.split:right')).toBe('ctrl-w v');
  });

  test('prefers a global binding over the normal-mode key', () => {
    const bindings = [binding('pane.split:right', 'ctrl-shift-o')];

    expect(bindingFor(bindings, 'pane.split:right')).toBe('ctrl-shift-o');
  });

  test('answers null for an action with only ambiguous normal-mode keys', () => {
    expect(bindingFor([], 'terminal.scroll')).toBeNull();
  });

  test('uses the first normal-mode key when an action has several', () => {
    expect(bindingFor([], 'pane.close')).toBe('ctrl-w q');
  });

  test('returns an earlier action normal-mode key before a later global binding', () => {
    const bindings = [binding('palette.open', 'ctrl-shift-p')];

    expect(bindingFor(bindings, 'pane.split:right', 'palette.open')).toBe('ctrl-w v');
  });

  test('continues to a later action when an earlier one has no key', () => {
    const bindings = [binding('palette.open', 'ctrl-shift-p')];

    expect(bindingFor(bindings, 'unknown.action', 'palette.open')).toBe('ctrl-shift-p');
  });
});
