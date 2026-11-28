import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div, image, svg } from 'gpui-kit';

import { withHover } from './hover.ts';
import type { ThemeToken } from './palette.ts';
import { popupSurface } from './popupSurface.ts';
import { iconSize, spacing, toastSize } from './size.ts';
import { indicator } from './statusMark.ts';
import type { TextRole } from './textRole.ts';
import { roleText, withTextRole } from './textRole.ts';
import { colors } from './theme.ts';
import type { ToastLevel } from './toast/toastLevel.ts';

interface ToastIcon {
  path: string;
  tint: boolean;
}

export interface ToastCardOptions {
  id: string;
  level: ToastLevel;
  icon: ToastIcon | null;
  title: string;
  body: Element | string | null;
  // False fills the overlay: a string body is shortened to one line and an Element body is drawn as given. True fits the card to its content.
  fitHeight: boolean;
}

const levelTokens: Record<ToastLevel, ThemeToken> = {
  error: 'blocked',
  warning: 'working',
  success: 'done',
  info: 'accent',
};

const firstLine = (text: string): string => {
  const [line] = text.split(/\r?\n/);

  return line ?? text;
};

const mark = (options: ToastCardOptions): Element => {
  if (options.icon !== null) {
    const drawn = options.icon.tint ? svg(options.icon.path) : image(options.icon.path);

    return drawn.size(iconSize.default).flex_none();
  }

  return indicator(levelTokens[options.level]);
};

const textLine = (role: TextRole, text: string, fitHeight: boolean): Element => {
  if (!fitHeight) {
    return roleText(role, firstLine(text));
  }

  return withTextRole(div(), role).child(text);
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
  const commandText = roleText('detail', command).flex_1().tooltip(command);

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
