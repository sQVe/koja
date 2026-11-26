import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { terminalFont } from './font.ts';
import type { ThemeToken } from './palette.ts';
import { textSize } from './size.ts';
import { colors } from './theme.ts';

export type TextRole =
  | 'viewTitle'
  | 'title'
  | 'body'
  | 'sectionHeading'
  | 'detail'
  | 'badge'
  | 'tag'
  | 'mono';

type TextWeight = 'regular' | 'semibold';

interface TextRoleStyle {
  size: number;
  weight: TextWeight;
  color: ThemeToken;
  monospace?: true;
}

export const textRoles: Record<TextRole, TextRoleStyle> = {
  viewTitle: { size: textSize.large, weight: 'semibold', color: 'foreground' },
  title: { size: textSize.default, weight: 'semibold', color: 'foreground' },
  body: { size: textSize.default, weight: 'regular', color: 'foreground' },
  sectionHeading: { size: textSize.small, weight: 'semibold', color: 'muted' },
  detail: { size: textSize.small, weight: 'regular', color: 'dim' },
  badge: { size: textSize.xsmall, weight: 'semibold', color: 'foreground' },
  tag: { size: textSize.xsmall, weight: 'regular', color: 'foreground' },
  mono: { size: textSize.default, weight: 'regular', color: 'foreground', monospace: true },
};

const isTextRole = (value: string): value is TextRole => Object.hasOwn(textRoles, value);

export const textRoleNames = Object.keys(textRoles).filter(isTextRole);

export const withTextRole = (element: Element, role: TextRole, color?: ThemeToken): Element => {
  const style = textRoles[role];
  const sized = element.text_size(style.size).text_color(colors()[color ?? style.color]);
  const weighted = style.weight === 'semibold' ? sized.font_semibold() : sized.font_normal();

  return style.monospace === true ? weighted.font_family(terminalFont()) : weighted;
};

export const roleText = (role: TextRole, text: string, color?: ThemeToken): Element => {
  const box = div().min_w(0).truncate();

  return withTextRole(box, role, color).child(text);
};
