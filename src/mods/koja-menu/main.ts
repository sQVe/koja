// Context menus with Herdr's items. Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "global", target }.
// Up and down move, Enter runs, Esc closes. The worktree items open Herdr's worktree dialog.

import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { v_flex } from 'gpui-base';
import { closeOverlay, exec, panes, props, run, spaces, terminals } from 'herdr';

import type { IconName, WorktreeAction } from '../../kit/index.ts';
import {
  colors,
  icon,
  keyHint,
  listRow,
  openWorktreeDialog,
  recordOf,
  separator,
  shortcutFor,
  spaceFolder,
  spacing,
  stringOf,
  textSize,
} from '../../kit/index.ts';

type MenuKind = 'pane' | 'tab' | 'space' | 'global';

// A space's checkout: a repository's own, a linked worktree, or none.
type Checkout = 'main' | 'linked' | null;

interface MenuTarget {
  pane: string | null;
  terminal: string | null;
  id: string | null;
  space: string | null;
}

interface MenuProps {
  kind: MenuKind;
  target: MenuTarget;
  overlay: string | null;
}

interface MenuItem {
  label: string;
  command: string;
  args: Record<string, unknown>;
}

interface TerminalFacts {
  address: string;
  name: string | null;
  parent: string | null;
  toProgram: boolean;
}

const menuKinds: readonly MenuKind[] = ['pane', 'tab', 'space', 'global'];

const themeNames = ['graphite', 'ink', 'moss', 'atom-one-dark'];

const worktreeCommand = 'worktree';

const isMenuKind = (value: string | null): value is MenuKind =>
  menuKinds.some((kind) => kind === value);

const readProps = (): MenuProps => {
  const value = recordOf(props());
  const target = recordOf(value['target']);
  const kind = stringOf(value['tab']);

  return {
    kind: isMenuKind(kind) ? kind : 'global',
    target: {
      pane: stringOf(target['pane']),
      terminal: stringOf(target['terminal']),
      id: stringOf(target['id']),
      space: stringOf(target['space']),
    },
    overlay: stringOf(value['overlay']),
  };
};

const readTerminal = (value: unknown): TerminalFacts => {
  const terminal = recordOf(value);
  const labels = recordOf(terminal['labels']);

  return {
    address: stringOf(terminal['address']) ?? '',
    name: stringOf(terminal['name']),
    parent: stringOf(terminal['parent']),
    toProgram: labels['herdr.right-click'] === 'program',
  };
};

const checkoutOf = async (folder: string, machine: string | null): Promise<Checkout> => {
  const top = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: folder, on: machine });

  const common = await exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: folder,
    on: machine,
  });

  if (top.code !== 0 || common.code !== 0) {
    return null;
  }

  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? 'main' : 'linked';
};

const rightClickItem = (terminal: TerminalFacts): MenuItem =>
  terminal.toProgram
    ? {
        label: 'Use Herdr right-click menu',
        command: 'terminal.right_click',
        args: { terminal: terminal.address, to: 'menu' },
      }
    : {
        label: 'Send right-clicks to pane',
        command: 'terminal.right_click',
        args: { terminal: terminal.address, to: 'program' },
      };

// A kept sub-agent can go back under its parent, still running.
const sendBackItems = (terminal: TerminalFacts | null, all: TerminalFacts[]): MenuItem[] => {
  const parent = all.find((candidate) => candidate.address === terminal?.parent);

  if (terminal === null || parent === undefined) {
    return [];
  }

  const parentName = parent.name ?? parent.address;

  return [
    {
      label: `Send back to ${parentName}`,
      command: 'terminal.park',
      args: { terminal: terminal.address },
    },
  ];
};

const paneItems = (target: MenuTarget): MenuItem[] => {
  const all = terminals().map(readTerminal);
  const terminal = all.find((candidate) => candidate.address === target.terminal) ?? null;
  const pane = target.pane ?? undefined;

  return [
    { label: 'Split right', command: 'pane.split', args: { direction: 'right', pane } },
    { label: 'Split down', command: 'pane.split', args: { direction: 'down', pane } },
    { label: 'Zoom', command: 'pane.zoom', args: { pane } },
    ...(terminal === null ? [] : [rightClickItem(terminal)]),
    ...sendBackItems(terminal, all),
    { label: 'Close pane', command: 'pane.close', args: { pane } },
  ];
};

const tabItems = (target: MenuTarget): MenuItem[] => [
  { label: 'Rename', command: 'tab.rename', args: { id: target.id } },
  { label: 'New tab', command: 'tab.new', args: { space: target.space } },
  { label: 'Close', command: 'tab.close', args: { id: target.id } },
];

const worktreeItem = (label: string, space: string | null, action: WorktreeAction): MenuItem => ({
  label,
  command: worktreeCommand,
  args: { space, action },
});

const spaceItems = (target: MenuTarget, checkout: Checkout): MenuItem[] => {
  const worktreeItems =
    checkout === null
      ? []
      : [
          worktreeItem('New worktree', target.id, 'new'),
          worktreeItem('Open worktree', target.id, 'open'),
        ];

  const removeItems =
    checkout === 'linked' ? [worktreeItem('Remove worktree', target.id, 'remove')] : [];

  return [
    { label: 'Rename', command: 'space.rename', args: { id: target.id } },
    ...worktreeItems,
    ...removeItems,
    { label: 'Close', command: 'space.close', args: { id: target.id } },
  ];
};

