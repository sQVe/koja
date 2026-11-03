import type { InputState } from 'gpui-base';
import { h_flex, Input } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from './icon.ts';
import type { IconName } from './iconNames.ts';
import { controlSize, spacing, textSize } from './size.ts';
import { colors } from './theme.ts';

export const searchField = (input: InputState, iconName: IconName): Element => {
  const palette = colors();

  return h_flex()
    .h(controlSize.searchField)
    .flex_none()
    .px(spacing.large)
    .gap(spacing.small)
    .items_center()
    .border_b(spacing.hairline)
    .border_color(palette.border)
    .child(icon(iconName, 'large').text_color(palette.dim))
    .child(
      Input.new(input).flex_1().h_full().text_size(textSize.default).text_color(palette.foreground),
    );
};
