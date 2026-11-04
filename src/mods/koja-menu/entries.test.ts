import { describe, expect, test } from 'bun:test';

import type {
  Checkout,
  MenuEntry,
  MenuHost,
  MenuProps,
  MenuTarget,
  TerminalFacts,
} from './entries.ts';
import {
  menuEntries,
  readMenuProps,
  readTerminal,
  selectedIndex,
  stepSelection,
} from './entries.ts';

let bindings: Record<string, string> = {};
let terminalList: unknown[] = [];
let themes: { name: string; label: string }[] = [];
let runCalls: { command: string; args: Record<string, unknown> }[] = [];
let dialogCalls: { action: string; space: string | null }[] = [];

const host: MenuHost = {
  run: (command, args) => {
    runCalls.push({ command, args });
  },
  openWorktreeDialog: (action, space) => {
    dialogCalls.push({ action, space });
  },
  terminals: () => terminalList,
  themes: () => themes,
};

const runEntries = (menu: MenuProps, checkout: Checkout): void => {
  for (const entry of menuEntries(menu, checkout, host)) {
    entry.action();
  }
};

const target = (fields: Partial<MenuTarget>): MenuTarget => ({
  pane: null,
  terminal: null,
  id: null,
  space: null,
  ...fields,
});

const terminal = (address: string, parent: string | null = null): TerminalFacts => ({
  address,
  name: null,
  parent,
  toProgram: true,
});

const hintOf = (menu: MenuProps, checkout: Checkout, label: string): string | null => {
  const entry: MenuEntry | undefined = menuEntries(menu, checkout, host).find(
    (candidate) => candidate.label === label,
  );

  const actions = entry?.shortcuts ?? [];

  return actions.map((action) => bindings[action]).find((key) => key !== undefined) ?? null;
};

describe('menu entries', () => {
  test('read a terminal right-click label', () => {
    expect(
      readTerminal({ address: 'terminal-1', labels: { 'herdr.right-click': 'program' } }),
    ).toEqual(terminal('terminal-1'));
  });

  test('read an unknown tab kind as global', () => {
    expect(readMenuProps({ tab: 'nonsense' }).kind).toBe('global');
  });

  test('name the right-click mode, not the terminal address', () => {
    terminalList = [{ address: 'terminal-1', labels: { 'herdr.right-click': 'program' } }];
    bindings = { 'terminal.right_click:menu': 'ctrl-alt-m' };

    const menu: MenuProps = {
      kind: 'pane',
      target: target({ pane: 'pane-1', terminal: 'terminal-1' }),
    };

    expect(hintOf(menu, null, 'Use Herdr right-click menu')).toBe('ctrl-alt-m');
  });

  test('name the worktree action for each worktree entry', () => {
    terminalList = [];
    bindings = { 'worktree:new': 'ctrl-alt-n', 'worktree:open': 'ctrl-alt-o' };
    const menu: MenuProps = { kind: 'space', target: target({ id: 'space-1' }) };

    expect(hintOf(menu, 'main', 'New worktree')).toBe('ctrl-alt-n');
    expect(hintOf(menu, 'main', 'Open worktree')).toBe('ctrl-alt-o');
  });

  test('list every theme the app reports, including Koja\u2019s own', () => {
    terminalList = [];
    bindings = { 'app.theme:catppuccin-latte-muted': 'ctrl-alt-t' };

    themes = [
      { name: 'graphite', label: 'Theme: graphite' },
      { name: 'catppuccin-latte-muted', label: 'Theme: catppuccin latte muted' },
    ];

    const menu: MenuProps = { kind: 'global', target: target({}) };

    expect(hintOf(menu, null, 'Theme: catppuccin latte muted')).toBe('ctrl-alt-t');
  });
});

