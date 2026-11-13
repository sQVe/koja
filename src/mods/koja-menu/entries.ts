import { bindingAction } from '../../kit/binding.ts';
import { recordOf, stringOf } from '../../kit/fields.ts';
import type { IconName } from '../../kit/iconNames.ts';
import type { ThemeChoice } from '../../kit/themes.ts';
import type { GroveAction, WorktreeAction } from '../../kit/worktree.ts';

type MenuKind = 'pane' | 'tab' | 'space' | 'global';

export type Checkout = 'main' | 'linked' | null;

export interface MenuTarget {
  pane: string | null;
  terminal: string | null;
  id: string | null;
  space: string | null;
}

export interface MenuProps {
  kind: MenuKind;
  target: MenuTarget;
}

export interface MenuEntry {
  label: string;
  icon: IconName;
  shortcuts: string[];
  group: boolean;
  action: () => void;
}

export interface TerminalFacts {
  address: string;
  name: string | null;
  parent: string | null;
  toProgram: boolean;
}

export interface MenuHost {
  run: (command: string, args: Record<string, unknown>) => void;
  openWorktreeDialog: (action: WorktreeAction, space: string | null) => void;
  openGroveDialog: (action: GroveAction, space: string | null) => void;
  terminals: () => unknown[];
  themes: () => ThemeChoice[];
}

const menuKinds: readonly MenuKind[] = ['pane', 'tab', 'space', 'global'];

const worktreeCommand = 'worktree';

const isMenuKind = (value: string | null): value is MenuKind =>
  menuKinds.some((kind) => kind === value);

export const readMenuProps = (value: unknown): MenuProps => {
  const props = recordOf(value);
  const target = recordOf(props['target']);
  const kind = stringOf(props['tab']);

  return {
    kind: isMenuKind(kind) ? kind : 'global',
    target: {
      pane: stringOf(target['pane']),
      terminal: stringOf(target['terminal']),
      id: stringOf(target['id']),
      space: stringOf(target['space']),
    },
  };
};

export const readTerminal = (value: unknown): TerminalFacts => {
  const terminal = recordOf(value);
  const labels = recordOf(terminal['labels']);

  return {
    address: stringOf(terminal['address']) ?? '',
    name: stringOf(terminal['name']),
    parent: stringOf(terminal['parent']),
    toProgram: labels['herdr.right-click'] === 'program',
  };
};

const menuShortcuts = (command: string, args: Record<string, unknown>): string[] => {
  const action = bindingAction(command, args);

  return action === command ? [command] : [action, command];
};

const commandEntry = (
  host: MenuHost,
  label: string,
  iconName: IconName,
  command: string,
  args: Record<string, unknown>,
  group = false,
): MenuEntry => ({
  label,
  icon: iconName,
  shortcuts: menuShortcuts(command, args),
  group,
  action: () => {
    host.run(command, args);
  },
});

const rightClickEntry = (host: MenuHost, terminal: TerminalFacts): MenuEntry =>
  terminal.toProgram
    ? commandEntry(host, 'Use Herdr right-click menu', 'terminal', 'terminal.right_click', {
        to: 'menu',
        terminal: terminal.address,
      })
    : commandEntry(host, 'Send right-clicks to pane', 'terminal', 'terminal.right_click', {
        to: 'program',
        terminal: terminal.address,
      });

const sendBackEntries = (
  host: MenuHost,
  terminal: TerminalFacts | null,
  all: TerminalFacts[],
): MenuEntry[] => {
  const parent = all.find((candidate) => candidate.address === terminal?.parent);

  if (terminal === null || parent === undefined) {
    return [];
  }

  const parentName = parent.name ?? parent.address;

  return [
    commandEntry(host, `Send back to ${parentName}`, 'terminal', 'terminal.park', {
      terminal: terminal.address,
    }),
  ];
};

const paneEntries = (host: MenuHost, target: MenuTarget): MenuEntry[] => {
  const all = host.terminals().map(readTerminal);
  const terminal = all.find((candidate) => candidate.address === target.terminal) ?? null;
  const pane = target.pane ?? undefined;

  return [
    commandEntry(host, 'Split right', 'panel-right', 'pane.split', { direction: 'right', pane }),
    commandEntry(host, 'Split down', 'panel-bottom', 'pane.split', { direction: 'down', pane }),
    commandEntry(host, 'Zoom', 'maximize-2', 'pane.zoom', { pane }),
    ...(terminal === null ? [] : [rightClickEntry(host, terminal)]),
    ...sendBackEntries(host, terminal, all),
    commandEntry(host, 'Close pane', 'x', 'pane.close', { pane }, true),
  ];
};

const tabEntries = (host: MenuHost, target: MenuTarget): MenuEntry[] => [
  commandEntry(host, 'Rename', 'square-pen', 'tab.rename', { id: target.id }),
  commandEntry(host, 'New tab', 'plus', 'tab.new', { space: target.space }),
  commandEntry(host, 'Close', 'x', 'tab.close', { id: target.id }, true),
];

const worktreeEntry = (
  host: MenuHost,
  label: string,
  space: string | null,
  action: WorktreeAction,
): MenuEntry => ({
  label,
  icon: 'git-branch',
  shortcuts: menuShortcuts(worktreeCommand, { action, space }),
  group: false,
  action: () => {
    host.openWorktreeDialog(action, space);
  },
});

const groveEntry = (
  host: MenuHost,
  label: string,
  space: string | null,
  action: GroveAction,
): MenuEntry => ({
  label,
  icon: 'git-branch',
  shortcuts: [],
  group: false,
  action: () => {
    host.openGroveDialog(action, space);
  },
});

const spaceEntries = (host: MenuHost, target: MenuTarget, checkout: Checkout): MenuEntry[] => {
  const worktreeItems =
    checkout === null
      ? []
      : [
          groveEntry(host, 'New worktree', target.id, 'new'),
          worktreeEntry(host, 'Open worktree', target.id, 'open'),
        ];

  const removeItems =
    checkout === 'linked' ? [groveEntry(host, 'Remove worktree', target.id, 'remove')] : [];

  return [
    commandEntry(host, 'Rename', 'square-pen', 'space.rename', { id: target.id }),
    ...worktreeItems,
    ...removeItems,
    commandEntry(host, 'Close', 'x', 'space.close', { id: target.id }, true),
  ];
};

const globalEntries = (host: MenuHost): MenuEntry[] => [
  commandEntry(host, 'New space', 'plus', 'space.new', {}),
  commandEntry(host, 'Keybinds', 'keyboard', 'app.help', {}, true),
  ...host
    .themes()
    .map((theme, index) =>
      commandEntry(host, theme.label, 'palette', 'app.theme', { name: theme.name }, index === 0),
    ),
];

export const selectedIndex = (items: MenuEntry[], label: string | null): number => {
  const index = items.findIndex((item) => item.label === label);

  return index === -1 ? 0 : index;
};

export const stepSelection = (
  items: MenuEntry[],
  label: string | null,
  step: 1 | -1,
): string | null => {
  const next = (selectedIndex(items, label) + step + items.length) % items.length;

  return items[next]?.label ?? null;
};

export const menuEntries = (menu: MenuProps, checkout: Checkout, host: MenuHost): MenuEntry[] => {
  if (menu.kind === 'pane') {
    return paneEntries(host, menu.target);
  }

  if (menu.kind === 'tab') {
    return tabEntries(host, menu.target);
  }

  return menu.kind === 'space' ? spaceEntries(host, menu.target, checkout) : globalEntries(host);
};
