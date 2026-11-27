import { describe, expect, test } from 'bun:test';

import { actionIdentity, bindingAction } from './binding.ts';
import { commandIdentity } from './commandTitles.ts';

describe('bindingAction', () => {
  test('names the command with its first string argument', () => {
    expect(bindingAction('app.theme', { name: 'graphite' })).toBe('app.theme:graphite');
  });

  test('names the bare command when the first argument is not a string', () => {
    expect(bindingAction('space.new', {})).toBe('space.new');
  });
});

describe('actionIdentity', () => {
  test('rejects an action whose arguments are not a record', () => {
    expect(actionIdentity('{"command":"x","args":"some"}')).toBeNull();
    expect(actionIdentity('{"command":"x","args":[]}')).toBeNull();
  });

  test('reads a JSON action that starts with whitespace', () => {
    expect(actionIdentity(' {"command":"x","args":{"name":"a"}}')).toBe(
      commandIdentity('x', { name: 'a' }),
    );
  });
});
