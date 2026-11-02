import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { spinner } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { markSize } from './size.ts';
import { colors } from './theme.ts';

const dot = (size: number, color: Color): Element =>
  div()
    .size(size)
    .rounded(size / 2)
    .flex_none()
    .bg(color);

// An agent's status in a fixed slot, so marks line up and names never shift. Working spins,
// blocked and done show a dot in their color, and idle shows a quieter, smaller dot.
export const statusMark = (status: Status | null): Element => {
  const slot = h_flex().w(markSize.slot).flex_none().items_center().justify_center();
  const palette = colors();

  if (status === null) {
    return slot;
  }

  if (status === 'working') {
    return slot.child(spinner().text_color(palette.working));
  }

  if (status === 'idle') {
    return slot.child(dot(markSize.quietDot, palette.idle));
  }

  return slot.child(dot(markSize.dot, palette[status]));
};

// A state that is not an agent's, such as a machine's connection, as a dot in a theme color.
export const indicator = (token: ThemeToken): Element => dot(markSize.dot, colors()[token]);
