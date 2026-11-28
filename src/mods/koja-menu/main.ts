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
  openGroveDialog,
  openWorktreeDialog,
  overlayCard,
  overlayHints,
  overlayRow,
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
  toggleButton,
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
  panes,
  themes: themeChoices,
};

export default class Menu extends View {
  private selected: string | null = null;

  private checkout: Checkout = null;

  private place: { machine: string | null; folder: string } | null = null;

  private reading = false;

  private normalMode = false;

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.normalMode = shared('koja-modal') === true;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.lookAtCheckout(readMenuProps(props()), cx);
  }

  override render(): Element {
    const menuProps = readMenuProps(props());
    const items = menuEntries(menuProps, this.checkout, menuHost);

    const details = menuProps.kind === 'pane' ? paneHeaderMenuDetails(menuDetails(menuProps)) : [];

    const selected = selectedIndex(items, this.selected);

    const menu = withTextRole(overlayCard('menu'), 'body')
      .on_key_down((event, cx) => {
        this.onKey(event, items, cx);
      })
      .children(this.title(menuProps))
      .children(details)
      .children(items.map((_item, index) => this.row(items, index, selected)));

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
      .px(spacing.medium)
      .gap(spacing.small)
      .items_center()
      .child(mark)
      .child(roleText('sectionHeading', paneName(pane)));

    return [line];
  }

  private lookAtCheckout(menu: MenuProps, cx: Context): void {
    if (checking()) {
      return;
    }

    const space = spaces().find((candidate) => candidate.id === menu.target.id);

    if (menu.kind !== 'space' || space === undefined) {
      return;
    }

    this.place = { machine: space.machine, folder: spaceFolder(space, panes()) };
    this.readCheckout(cx);
  }

  // A read uses the place the failed read named, even when the space has moved since, and one
  // already under way keeps the error line until it answers.
  private readCheckout(cx: Context): void {
    if (this.reading || this.place === null) {
      return;
    }

    const { machine, folder } = this.place;

    this.reading = true;

    cx.spawn(async (taskCx) => {
      try {
        const identity = await readGitIdentity(exec, machine, folder);

        this.checkout = checkoutOf(identity);
      } finally {
        this.reading = false;
        taskCx.notify();
      }
    });
  }

  private choose(item: MenuEntry | undefined, cx: Context): void {
    if (item === undefined || item.kind === 'error') {
      return;
    }

    this.closeMenu();
    item.action(cx);
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
      this.choose(items[selectedIndex(items, this.selected)], cx);
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

    if (item.kind === 'error') {
      return group.child(this.errorLine(item.text));
    }

    if (item.group) {
      group.child(separator());
    }

    const state = index === selected ? 'selected' : 'normal';
    const start = icon(item.icon).text_color(colors().muted);
    const setting = item.state === undefined ? [] : [roleText('detail', item.state)];
    const hint = hintFor(...item.shortcuts);
    const end = [...setting, ...overlayHints(hint, this.normalMode)];

    const row = overlayRow({
      size: 'small',
      state,
      start,
      label: item.label,
      end,
    })
      .id(`menu-item-${index}`)
      .on_click((_event, cx) => {
        this.choose(item, cx);
      });

    return group.child(row);
  }

  private errorLine(text: string): Element {
    const retry = toggleButton({ label: 'Retry', active: false }).on_click((_event, cx) => {
      cx.stop_propagation();
      this.readCheckout(cx);
    });

    return stateLine({ kind: 'error', text, action: retry });
  }
}
