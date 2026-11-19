import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { ThemeToken } from './palette.ts';
import { roleToken as rolePaletteToken } from './rolePalette.ts';
import { badgeSize } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

/** @public */
export const roleToken = (role: string): ThemeToken => rolePaletteToken(role);

/** @public */
export const roleBadge = (role: string): Element => {
  const token = roleToken(role);

  const box = h_flex()
    .h(badgeSize.height)
    .px(badgeSize.padding)
    .flex_none()
    .items_center()
    .rounded(badgeSize.radius)
    .border(badgeSize.border)
    .border_color(colors()[token]);

  return withTextRole(box, 'tag', token).child(role);
};
