import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { ThemeToken } from './palette.ts';
import { textSize } from './size.ts';
import { colors } from './theme.ts';

export type TextRole = 'viewTitle' | 'title' | 'body' | 'sectionHeading' | 'detail' | 'badge';

type TextWeight = 'regular' | 'semibold';

interface TextRoleStyle {
  size: number;
  weight: TextWeight;
  color: ThemeToken;
}

export const textRoles: Record<TextRole, TextRoleStyle> = {
  viewTitle: { size: textSize.large, weight: 'semibold', color: 'foreground' },
  title: { size: textSize.default, weight: 'semibold', color: 'foreground' },
  body: { size: textSize.default, weight: 'regular', color: 'foreground' },
  sectionHeading: { size: textSize.small, weight: 'semibold', color: 'muted' },
  detail: { size: textSize.small, weight: 'regular', color: 'dim' },
  badge: { size: textSize.xsmall, weight: 'semibold', color: 'foreground' },
};

export const withTextRole = (element: Element, role: TextRole, color?: ThemeToken): Element => {
  const style = textRoles[role];
  const sized = element.text_size(style.size).text_color(colors()[color ?? style.color]);

  return style.weight === 'semibold' ? sized.font_semibold() : sized.font_normal();
};

export const roleText = (role: TextRole, text: string, color?: ThemeToken): Element =>
  withTextRole(div().min_w(0).truncate(), role, color).child(text);
