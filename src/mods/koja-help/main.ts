import type { InputState } from 'gpui-base';
import { InputState as InputStates, ScrollHandle, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { run, setShared, shared } from 'herdr';

import {
  closeOverlay,
  keyHint,
  listRow,
  overlaySize,
  popupSurface,
  recordOverlayClose,
  runNormalKeys,
  searchField,
  sectionHeader,
  stateLine,
} from '../../kit/index.ts';
import type { HelpGroup, HelpRow } from './rows.ts';
import { helpGroups } from './rows.ts';

interface ShownRow {
  row: HelpRow;
  child: number;
}

const refocusMilliseconds = 600;

// The scroll handle shows a direct child of the list by its index, so each row keeps the index
// it has among the group headers, notes, and rows.
const shownRowsOf = (groups: readonly HelpGroup[]): ShownRow[] => {
  const shown: ShownRow[] = [];
  let child = 0;

  for (const group of groups) {
    child += group.note === undefined ? 1 : 2;

    for (const row of group.rows) {
      shown.push({ row, child });
      child += 1;
    }
  }

  return shown;
};

const clampIndex = (index: number, count: number): number =>
  Math.min(index, Math.max(0, count - 1));

const groupElements = (group: HelpGroup, selected: HelpRow | undefined): Element[] => {
  const elements = [sectionHeader({ label: group.title, size: 'default' })];

  if (group.note !== undefined) {
    elements.push(stateLine({ kind: 'empty', text: group.note }));
  }

  for (const row of group.rows) {
    const end = row.keys.map((sequence) => {
      const keys = sequence.join(' ');

      return keyHint(keys);
    });

    const state = row === selected ? 'selected' : 'normal';

    elements.push(listRow({ size: 'large', inset: true, state, label: row.name, end }));
  }

  return elements;
};

export default class Help extends View {
  private query = '';

  private at = 0;

  private readonly input: InputState = InputStates.new({ placeholder: 'Search keys…' });

  private readonly scroll = ScrollHandle.new();

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();

    this.input.on('change', (_event, changeCx) => {
      this.query = this.input.value();
      this.at = 0;
      this.scroll.scroll_to_item(0);
      changeCx.notify();
    });

    this.input.on('submit', () => {
      this.runSelected();
    });

    this.input.focus();

    cx.timer.after(refocusMilliseconds, () => {
      this.input.focus();
    });
  }

  override close(): void {
    recordOverlayClose();
  }

  override render(): Element {
    const groups = helpGroups(this.query);
    const shown = shownRowsOf(groups);
    const selected = shown[clampIndex(this.at, shown.length)]?.row;
    const items = groups.flatMap((group) => groupElements(group, selected));

    if (groups.length === 0) {
      items.push(stateLine({ kind: 'empty', text: `Nothing matches "${this.query}".` }));
    }

    const list = v_flex()
      .id('help-rows')
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .track_scroll(this.scroll)
      .children(items);

    const help = popupSurface('help')
      .h(overlaySize.wideMenuContentHeight)
      .on_key_down((event, keyCx) => {
        this.onKey(event, shown, keyCx);
      })
      .child(searchField(this.input, 'search'))
      .child(list);

    return this.handle === null ? help : help.track_focus(this.handle);
  }

  private closeHelp(): void {
    recordOverlayClose();
    closeOverlay();
  }

  private runSelected(): void {
    const shown = shownRowsOf(helpGroups(this.query));
    const keys = shown[clampIndex(this.at, shown.length)]?.row.keys[0];

    if (keys === undefined) {
      return;
    }

    this.closeHelp();
    runNormalKeys({ run, setShared, shared }, keys);
  }

  private onKey(event: KeyEvent, shown: readonly ShownRow[], cx: Context): void {
    const last = Math.max(shown.length - 1, 0);
    const at = clampIndex(this.at, shown.length);

    if (event.key === 'escape') {
      this.closeHelp();

      return;
    }

    if (event.key === 'down') {
      this.at = Math.min(at + 1, last);
    } else if (event.key === 'up') {
      this.at = Math.max(at - 1, 0);
    } else {
      return;
    }

    // The first row shows from the top of the list, so its group header shows too.
    const child = this.at === 0 ? 0 : shown[this.at]?.child;

    if (child !== undefined) {
      this.scroll.scroll_to_item(child);
    }

    cx.stop_propagation();
    cx.notify();
  }
}