describe('menu selection', () => {
  const spaceMenu: MenuProps = { kind: 'space', target: target({ id: 'space-1' }) };

  test('keep Close selected when Git rows load before it', () => {
    terminalList = [];
    bindings = {};

    const before = menuEntries(spaceMenu, null, host);
    const selectedLabel = before[selectedIndex(before, 'Close')]?.label ?? null;

    expect(selectedLabel).toBe('Close');

    const after = menuEntries(spaceMenu, 'linked', host);

    expect(after[selectedIndex(after, selectedLabel)]?.label).toBe('Close');
  });

  test('fall back to the first entry when the selected entry is gone', () => {
    terminalList = [];
    bindings = {};

    const entries = menuEntries(spaceMenu, null, host);

    expect(entries[selectedIndex(entries, 'Remove worktree')]?.label).toBe('Rename');
  });

  test('step the selection by label and wrap around', () => {
    terminalList = [];
    bindings = {};

    const entries = menuEntries(spaceMenu, 'linked', host);

    expect(stepSelection(entries, 'Close', 1)).toBe('Rename');
    expect(stepSelection(entries, 'New worktree', -1)).toBe('Rename');
    expect(stepSelection(entries, 'Rename', -1)).toBe('Close');
  });

  test('answer no selection for an empty menu', () => {
    expect(stepSelection([], 'Rename', 1)).toBeNull();
  });
});

