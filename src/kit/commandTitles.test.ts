import { describe, expect, test } from 'bun:test';

import { commandIdentity } from './commandTitles.ts';

describe('commandIdentity', () => {
  test('names a command with no arguments by its bare command', () => {
    expect(commandIdentity('tab.new', {})).toBe('tab.new');
    expect(commandIdentity('tab.new')).toBe('tab.new');
  });
});
