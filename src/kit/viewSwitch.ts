import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import { toggleButton } from './button.ts';
import { spacing } from './size.ts';

interface ViewOption<Id extends string> {
  id: Id;
  label: string;
}

export interface ViewSwitchOptions<Id extends string> {
  options: ViewOption<Id>[];
  active: Id;
  // A click does not redraw the view. The caller stores the id, then calls `cx.notify()`.
  onSelect: (id: Id, cx: Context) => void;
}

export const viewSwitch = <Id extends string>(switchOptions: ViewSwitchOptions<Id>): Element => {
  const buttons = switchOptions.options.map((option) =>
    toggleButton({ label: option.label, active: option.id === switchOptions.active }).on_click(
      (_event, cx) => {
        cx.stop_propagation();
        switchOptions.onSelect(option.id, cx);
      },
    ),
  );

  return h_flex().flex_none().gap(spacing.xxsmall).items_center().children(buttons);
};