describe('menu commands', () => {
  const spaceMenu: MenuProps = { kind: 'space', target: target({ id: 'space-1' }) };

  test('read every kind and target field', () => {
    expect(
      readMenuProps({
        tab: 'pane',
        target: { pane: 'pane-1', terminal: 'terminal-1', id: 'id-1', space: 'space-1' },
      }),
    ).toEqual({
      kind: 'pane',
      target: { pane: 'pane-1', terminal: 'terminal-1', id: 'id-1', space: 'space-1' },
    });

    expect(readMenuProps({ tab: 'tab' }).kind).toBe('tab');
    expect(readMenuProps({ tab: 'space' }).kind).toBe('space');
    expect(readMenuProps({ tab: 'global' }).kind).toBe('global');
  });

  test('read a terminal name and parent, and a right-click sent to the pane', () => {
    expect(readTerminal({ address: 'terminal-1', name: 'Agent', parent: 'terminal-0' })).toEqual({
      address: 'terminal-1',
      name: 'Agent',
      parent: 'terminal-0',
      toProgram: false,
    });

    expect(readTerminal({}).address).toBe('');
  });

  test('run the pane commands with the focused pane and terminal', () => {
    terminalList = [
      { address: 'terminal-0', name: 'Parent', labels: { 'herdr.right-click': 'menu' } },
      { address: 'terminal-1', parent: 'terminal-0', labels: { 'herdr.right-click': 'program' } },
    ];

    runCalls = [];

    const menu: MenuProps = {
      kind: 'pane',
      target: target({ pane: 'pane-1', terminal: 'terminal-1' }),
    };

    const entries = menuEntries(menu, null, host);

    for (const item of entries) {
      item.action();
    }

    expect(runCalls).toStrictEqual([
      { command: 'pane.split', args: { direction: 'right', pane: 'pane-1' } },
      { command: 'pane.split', args: { direction: 'down', pane: 'pane-1' } },
      { command: 'pane.zoom', args: { pane: 'pane-1' } },
      { command: 'terminal.right_click', args: { to: 'menu', terminal: 'terminal-1' } },
      { command: 'terminal.park', args: { terminal: 'terminal-1' } },
      { command: 'pane.close', args: { pane: 'pane-1' } },
    ]);

    expect(entries[0]?.group).toBe(false);
    expect(entries.at(-1)?.group).toBe(true);
  });

  test('omit the terminal rows when no terminal matches the target', () => {
    terminalList = [{ address: 'terminal-9', labels: {} }];
    runCalls = [];

    const menu: MenuProps = { kind: 'pane', target: target({ terminal: 'missing' }) };
    const entries = menuEntries(menu, null, host);

    expect(entries).toHaveLength(4);

    for (const item of entries) {
      item.action();
    }

    expect(runCalls).toStrictEqual([
      { command: 'pane.split', args: { direction: 'right', pane: undefined } },
      { command: 'pane.split', args: { direction: 'down', pane: undefined } },
      { command: 'pane.zoom', args: { pane: undefined } },
      { command: 'pane.close', args: { pane: undefined } },
    ]);
  });

  test('send right-clicks to the program when the terminal does not use the menu', () => {
    terminalList = [{ address: 'terminal-1', labels: {} }];
    runCalls = [];

    const menu: MenuProps = { kind: 'pane', target: target({ terminal: 'terminal-1' }) };
    const entries = menuEntries(menu, null, host);

    entries[3]?.action();

    expect(runCalls).toStrictEqual([
      { command: 'terminal.right_click', args: { to: 'program', terminal: 'terminal-1' } },
    ]);
  });

  test('sends a pane back to the terminal named as its parent', () => {
    terminalList = [
      { address: 'decoy', labels: {} },
      { address: 'terminal-0', name: 'Parent', labels: {} },
      { address: 'terminal-1', parent: 'terminal-0', labels: {} },
      { address: 'terminal-2', name: 'Other', labels: {} },
    ];

    runCalls = [];

    const menu: MenuProps = { kind: 'pane', target: target({ terminal: 'terminal-1' }) };

    const sendBack = menuEntries(menu, null, host).find((item) =>
      item.label.startsWith('Send back to '),
    );

    sendBack?.action();

    expect(sendBack?.label).toContain('Parent');

    expect(runCalls).toStrictEqual([
      { command: 'terminal.park', args: { terminal: 'terminal-1' } },
    ]);
  });

  test('run the tab commands', () => {
    terminalList = [];
    runCalls = [];

    const menu: MenuProps = { kind: 'tab', target: target({ id: 'id-1', space: 'space-1' }) };
    const entries = menuEntries(menu, null, host);

    for (const item of entries) {
      item.action();
    }

    expect(runCalls).toStrictEqual([
      { command: 'tab.rename', args: { id: 'id-1' } },
      { command: 'tab.new', args: { space: 'space-1' } },
      { command: 'tab.close', args: { id: 'id-1' } },
    ]);

    expect(entries.at(-1)?.group).toBe(true);
  });

  test('run the space commands each checkout allows', () => {
    terminalList = [];

    runCalls = [];
    const withoutCheckout = menuEntries(spaceMenu, null, host);

    expect(withoutCheckout).toHaveLength(2);

    runEntries(spaceMenu, null);

    expect(runCalls).toStrictEqual([
      { command: 'space.rename', args: { id: 'space-1' } },
      { command: 'space.close', args: { id: 'space-1' } },
    ]);

    expect(withoutCheckout.at(-1)?.group).toBe(true);

    runCalls = [];
    dialogCalls = [];
    const main = menuEntries(spaceMenu, 'main', host);

    runEntries(spaceMenu, 'main');

    expect(runCalls.map((call) => call.command)).toEqual(['space.rename', 'space.close']);

    expect(dialogCalls).toStrictEqual([
      { action: 'new', space: 'space-1' },
      { action: 'open', space: 'space-1' },
    ]);

    expect(main[1]?.group).toBe(false);
    expect(main.at(-1)?.group).toBe(true);

    runCalls = [];
    dialogCalls = [];

    runEntries(spaceMenu, 'linked');

    expect(dialogCalls.map((call) => call.action)).toEqual(['new', 'open', 'remove']);
  });

  test('run the global commands and mark the first theme row as a group', () => {
    terminalList = [];

    themes = [
      { name: 'graphite', label: 'Theme: graphite' },
      { name: 'latte', label: 'Theme: latte' },
    ];

    runCalls = [];

    const menu: MenuProps = { kind: 'global', target: target({}) };
    const entries = menuEntries(menu, null, host);

    for (const item of entries) {
      item.action();
    }

    expect(runCalls).toStrictEqual([
      { command: 'space.new', args: {} },
      { command: 'app.help', args: {} },
      { command: 'app.theme', args: { name: 'graphite' } },
      { command: 'app.theme', args: { name: 'latte' } },
    ]);

    expect(entries[0]?.shortcuts).toEqual(['space.new']);
    expect(entries[0]?.group).toBe(false);
    expect(entries[1]?.group).toBe(true);

    const themeRows = entries.slice(-2);

    expect(themeRows[0]?.group).toBe(true);
    expect(themeRows[1]?.group).toBe(false);
  });
});
