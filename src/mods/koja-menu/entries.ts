import type { Context } from 'gpui-kit';

import type { GitIdentity } from '../../data/gitIdentity.ts';
import { bindingAction } from '../../kit/binding.ts';
import { numberOf, recordOf, stringOf } from '../../kit/fields.ts';
import type { IconName } from '../../kit/iconNames.ts';
import { paneActions } from '../../kit/paneHeaderMenuModel.ts';
import type { PaneHeaderMenuFieldOptions } from '../../kit/paneHeaderMenuModel.ts';
import type { ThemeChoice } from '../../kit/themes.ts';
import type { GroveAction, WorktreeAction } from '../../kit/worktree.ts';

type MenuKind = 'pane' | 'tab' | 'space' | 'global';

export type Checkout = 'main' | 'linked' | 'failed' | null;

export interface MenuTarget {
  pane: string | null;
  terminal: string | null;
  id: string | null;
  space: string | null;
}

interface MenuTicketLink {
  id: string;
  url: string;
}

interface MenuPullLink {
  number: number;
  url: string;
}

export interface MenuProps {
  kind: MenuKind;
  target: MenuTarget;
  task?: string | null;
  branch?: string | null;
  folder?: string | null;
  ticket?: MenuTicketLink | null;
  pull?: MenuPullLink | null;
  overflow?: boolean;
  zoomed?: boolean;
}

export interface MenuAction {
  kind: 'action';
  label: string;
  icon: IconName;
  shortcuts: string[];
  group: boolean;
  state?: 'on' | 'off';
  action: (cx: Context) => void;
}

// A line that reports a failed read in place of the rows that read would have drawn.
interface MenuError {
  kind: 'error';
  text: string;
}

export type MenuEntry = MenuAction | MenuError;

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
  panes: () => { pane: string }[];
  themes: () => ThemeChoice[];
}

const menuKinds: readonly MenuKind[] = ['pane', 'tab', 'space', 'global'];

const worktreeCommand = 'worktree';

const checkoutErrorText = 'Could not read the checkout';

export const checkoutOf = (identity: GitIdentity): Checkout => {
  if (identity.kind === 'main' || identity.kind === 'linked') {
    return identity.kind;
  }

  return identity.kind === 'failed' ? 'failed' : null;
};

const isMenuKind = (value: string | null): value is MenuKind =>
  menuKinds.some((kind) => kind === value);

// `open_url` takes an absolute http or https URL with a host and refuses every other scheme.
const webUrl = /^https?:\/\/[^\s/?#@:]+(?::\d+)?(?:[/?#]|$)/;

const namedTextOf = (value: unknown): string | null => {
  const text = stringOf(value)?.trim();

  return text === undefined || text === '' ? null : text;
};

const ticketLinkOf = (value: unknown): MenuTicketLink | null => {
  const ticket = recordOf(value);
  const id = namedTextOf(ticket['id']);
  const url = stringOf(ticket['url']);

  if (id === null || url === null || !webUrl.test(url)) {
    return null;
  }

  return { id, url };
};

const pullLinkOf = (value: unknown): MenuPullLink | null => {
  const pull = recordOf(value);
  const number = numberOf(pull['number']);
  const url = stringOf(pull['url']);

  if (number === null || url === null) {
    return null;
  }

  const counted = Number.isInteger(number) && number > 0 && webUrl.test(url);

  return counted ? { number, url } : null;
};

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
    task: stringOf(props['task']),
    branch: namedTextOf(props['branch']),
    folder: stringOf(props['folder']),
    ticket: ticketLinkOf(props['ticket']),
    pull: pullLinkOf(props['pull']),
    overflow: props['overflow'] === true,
    zoomed: props['zoomed'] === true,
  };
};

const isPresent = (text: string | null | undefined): text is string =>
  text !== null && text !== undefined && text !== '';

export const menuDetails = (menu: MenuProps): PaneHeaderMenuFieldOptions => {
  const details: PaneHeaderMenuFieldOptions = {};

  if (isPresent(menu.task)) {
    details.task = menu.task;
  }

  if (isPresent(menu.branch)) {
    details.branch = menu.branch;
  }

  if (isPresent(menu.folder)) {
    details.folder = menu.folder;
  }

  return details;
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
): MenuAction => ({
  kind: 'action',
  label,
  icon: iconName,
  shortcuts: menuShortcuts(command, args),
  group,
  action: () => {
    host.run(command, args);
  },
});

const rightClickEntry = (host: MenuHost, terminal: TerminalFacts): MenuAction => {
  const to = terminal.toProgram ? 'menu' : 'program';

  return {
    kind: 'action',
    label: 'Send right-clicks to pane',
    icon: 'monitor',
    shortcuts: menuShortcuts('terminal.right_click', { to, terminal: terminal.address }),
    group: false,
    state: terminal.toProgram ? 'on' : 'off',
    action: () => {
      host.run('terminal.right_click', { to, terminal: terminal.address });
    },
  };
};

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

const overflowEntries = (host: MenuHost, target: MenuTarget, zoomed: boolean): MenuEntry[] => {
  const pane = target.pane ?? undefined;

  const commands: [string, Record<string, unknown>][] = [
    ['pane.split', { direction: 'right', pane }],
    ['pane.split', { direction: 'down', pane }],
    ['pane.zoom', { pane }],
    ['pane.close', { pane }],
  ];

  return paneActions({ zoomed }).map((entry, index) => {
    const [command, args] = commands[index] ?? ['', {}];

    return {
      kind: 'action',
      label: entry.label,
      icon: entry.icon,
      shortcuts: menuShortcuts(command, args),
      group: entry.label === 'Close pane',
      action: () => {
        host.run(command, args);
      },
    };
  });
};