const globalItems = (): MenuItem[] => [
  { label: 'New space', command: 'space.new', args: {} },
  { label: 'Keybinds', command: 'app.help', args: {} },
  ...themeNames.map((name) => ({
    label: `Theme: ${name.replaceAll('-', ' ')}`,
    command: 'app.theme',
    args: { name },
  })),
];

const menuItems = (menu: MenuProps, checkout: Checkout): MenuItem[] => {
  if (menu.kind === 'pane') {
    return paneItems(menu.target);
  }

  if (menu.kind === 'tab') {
    return tabItems(menu.target);
  }

  return menu.kind === 'space' ? spaceItems(menu.target, checkout) : globalItems();
};

const iconByCommand: Record<string, IconName> = {
  [worktreeCommand]: 'git-branch',
  'app.help': 'keyboard',
  'app.theme': 'palette',
  'pane.zoom': 'maximize-2',
  'terminal.right_click': 'terminal',
  'terminal.park': 'terminal',
};

const menuIcon = (item: MenuItem): IconName => {
  if (item.command.endsWith('.close')) {
    return 'x';
  }

  if (item.command.endsWith('.rename')) {
    return 'square-pen';
  }

  if (item.command.endsWith('.new')) {
    return 'plus';
  }

  if (item.command === 'pane.split') {
    return item.args['direction'] === 'down' ? 'panel-bottom' : 'panel-right';
  }

  return iconByCommand[item.command] ?? 'terminal';
};

// A line goes above closing items, the keybinds, and the first theme.
const startsGroup = (items: MenuItem[], index: number): boolean => {
  const item = items[index];
  const previous = items[index - 1];

  if (item === undefined || previous === undefined) {
    return false;
  }

  const closes = item.command.endsWith('.close') || item.command === 'app.help';
  const firstTheme = item.command === 'app.theme' && previous.command !== 'app.theme';

  return closes || firstTheme;
};

// `pane.split:right` binds pane.split with { direction: "right" }.
const itemShortcut = (item: MenuItem): string | null => {
  const value = Object.values(item.args)[0];
  const actions = typeof value === 'string' ? [`${item.command}:${value}`, item.command] : [item.command];

  return shortcutFor(...actions);
};

const worktreeActionOf = (value: unknown): WorktreeAction => {
  if (value === 'open' || value === 'remove') {
    return value;
  }

  return 'new';
};

export default class Menu extends View {
  private at = 0;

  private checkout: Checkout = null;

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.lookAtCheckout(cx);
  }

  override render(): Element {
    const palette = colors();
    const items = menuItems(readProps(), this.checkout);

    const menu = v_flex()
      .id('menu')
      .w_full()
      .min_h(0)
      .py(spacing.xsmall)
      .bg(palette.popover)
      .text_size(textSize.default)
      .on_key_down((event, cx) => {
        this.onKey(event, items, cx);
      })
      .children(items.map((_item, index) => this.row(items, index)));

    return this.handle === null ? menu : menu.track_focus(this.handle);
  }

  private lookAtCheckout(cx: AsyncContext): void {
    const menu = readProps();
    const space = spaces().find((candidate) => candidate.id === menu.target.id);

    if (menu.kind !== 'space' || space === undefined) {
      return;
    }

    const folder = spaceFolder(space, panes());

    cx.spawn(async (taskCx) => {
      this.checkout = await checkoutOf(folder, space.machine).catch(() => null);
      taskCx.notify();
    });
  }

  private choose(item: MenuItem | undefined): void {
    if (item === undefined) {
      return;
    }

    this.closeMenu();

    if (item.command === worktreeCommand) {
      openWorktreeDialog(worktreeActionOf(item.args['action']), stringOf(item.args['space']));
    } else {
      run(item.command, item.args);
    }
  }

  private closeMenu(): void {
    const overlay = readProps().overlay;

    if (overlay !== null) {
      closeOverlay(overlay);
    }
  }

  private onKey(event: KeyEvent, items: MenuItem[], cx: Context): void {
    const count = items.length;

    if (event.key === 'down') {
      this.at = (this.at + 1) % count;
    } else if (event.key === 'up') {
      this.at = (this.at + count - 1) % count;
    } else if (event.key === 'enter') {
      this.choose(items[this.at]);
    } else if (event.key === 'escape') {
      this.closeMenu();
    } else {
      return;
    }

    cx.notify();
  }

  private row(items: MenuItem[], index: number): Element {
    const item = items[index];
    const shortcut = item === undefined ? null : itemShortcut(item);
    const group = v_flex();

    if (item === undefined) {
      return group;
    }

    if (startsGroup(items, index)) {
      group.child(separator());
    }

    const row = listRow({
      size: 'medium',
      inset: true,
      state: index === this.at ? 'selected' : 'normal',
      start: icon(menuIcon(item)).text_color(colors().muted),
      label: item.label,
      end: shortcut === null ? [] : [keyHint(shortcut)],
    })
      .id(`menu-item-${index}`)
      .on_click(() => {
        this.choose(item);
      });

    return group.child(row);
  }
}
