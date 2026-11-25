import type { InputState } from 'gpui-base';
import { h_flex, Input } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { controlSize, radius, spacing } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

export const textField = (input: InputState, focused: boolean): Element => {
  const palette = colors();
  const borderColor = focused ? palette.accent : palette.border;
  const inputElement = Input.new(input).flex_1().h_full();

  return h_flex()
    .h(controlSize.button)
    .flex_none()
    .px(spacing.large)
    .items_center()
    .rounded(radius.default)
    .border(spacing.hairline)
    .border_color(borderColor)
    .on_mouse_down('left', (_event, cx) => {
      cx.stop_propagation();
    })
    .child(withTextRole(inputElement, 'body'));
};
