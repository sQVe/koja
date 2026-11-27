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

  test('matches a JSON action that names no arguments to its bare command', () => {
    expect(actionIdentity('{"command":"tab.new"}')).toBe(bindingAction('tab.new', {}));
  });

  test('gives a JSON action with no arguments the bare command identity', () => {
    expect(actionIdentity('{"command":"tab.new","args":{}}')).toBe('tab.new');
  });

  test('matches an empty argument record to the command identity with no arguments', () => {
    expect(actionIdentity('{"command":"tab.new","args":{}}')).toBe(commandIdentity('tab.new', {}));
  });

  test('still rejects a null argument record', () => {
    expect(actionIdentity('{"command":"x","args":null}')).toBeNull();
  });
});
