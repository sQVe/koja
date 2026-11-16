import { describe, expect, test } from 'bun:test';

import { bindingAction } from './binding.ts';
import { bindingFor } from './shortcutBinding.ts';

describe('bindingFor', () => {
  test('finds the normal-mode key of a command with a number argument', () => {
    expect(bindingFor([], bindingAction('tab.move', { by: -1 }))).toBe('t H');
    expect(bindingFor([], bindingAction('tab.move', { by: 1 }))).toBe('t L');
  });

  test('finds the normal-mode key of a command with a string argument', () => {
    expect(bindingFor([], bindingAction('pane.split', { direction: 'right' }))).toBe('w v');
  });
});
