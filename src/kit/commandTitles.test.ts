import { describe, expect, test } from 'bun:test';

import { commandIdentity } from './commandTitles.ts';

describe('commandIdentity', () => {
  test('names a command with no arguments by its bare command', () => {
    expect(commandIdentity('tab.new', {})).toBe('tab.new');
    expect(commandIdentity('tab.new')).toBe('tab.new');
  });

  test('gives arguments that serialize to an empty record the bare command identity', () => {
    expect(commandIdentity('x', { id: undefined })).toBe('x');
  });

  test('gives the same arguments in any key order one identity', () => {
    expect(commandIdentity('x', { b: 1, a: { d: 2, c: 3 } })).toBe(
      commandIdentity('x', { a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  test('gives integer-like keys one identity in either insertion order', () => {
    expect(commandIdentity('x', { '10': 'a', '2': 'b' })).toBe('x:{"2":"b","10":"a"}');
  });
});
