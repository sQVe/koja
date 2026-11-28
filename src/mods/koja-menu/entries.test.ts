import { beforeEach, describe, expect, test } from 'bun:test';

import type { Context } from 'gpui-kit';

import type { GitIdentity } from '../../data/gitIdentity.ts';
import type {
  Checkout,
  MenuAction,
  MenuEntry,
  MenuHost,
  MenuProps,
  MenuTarget,
  TerminalFacts,
} from './entries.ts';
import {
  checkoutOf,
  isAction,
  menuDetails,
  menuEntries,
  readMenuProps,
  readTerminal,
  selectedIndex,
  stepSelection,
} from './entries.ts';

let bindings: Record<string, string> = {};
let terminalList: unknown[] = [];
let paneList: { pane: string }[] = [];
let themes: { name: string; label: string; light: boolean }[] = [];
let runCalls: { command: string; args: Record<string, unknown> }[] = [];
let dialogCalls: { action: string; space: string | null }[] = [];
let groveCalls: { action: string; space: string | null }[] = [];

const host: MenuHost = {
  run: (command, args) => {
    runCalls.push({ command, args });
  },
  openWorktreeDialog: (action, space) => {
    dialogCalls.push({ action, space });
  },
  openGroveDialog: (action, space) => {
    groveCalls.push({ action, space });
  },
  terminals: () => terminalList,
  panes: () => paneList,
  themes: () => themes,
};

const context = {
  open_url: () => undefined,
  write_to_clipboard: () => undefined,
} as unknown as Context;

const actionsOf = (menu: MenuProps, checkout: Checkout): MenuAction[] =>
  menuEntries(menu, checkout, host).filter(isAction);

const labelOf = (entry: MenuEntry | undefined): string | null =>
  entry !== undefined && isAction(entry) ? entry.label : null;

const rowLabels = (menu: MenuProps, checkout: Checkout): string[] =>
  menuEntries(menu, checkout, host).map((entry) =>
    entry.kind === 'error' ? entry.text : entry.label,
  );

const runEntries = (menu: MenuProps, checkout: Checkout): void => {
  for (const entry of actionsOf(menu, checkout)) {
    entry.action(context);
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
  const entry: MenuAction | undefined = actionsOf(menu, checkout).find(
    (candidate) => candidate.label === label,
  );

  const actions = entry?.shortcuts ?? [];

  return actions.map((action) => bindings[action]).find((key) => key !== undefined) ?? null;
};

beforeEach(() => {
  paneList = [];
});

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

    expect(hintOf(menu, null, 'Send right-clicks to pane')).toBe('ctrl-alt-m');
  });

  test('read the right-click row as on while right-clicks go to the pane', () => {
    terminalList = [
      { address: 'terminal-1', labels: { 'herdr.right-click': 'program' } },
      { address: 'terminal-2', labels: {} },
    ];

    const menu = (address: string): MenuProps => ({
      kind: 'pane',
      target: target({ terminal: address }),
    });

    const stateOf = (address: string): string | undefined =>
      actionsOf(menu(address), null).find((entry) => entry.label === 'Send right-clicks to pane')
        ?.state;

    expect(stateOf('terminal-1')).toBe('on');
    expect(stateOf('terminal-2')).toBe('off');
  });

  test('hint only Open worktree, whose binding opens the same dialog', () => {
    terminalList = [];

    bindings = {
      'worktree:new': 'ctrl-alt-n',
      'worktree:open': 'ctrl-alt-o',
      'worktree:remove': 'ctrl-alt-r',
      worktree: 'ctrl-alt-w',
    };

    const menu: MenuProps = { kind: 'space', target: target({ id: 'space-1' }) };

    expect(hintOf(menu, 'linked', 'New worktree')).toBeNull();
    expect(hintOf(menu, 'linked', 'Open worktree')).toBe('ctrl-alt-o');
    expect(hintOf(menu, 'linked', 'Remove worktree')).toBeNull();
  });

  test('list every theme the app reports, including Koja\u2019s own', () => {
    terminalList = [];
    bindings = { 'app.theme:catppuccin-latte-muted': 'ctrl-alt-t' };

    themes = [
      { name: 'graphite', label: 'Theme: graphite', light: false },
      { name: 'catppuccin-latte-muted', label: 'Theme: catppuccin latte muted', light: true },
    ];

    const menu: MenuProps = { kind: 'global', target: target({}) };

    expect(hintOf(menu, null, 'Theme: catppuccin latte muted')).toBe('ctrl-alt-t');
  });
});

