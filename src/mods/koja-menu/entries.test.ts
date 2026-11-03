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

const host: MenuHost = {
  run: () => {},
  openWorktreeDialog: () => {},
  terminals: () => terminalList,
  themes: () => themes,
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
});
