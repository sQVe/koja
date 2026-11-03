import { describe, expect, test } from 'bun:test';

import { bindingAction } from './binding.ts';

describe('bindingAction', () => {
  test('names the command with its first string argument', () => {
    expect(bindingAction('app.theme', { name: 'graphite' })).toBe('app.theme:graphite');
  });

  test('names the bare command when the first argument is not a string', () => {
    expect(bindingAction('space.new', {})).toBe('space.new');
  });
});
