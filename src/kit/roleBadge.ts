import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { ThemeToken } from './palette.ts';
import { roleToken as rolePaletteToken } from './rolePalette.ts';
import { badgeSize, paneHeaderWidth } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

type RoleBadgeState = 'full' | 'cut';

/** @public */
export const roleToken = (role: string): ThemeToken => rolePaletteToken(role);

/** @public */
export const roleBadge = (role: string, state: RoleBadgeState = 'cut'): Element => {
  const token = roleToken(role);
  const labelBox = div().min_w(0).truncate();
  const label = withTextRole(labelBox, 'tag', token);
  const labelWidth = role.length * paneHeaderWidth.glyph + badgeSize.horizontal;

  const box = h_flex()
    .h(badgeSize.height)
    .px(badgeSize.padding)
    .items_center()
    .rounded(badgeSize.radius)
    .border(badgeSize.border)
    .border_color(colors()[token])
    .tooltip(role);

  if (state === 'full') {
    box.flex_none();
  } else {
    box.flex_initial().min_w(Math.min(labelWidth, badgeSize.minimumWidth));
  }

  return box.child(label.child(role));
};
