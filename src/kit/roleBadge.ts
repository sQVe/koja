import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { readableTextToken } from './contrast.ts';
import type { ThemeToken } from './palette.ts';
import { roleToken as rolePaletteToken } from './rolePalette.ts';
import { badgeSize } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

type RoleBadgeState = 'full' | 'cut';

/** @public */
export const roleToken = (role: string): ThemeToken => rolePaletteToken(role);

/** @public */
export const roleBadge = (role: string, state: RoleBadgeState = 'cut'): Element => {
  const token = roleToken(role);
  const palette = colors();
  const labelBox = div().min_w(0).truncate();
  const label = withTextRole(labelBox, 'tag', readableTextToken(token, palette));

  const box = h_flex()
    .h(badgeSize.height)
    .px(badgeSize.padding)
    .items_center()
    .rounded(badgeSize.radius)
    .bg(palette[token])
    .border(badgeSize.border)
    .border_color(palette[token])
    .tooltip(role);

  if (state === 'full') {
    box.flex_none();
  } else {
    box.flex_initial().min_w(0);
  }

  return box.child(label.child(role));
};
