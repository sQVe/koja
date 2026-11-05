import { v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { exec, panes, props, spaces, terminals } from 'herdr';

import {
  askFirst,
  closeOverlay,
  colors,
  icon,
  keyHint,
  listRow,
  openWorktreeDialog,
  popupSurface,
  separator,
  shortcutFor,
  spaceFolder,
  spacing,
  themeChoices,
  withTextRole,
} from '../../kit/index.ts';
import type { Checkout, MenuEntry, MenuHost } from './entries.ts';
import { menuEntries, readMenuProps, selectedIndex, stepSelection } from './entries.ts';

const menuHost: MenuHost = {
  run: askFirst,
  openWorktreeDialog,
  terminals,
  themes: themeChoices,
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

export default class Menu extends View {
  private selected: string | null = null;

  private checkout: Checkout = null;

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.lookAtCheckout(cx);
  }

  override render(): Element {
    const items = menuEntries(readMenuProps(props()), this.checkout, menuHost);
    const selected = selectedIndex(items, this.selected);

    const menu = withTextRole(popupSurface('menu'), 'body')
      .py(spacing.xsmall)
      .on_key_down((event, cx) => {
        this.onKey(event, items, cx);
      })
      .children(items.map((_item, index) => this.row(items, index, selected)));

    return this.handle === null ? menu : menu.track_focus(this.handle);
  }

  private lookAtCheckout(cx: AsyncContext): void {
    const menu = readMenuProps(props());
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

  private choose(item: MenuEntry | undefined): void {
    if (item === undefined) {
      return;
    }

    this.closeMenu();
    item.action();
  }

  private closeMenu(): void {
    closeOverlay();
  }

  private onKey(event: KeyEvent, items: MenuEntry[], cx: Context): void {
    if (event.key === 'down') {
      this.selected = stepSelection(items, this.selected, 1);
    } else if (event.key === 'up') {
      this.selected = stepSelection(items, this.selected, -1);
    } else if (event.key === 'enter') {
      this.choose(items[selectedIndex(items, this.selected)]);
    } else if (event.key === 'escape') {
      this.closeMenu();
    } else {
      return;
    }

    cx.notify();
  }

  private row(items: MenuEntry[], index: number, selected: number): Element {
    const item = items[index];
    const group = v_flex();

    if (item === undefined) {
      return group;
    }

    const shortcut = shortcutFor(...item.shortcuts);

    if (item.group) {
      group.child(separator());
    }

    const row = listRow({
      size: 'small',
      inset: true,
      state: index === selected ? 'selected' : 'normal',
      start: icon(item.icon).text_color(colors().muted),
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
