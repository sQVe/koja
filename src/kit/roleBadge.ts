import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { ThemeToken } from './palette.ts';
import { controlSize, radius, spacing } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

const roleTokens = new Map<string, ThemeToken>([
  ['lead', 'ansi4'],
  ['architect', 'ansi4'],
  ['worker', 'ansi2'],
  ['scout', 'ansi3'],
  ['reviewer', 'ansi3'],
  ['checker', 'ansi3'],
  ['qa', 'ansi5'],
  ['browser', 'ansi5'],
]);

/** @public */
export const roleToken = (role: string): ThemeToken => roleTokens.get(role) ?? 'muted';

/** @public */
export const roleBadge = (role: string): Element => {
  const token = roleToken(role);

  const box = h_flex()
    .h(controlSize.badge)
    .px(spacing.small)
    .flex_none()
    .items_center()
    .rounded(radius.default)
    .border(spacing.hairline)
    .border_color(colors()[token]);

  return withTextRole(box, 'tag', token).child(role);
};