const tabPaneEntries = (host: MenuHost, pane: string | undefined): MenuEntry[] => [
  commandEntry(host, 'Rename', 'square-pen', 'pane.rename', { pane }),
  commandEntry(host, 'Split right', 'panel-right', 'pane.split', { direction: 'right', pane }),
  commandEntry(host, 'Split down', 'panel-bottom', 'pane.split', { direction: 'down', pane }),
  commandEntry(host, 'Zoom', 'maximize-2', 'pane.zoom', { pane }),
];

const paneEntries = (host: MenuHost, target: MenuTarget): MenuEntry[] => {
  const all = host.terminals().map(readTerminal);
  const terminal = all.find((candidate) => candidate.address === target.terminal) ?? null;
  const pane = target.pane ?? undefined;
  const inTab = host.panes().some((candidate) => candidate.pane === target.pane);

  return [
    ...(inTab ? tabPaneEntries(host, pane) : []),
    ...(terminal === null ? [] : [rightClickEntry(host, terminal)]),
    ...sendBackEntries(host, terminal, all),
    ...(inTab ? [commandEntry(host, 'Close pane', 'x', 'pane.close', { pane }, true)] : []),
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
  kind: 'action',
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
  kind: 'action',
  label,
  icon: 'git-branch',
  shortcuts: [],
  group: false,
  action: () => {
    host.openGroveDialog(action, space);
  },
});

const worktreeItems = (host: MenuHost, target: MenuTarget, checkout: Checkout): MenuEntry[] => {
  if (checkout === 'failed') {
    return [{ kind: 'error', text: checkoutErrorText }];
  }

  if (checkout === null) {
    return [];
  }

  const rows: MenuEntry[] = [
    groveEntry(host, 'New worktree', target.id, 'new'),
    worktreeEntry(host, 'Open worktree', target.id, 'open'),
  ];

  if (checkout === 'linked') {
    rows.push(groveEntry(host, 'Remove worktree', target.id, 'remove'));
  }

  return rows;
};

const urlEntry = (label: string, icon: IconName, url: string): MenuAction => ({
  kind: 'action',
  label,
  icon,
  shortcuts: [],
  group: false,
  action: (cx) => {
    cx.open_url(url);
  },
});

const clipboardEntry = (label: string, text: string): MenuAction => ({
  kind: 'action',
  label,
  icon: 'git-branch',
  shortcuts: [],
  group: false,
  action: (cx) => {
    cx.write_to_clipboard(text);
  },
});

const linkEntries = (menu: MenuProps): MenuEntry[] => {
  const rows: MenuAction[] = [];

  if (menu.ticket !== null && menu.ticket !== undefined) {
    rows.push(urlEntry('Open ticket', 'file', menu.ticket.url));
  }

  if (menu.pull !== null && menu.pull !== undefined) {
    rows.push(urlEntry('Open PR on GitHub', 'git-pull-request', menu.pull.url));
  }

  if (menu.branch !== null && menu.branch !== undefined) {
    rows.push(clipboardEntry('Copy branch name', menu.branch));
  }

  const [first] = rows;

  if (first !== undefined) {
    first.group = true;
  }

  return rows;
};

const spaceEntries = (host: MenuHost, menu: MenuProps, checkout: Checkout): MenuEntry[] => [
  commandEntry(host, 'Rename', 'square-pen', 'space.rename', { id: menu.target.id }),
  // The PR watch entry goes after `Open PR on GitHub` and before `Copy branch name`.
  ...linkEntries(menu),
  ...worktreeItems(host, menu.target, checkout),
  commandEntry(host, 'Close', 'x', 'space.close', { id: menu.target.id }, true),
];

const globalEntries = (host: MenuHost): MenuEntry[] => [
  commandEntry(host, 'New space', 'plus', 'space.new', {}),
  commandEntry(host, 'Keybinds', 'keyboard', 'app.help', {}, true),
  ...host
    .themes()
    .map((theme, index) =>
      commandEntry(host, theme.label, 'palette', 'app.theme', { name: theme.name }, index === 0),
    ),
];

export const isAction = (entry: MenuEntry): entry is MenuAction => entry.kind === 'action';

const firstAction = (items: MenuEntry[]): number => {
  const index = items.findIndex(isAction);

  return index === -1 ? 0 : index;
};

export const selectedIndex = (items: MenuEntry[], label: string | null): number => {
  const index = items.findIndex((item) => isAction(item) && item.label === label);

  return index === -1 ? firstAction(items) : index;
};

export const stepSelection = (
  items: MenuEntry[],
  label: string | null,
  step: 1 | -1,
): string | null => {
  const actions = items.filter(isAction);

  if (actions.length === 0) {
    return null;
  }

  const next = (selectedIndex(actions, label) + step + actions.length) % actions.length;

  return actions[next]?.label ?? null;
};

export const menuEntries = (menu: MenuProps, checkout: Checkout, host: MenuHost): MenuEntry[] => {
  if (menu.kind === 'pane') {
    return menu.overflow === true
      ? overflowEntries(host, menu.target, menu.zoomed === true)
      : paneEntries(host, menu.target);
  }

  if (menu.kind === 'tab') {
    return tabEntries(host, menu.target);
  }

  return menu.kind === 'space' ? spaceEntries(host, menu, checkout) : globalEntries(host);
};
