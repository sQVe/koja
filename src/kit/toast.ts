import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div, image } from 'gpui-kit';

import { withHover } from './hover.ts';
import type { ThemeToken } from './palette.ts';
import { popupSurface } from './popupSurface.ts';
import { iconSize, markSize, spacing, toastSize } from './size.ts';
import { dot } from './statusMark.ts';
import type { TextRole } from './textRole.ts';
import { roleText, withTextRole } from './textRole.ts';
import { colors } from './theme.ts';
import type { ToastLevel } from './toast/toastLevel.ts';

export interface ToastCardOptions {
  id: string;
  level: ToastLevel;
  icon: string | null;
  title: string;
  body: Element | string | null;
  fitHeight: boolean;
}

const levelTokens: Record<ToastLevel, ThemeToken> = {
  error: 'blocked',
  warning: 'working',
  success: 'done',
  info: 'accent',
};

const firstLine = (text: string): string => {
  const [line = ''] = text.split('\n');

  return line;
};

const mark = (options: ToastCardOptions): Element => {
  if (options.icon !== null) {
    return image(options.icon).size(iconSize.default).flex_none();
  }

  return dot(markSize.dot, colors()[levelTokens[options.level]]);
};

const textLine = (role: TextRole, text: string, fitHeight: boolean): Element => {
  const box = fitHeight ? div() : div().truncate();
  const shown = fitHeight ? text : firstLine(text);

  return withTextRole(box, role).child(shown);
};

const bodyOf = (options: ToastCardOptions): Element | null => {
  if (options.body === null) {
    return null;
  }

  if (typeof options.body !== 'string') {
    return options.body;
  }

  return textLine('detail', options.body, options.fitHeight);
};

const contents = (options: ToastCardOptions): Element => {
  const lines: Element[] = [textLine('title', options.title, options.fitHeight)];
  const body = bodyOf(options);

  if (body !== null) {
    lines.push(body);
  }

  return v_flex().flex_1().min_w(0).overflow_hidden().children(lines);
};

const row = (options: ToastCardOptions): Element =>
  h_flex()
    .w_full()
    .px(spacing.xlarge)
    .gap(spacing.medium)
    .items_center()
    .child(mark(options))
    .child(contents(options));

const sized = (card: Element, fitHeight: boolean): Element =>
  fitHeight
    ? card.w_full().min_h(toastSize.minHeight).flex_none().py(spacing.large)
    : card.size_full();

export const toastCommandBody = (command: string, actionElement: Element): Element => {
  const commandText = roleText('detail', command).flex_1();

  return h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.medium)
    .items_center()
    .child(commandText)
    .child(actionElement);
};

export const toastCard = (options: ToastCardOptions): Element => {
  const palette = colors();
  const surface = popupSurface(options.id).justify_center().cursor_pointer().child(row(options));
  const card = sized(surface, options.fitHeight);

  return withHover(card, false, (element) => element.bg(palette.hover));
};