describe('menu selection', () => {
  const spaceMenu: MenuProps = { kind: 'space', target: target({ id: 'space-1' }) };

  test('select the first action when the first row is an error line', () => {
    const rows: MenuEntry[] = [
      { kind: 'error', text: 'Could not read the checkout' },
      {
        kind: 'action',
        label: 'Rename',
        icon: 'square-pen',
        shortcuts: [],
        group: false,
        action: () => undefined,
      },
      {
        kind: 'action',
        label: 'Close',
        icon: 'x',
        shortcuts: [],
        group: true,
        action: () => undefined,
      },
    ];

    expect(selectedIndex(rows, null)).toBe(1);
    expect(stepSelection(rows, 'Close', 1)).toBe('Rename');
  });

  test('keep Close selected when Git rows load before it', () => {
    terminalList = [];
    bindings = {};

    const before = menuEntries(spaceMenu, null, host);
    const selectedEntry = before[selectedIndex(before, 'Close')];
    const beforeLabel = labelOf(selectedEntry);

    expect(beforeLabel).toBe('Close');

    const after = menuEntries(spaceMenu, 'linked', host);
    const afterLabel = labelOf(after[selectedIndex(after, beforeLabel)]);

    expect(afterLabel).toBe('Close');
  });

  test('fall back to the first entry when the selected entry is gone', () => {
    terminalList = [];
    bindings = {};

    const entries = menuEntries(spaceMenu, null, host);
    const selectedLabel = labelOf(entries[selectedIndex(entries, 'Remove worktree')]);

    expect(selectedLabel).toBe('Rename');
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
      task: null,
      branch: null,
      folder: null,
      ticket: null,
      pull: null,
      overflow: false,
      zoomed: false,
    });

    expect(readMenuProps({ tab: 'tab' }).kind).toBe('tab');
    expect(readMenuProps({ tab: 'space' }).kind).toBe('space');
    expect(readMenuProps({ tab: 'global' }).kind).toBe('global');
  });

  test('list the pane details before the pane actions', () => {
    paneList = [{ pane: 'pane-1' }];

    const menu: MenuProps = {
      kind: 'pane',
      target: target({ pane: 'pane-1' }),
      task: 'Build window shell',
      branch: 'me-1089-window-shell',
      folder: '~/code/koja',
    };

    const details = menuDetails(menu);
    const actions = actionsOf(menu, null).map((entry) => entry.label);

    expect([details.task, details.branch, details.folder]).toEqual([
      'Build window shell',
      'me-1089-window-shell',
      '~/code/koja',
    ]);

    expect(actions.slice(0, 5)).toEqual([
      'Rename',
      'Split right',
      'Split down',
      'Zoom',
      'Close pane',
    ]);
  });

  test('offers no pane commands for a terminal outside a tab', () => {
    paneList = [];
    terminalList = [{ address: 'terminal-1', labels: {} }];

    const menu: MenuProps = {
      kind: 'pane',
      target: target({ pane: 'block-1', terminal: 'terminal-1' }),
    };

    expect(rowLabels(menu, null)).toEqual(['Send right-clicks to pane']);
  });

  test('offers no pane commands for a block beside a live pane', () => {
    paneList = [{ pane: 'pane-1' }];
    terminalList = [{ address: 'terminal-1', labels: {} }];

    const menu: MenuProps = {
      kind: 'pane',
      target: target({ pane: 'block-1', terminal: 'terminal-1' }),
    };

    expect(rowLabels(menu, null)).toEqual(['Send right-clicks to pane']);
  });

  test('names the pane first inside a tab', () => {
    paneList = [{ pane: 'pane-1' }];
    terminalList = [];
    runCalls = [];

    const menu: MenuProps = { kind: 'pane', target: target({ pane: 'pane-1' }) };

    runEntries(menu, null);

    expect(runCalls[0]).toEqual({ command: 'pane.rename', args: { pane: 'pane-1' } });
  });

  test('the compact menu lists only the pane actions', () => {
    terminalList = [
      {
        address: 'terminal-1',
        parent: 'terminal-0',
        labels: { 'herdr.right-click': 'program' },
      },
    ];

    const menu: MenuProps = {
      kind: 'pane',
      overflow: true,
      zoomed: false,
      target: target({ pane: 'pane-1', terminal: 'terminal-1' }),
    };

    expect(rowLabels(menu, null)).toEqual(['Split right', 'Split down', 'Zoom pane', 'Close pane']);
  });

  test('the compact menu restores a zoomed pane', () => {
    const menu: MenuProps = {
      kind: 'pane',
      overflow: true,
      zoomed: true,
      target: target({ pane: 'pane-1' }),
    };

    expect(rowLabels(menu, null)).toEqual([
      'Split right',
      'Split down',
      'Restore pane',
      'Close pane',
    ]);
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
    paneList = [{ pane: 'pane-1' }];

    terminalList = [
      { address: 'terminal-0', name: 'Parent', labels: { 'herdr.right-click': 'menu' } },
      { address: 'terminal-1', parent: 'terminal-0', labels: { 'herdr.right-click': 'program' } },
    ];

    runCalls = [];

    const menu: MenuProps = {
      kind: 'pane',
      target: target({ pane: 'pane-1', terminal: 'terminal-1' }),
    };

    const entries = actionsOf(menu, null);

    expect(rowLabels(menu, null)).toEqual([
      'Rename',
      'Split right',
      'Split down',
      'Zoom',
      'Send right-clicks to pane',
      'Send back to Parent',
      'Close pane',
    ]);

    for (const item of entries) {
      item.action(context);
    }

    expect(runCalls).toStrictEqual([
      { command: 'pane.rename', args: { pane: 'pane-1' } },
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
    paneList = [{ pane: 'pane-1' }];
    terminalList = [{ address: 'terminal-9', labels: {} }];
    runCalls = [];

    const menu: MenuProps = {
      kind: 'pane',
      target: target({ pane: 'pane-1', terminal: 'missing' }),
    };

    const entries = actionsOf(menu, null);

    expect(rowLabels(menu, null)).toEqual([
      'Rename',
      'Split right',
      'Split down',
      'Zoom',
      'Close pane',
    ]);

    for (const item of entries) {
      item.action(context);
    }

    expect(runCalls).toStrictEqual([
      { command: 'pane.rename', args: { pane: 'pane-1' } },
      { command: 'pane.split', args: { direction: 'right', pane: 'pane-1' } },
      { command: 'pane.split', args: { direction: 'down', pane: 'pane-1' } },
      { command: 'pane.zoom', args: { pane: 'pane-1' } },
      { command: 'pane.close', args: { pane: 'pane-1' } },
    ]);
  });

  test('send right-clicks to the program when the terminal does not use the menu', () => {
    paneList = [];
    terminalList = [{ address: 'terminal-1', labels: {} }];
    runCalls = [];

    const menu: MenuProps = { kind: 'pane', target: target({ terminal: 'terminal-1' }) };

    const entry = actionsOf(menu, null).find(
      (candidate) => candidate.label === 'Send right-clicks to pane',
    );

    entry?.action(context);

    expect(runCalls).toStrictEqual([
      { command: 'terminal.right_click', args: { to: 'program', terminal: 'terminal-1' } },
    ]);
  });

  test('send a pane back to its live parent terminal', () => {
    terminalList = [
      { address: 'decoy', labels: {} },
      { address: 'terminal-0', labels: {} },
      { address: 'terminal-1', parent: 'terminal-0', labels: {} },
    ];

    runCalls = [];

    runEntries({ kind: 'pane', target: target({ terminal: 'terminal-1' }) }, null);

    const parkCalls = runCalls.filter((call) => call.command === 'terminal.park');

    expect(parkCalls).toStrictEqual([
      { command: 'terminal.park', args: { terminal: 'terminal-1' } },
    ]);
  });

  test('offer no send-back when the parent terminal is gone', () => {
    terminalList = [
      { address: 'decoy', labels: {} },
      { address: 'terminal-1', parent: 'terminal-0', labels: {} },
    ];

    runCalls = [];

    runEntries({ kind: 'pane', target: target({ terminal: 'terminal-1' }) }, null);

    const parkCalls = runCalls.filter((call) => call.command === 'terminal.park');

    expect(parkCalls).toStrictEqual([]);
  });

  test('run the tab commands', () => {
    terminalList = [];
    runCalls = [];

    const menu: MenuProps = { kind: 'tab', target: target({ id: 'id-1', space: 'space-1' }) };
    const entries = actionsOf(menu, null);

    expect(rowLabels(menu, null)).toEqual(['Rename', 'New tab', 'Close']);

    for (const item of entries) {
      item.action(context);
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
    const withoutCheckout = actionsOf(spaceMenu, null);

    expect(rowLabels(spaceMenu, null)).toEqual(['Rename', 'Close']);

    runEntries(spaceMenu, null);

    expect(runCalls).toStrictEqual([
      { command: 'space.rename', args: { id: 'space-1' } },
      { command: 'space.close', args: { id: 'space-1' } },
    ]);

    expect(withoutCheckout.at(-1)?.group).toBe(true);

    runCalls = [];
    dialogCalls = [];
    groveCalls = [];

    expect(rowLabels(spaceMenu, 'main')).toEqual([
      'Rename',
      'New worktree',
      'Open worktree',
      'Close',
    ]);

    const main = actionsOf(spaceMenu, 'main');

    runEntries(spaceMenu, 'main');

    expect(runCalls.map((call) => call.command)).toEqual(['space.rename', 'space.close']);
    expect(groveCalls).toStrictEqual([{ action: 'new', space: 'space-1' }]);
    expect(dialogCalls).toStrictEqual([{ action: 'open', space: 'space-1' }]);

    expect(main[1]?.group).toBe(false);
    expect(main.at(-1)?.group).toBe(true);

    runCalls = [];
    dialogCalls = [];
    groveCalls = [];

    expect(rowLabels(spaceMenu, 'linked')).toEqual([
      'Rename',
      'New worktree',
      'Open worktree',
      'Remove worktree',
      'Close',
    ]);

    runEntries(spaceMenu, 'linked');

    expect(groveCalls).toStrictEqual([
      { action: 'new', space: 'space-1' },
      { action: 'remove', space: 'space-1' },
    ]);

    expect(dialogCalls).toStrictEqual([{ action: 'open', space: 'space-1' }]);
  });

  test('run the global commands and mark the first theme row as a group', () => {
    terminalList = [];

    themes = [
      { name: 'graphite', label: 'Theme: graphite', light: false },
      { name: 'latte', label: 'Theme: latte', light: true },
    ];

    runCalls = [];

    const menu: MenuProps = { kind: 'global', target: target({}) };

    expect(rowLabels(menu, null)).toEqual([
      'New space',
      'Keybinds',
      'Theme: graphite',
      'Theme: latte',
    ]);

    const entries = actionsOf(menu, null);

    for (const item of entries) {
      item.action(context);
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

describe('failed checkout read', () => {
  const spaceMenu: MenuProps = { kind: 'space', target: target({ id: 'space-1' }) };

  test('show an error line in place of the worktree rows', () => {
    expect(rowLabels(spaceMenu, 'failed')).toEqual([
      'Rename',
      'Could not read the checkout',
      'Close',
    ]);
  });

  test('step past the error line', () => {
    const entries = menuEntries(spaceMenu, 'failed', host);

    expect(stepSelection(entries, 'Rename', 1)).toBe('Close');
    expect(stepSelection(entries, 'Close', 1)).toBe('Rename');
    expect(stepSelection(entries, 'Close', -1)).toBe('Rename');
  });
});

describe('checkoutOf', () => {
  const place = { machine: null, folder: '/repo', key: '[null,"/repo"]' };
  const repository = { machine: null, commonDirectory: '/repo/.git', key: '[null,"/repo/.git"]' };
  const worktree = { machine: null, top: '/repo', key: '[null,"/repo"]' };
  const branch = { kind: 'named', name: 'main' } as const;

  const identities: { kind: string; identity: GitIdentity; checkout: Checkout }[] = [
    {
      kind: 'main',
      identity: { kind: 'main', place, repository, worktree, branch },
      checkout: 'main',
    },
    {
      kind: 'linked',
      identity: { kind: 'linked', place, repository, worktree, branch },
      checkout: 'linked',
    },
    { kind: 'bare', identity: { kind: 'bare', place, repository, branch }, checkout: null },
    { kind: 'none', identity: { kind: 'none', place }, checkout: null },
    {
      kind: 'failed',
      identity: { kind: 'failed', place, error: 'fatal: unreachable' },
      checkout: 'failed',
    },
  ];

  test.each(identities)('maps a $kind read to its checkout', ({ identity, checkout }) => {
    expect(checkoutOf(identity)).toBe(checkout);
  });
});
