import { h_flex, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { checking, exec, panes, props, shared, spaces, terminals } from 'herdr';

import { readGitIdentity } from '../../data/gitIdentity.ts';
import {
  askFirst,
  closeOverlay,
  colors,
  hintFor,
  icon,
  listRow,
  openGroveDialog,
  openWorktreeDialog,
  overlayCard,
  overlayHints,
  paneHeaderMenuDetails,
  paneName,
  paneProgram,
  programIcon,
  roleText,
  rowHeight,
  separator,
  spaceFolder,
  spacing,
  stateLine,
  themeChoices,
  withTextRole,
} from '../../kit/index.ts';
import type { Checkout, MenuEntry, MenuHost, MenuProps } from './entries.ts';
import {
  checkoutOf,
  menuDetails,
  menuEntries,
  readMenuProps,
  selectedIndex,
  stepSelection,
} from './entries.ts';

const menuHost: MenuHost = {
  run: askFirst,
  openWorktreeDialog,
  openGroveDialog,
  terminals,
  themes: themeChoices,
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
    const menuProps = readMenuProps(props());
    const items = menuEntries(menuProps, this.checkout, menuHost);

    const details = menuProps.kind === 'pane' ? paneHeaderMenuDetails(menuDetails(menuProps)) : [];

    const selected = selectedIndex(items, this.selected);
    const normalMode = shared('koja-modal') === true;

    const menu = withTextRole(overlayCard('menu'), 'body')
      .on_key_down((event, cx) => {
        this.onKey(event, items, cx);
      })
      .children(this.title(menuProps))
      .children(details)
      .children(items.map((_item, index) => this.row(items, index, selected, normalMode)));

    return this.handle === null ? menu : menu.track_focus(this.handle);
  }

  private title(menu: MenuProps): Element[] {
    if (menu.kind !== 'pane') {
      return [];
    }

    const pane = panes().find((candidate) => candidate.pane === menu.target.pane);

    if (pane === undefined) {
      return [];
    }

    const mark = programIcon(paneProgram(pane), 'small').text_color(colors().muted);

    const line = h_flex()
      .h(rowHeight.small)
      .flex_none()
      .px(spacing.large + spacing.hairline)
      .gap(spacing.small)
      .items_center()
      .child(mark)
      .child(roleText('sectionHeading', paneName(pane)));

    return [line];
  }

  private lookAtCheckout(cx: AsyncContext): void {
    if (checking()) {
      return;
    }

    const menu = readMenuProps(props());
    const space = spaces().find((candidate) => candidate.id === menu.target.id);

    if (menu.kind !== 'space' || space === undefined) {
      return;
    }

    const folder = spaceFolder(space, panes());

    cx.spawn(async (taskCx) => {
      const identity = await readGitIdentity(exec, space.machine, folder);

      this.checkout = checkoutOf(identity);
      taskCx.notify();
    });
  }

  private choose(item: MenuEntry | undefined): void {
    if (item === undefined || item.kind === 'error') {
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

  private row(items: MenuEntry[], index: number, selected: number, normalMode: boolean): Element {
    const item = items[index];
    const group = v_flex();

    if (item === undefined) {
      return group;
    }

    if (item.kind === 'error') {
      return group.child(stateLine({ kind: 'error', text: item.text }));
    }

    if (item.group) {
      group.child(separator());
    }

    const state = index === selected ? 'selected' : 'normal';
    const start = icon(item.icon).text_color(colors().muted);
    const setting = item.state === undefined ? [] : [roleText('detail', item.state)];
    const hint = hintFor(...item.shortcuts);
    const end = [...setting, ...overlayHints(hint, normalMode)];

    const row = listRow({
      size: 'small',
      inset: true,
      state,
      start,
      label: item.label,
      end,
    })
      .id(`menu-item-${index}`)
      .on_click(() => {
        this.choose(item);
      });

    return group.child(row);
  }
}
