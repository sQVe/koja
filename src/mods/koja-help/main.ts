import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';

import {
  closeOverlay,
  keyHint,
  listRow,
  overlaySize,
  popupSurface,
  recordOverlayClose,
  searchField,
  sectionHeader,
  stateLine,
} from '../../kit/index.ts';
import type { HelpGroup } from './rows.ts';
import { helpGroups } from './rows.ts';

const refocusMilliseconds = 600;

const groupElements = (group: HelpGroup): Element[] => {
  const elements = [sectionHeader({ label: group.title, size: 'default' })];

  if (group.note !== undefined) {
    elements.push(stateLine({ kind: 'empty', text: group.note }));
  }

  for (const row of group.rows) {
    const end = row.keys.map((sequence) => {
      const keys = sequence.join(' ');

      return keyHint(keys);
    });

    elements.push(listRow({ size: 'large', inset: true, state: 'normal', label: row.name, end }));
  }

  return elements;
};

export default class Help extends View {
  private query = '';

  private readonly input: InputState = InputStates.new({ placeholder: 'Search keys…' });

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();

    this.input.on('change', (_event, changeCx) => {
      this.query = this.input.value();
      changeCx.notify();
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
    const items = groups.flatMap(groupElements);

    if (groups.length === 0) {
      items.push(stateLine({ kind: 'empty', text: `Nothing matches "${this.query}".` }));
    }

    const list = v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(items);

    const help = popupSurface('help')
      .h(overlaySize.wideMenuContentHeight)
      .on_key_down((event) => {
        if (event.key === 'escape') {
          recordOverlayClose();
          closeOverlay();
        }
      })
      .child(searchField(this.input, 'search'))
      .child(list);

    return this.handle === null ? help : help.track_focus(this.handle);
  }
}
