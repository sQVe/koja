import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { AttentionStatus } from './attentionStatus.ts';
import type { HoverOptions } from './hover.ts';
import { withHover } from './hover.ts';
import { clearOf } from './palette.ts';
import { controlSize, iconSize, radius, spacing, textSize } from './size.ts';
import { attentionMark } from './statusMark.ts';
import { colors } from './theme.ts';

export interface TabOptions extends HoverOptions {
  label: string;
  active: boolean;
  icon: Element | null;
  status: AttentionStatus | null;
  close: Element | null;
}

const startSlot = (iconElement: Element | null): Element => {
  const slot = h_flex().size(iconSize.small).flex_none().items_center().justify_center();

  return iconElement === null ? slot : slot.child(iconElement);
};

const endSlot = (options: TabOptions): Element => {
  const slot = h_flex().size(controlSize.smallButton).flex_none().items_center().justify_center();

  if (options.active && options.close !== null) {
    return slot.child(options.close);
  }

  return slot;
};

export const tab = (options: TabOptions): Element => {
  const palette = colors();
  const iconTone = options.active || options.hovered === true ? palette.foreground : palette.muted;

  const element = h_flex()
    .h(controlSize.button)
    .px(spacing.medium)
    .gap(spacing.small)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
    // A clear border on every tab, so the outline a hovered tab draws never shifts its content.
    .border(spacing.hairline)
    .border_color(clearOf(palette.selected))
    .text_size(textSize.default);

  if (options.active) {
    element.bg(palette.selected).text_color(palette.foreground);
  } else {
    element.text_color(palette.muted);

    withHover(element, options.hovered === true, (styled) =>
      styled.border_color(palette.selected).text_color(palette.foreground),
    );
  }

  const tabIcon = options.icon === null ? null : options.icon.text_color(iconTone);
  const leading = attentionMark(options.status) ?? tabIcon;
  const label = div().max_w(controlSize.tabLabelMaxWidth).truncate().child(options.label);

  element.child(startSlot(leading)).child(label);

  return element.child(endSlot(options));
};
