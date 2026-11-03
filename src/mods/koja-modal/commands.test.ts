import { describe, expect, test } from 'bun:test';

import { runNormalModeCommand } from './commands.ts';

describe('normal mode commands', () => {
  test('hold re-holds the keyboard without closing or running an action', () => {
    const calls: string[] = [];

    const effects = {
      holdKeyboard: () => calls.push('hold'),
      close: () => calls.push('close'),
      execute: () => calls.push('execute'),
    };

    runNormalModeCommand('hold', effects);

    expect(calls).toEqual(['hold']);
  });

  test('an unknown command does nothing', () => {
    const calls: string[] = [];

    const effects = {
      holdKeyboard: () => calls.push('hold'),
      close: () => calls.push('close'),
      execute: () => calls.push('execute'),
    };

    runNormalModeCommand('other', effects);

    expect(calls).toEqual([]);
  });
});
