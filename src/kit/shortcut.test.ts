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
});
