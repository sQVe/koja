import { describe, expect, test } from 'bun:test';

import { actionName } from './keyNames.ts';

const commandName = (command: string, args?: Record<string, unknown>): string | undefined =>
  actionName({ kind: 'command', command, ...(args === undefined ? {} : { args }) });

describe('actionName', () => {
  test('names a command without arguments', () => {
    expect(actionName({ kind: 'command', command: 'space.next' })).toBe('Next space');
  });

  test('names a command by its arguments', () => {
    expect(commandName('pane.split', { direction: 'down' })).toBe('Split down');
    expect(commandName('pane.split', { direction: 'right' })).toBe('Split right');
  });

  test('tells numeric arguments apart', () => {
    expect(commandName('tab.select', { index: 1 })).toBe('Go to tab 1');
    expect(commandName('tab.select', { index: 2 })).toBe('Go to tab 2');
    expect(commandName('terminal.scroll', { pages: -1 })).toBe('Scroll page up');
    expect(commandName('terminal.scroll', { pages: 1 })).toBe('Scroll page down');
    expect(commandName('terminal.scroll', { lines: 1 })).toBe('Scroll line down');
    expect(commandName('tab.select', { index: 'first' })).toBeUndefined();
  });

  test('gives no name for an unknown command', () => {
    expect(actionName({ kind: 'command', command: 'pane.explode' })).toBeUndefined();
  });

  test('gives no name for a known command with unknown arguments', () => {
    expect(commandName('pane.split', { direction: 'inward' })).toBeUndefined();
    expect(commandName('pane.split')).toBeUndefined();
  });

  test('names an intent, a section step, a list action, and leaving', () => {
    expect(actionName({ kind: 'intent', intent: 'closeOtherPanes' })).toBe('Close other panes');
    expect(actionName({ kind: 'section', target: 'next' })).toBe('Next section');
    expect(actionName({ kind: 'list', action: 'halfPageDown' })).toBe('Half page down');
    expect(actionName({ kind: 'leave' })).toBe('Leave normal mode');
  });

  test('names a counted tab by its index', () => {
    expect(actionName({ kind: 'nthTab', index: 3 })).toBe('Go to tab 3');
  });
});
