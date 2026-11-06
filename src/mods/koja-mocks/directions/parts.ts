import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { IconName } from '../../../kit/index.ts';
import { icon, spinner } from '../../../kit/index.ts';
import type { DirectionTokens, TextStyle } from './tokens.ts';

interface RowOptions {
  selected: boolean;
  start?: Element;
  label: Element;
  end: Element[];
}

export const uiFont = 'Geist';

export const terminalFont = 'JetBrains Mono';

const markSlot = 12;
const dotSize = 6;
const quietDotSize = 4;
const pillPadding = 6;
const badgePadding = 6;
const badgeHeight = 18;
const rowGap = 6;

export const styled = (element: Element, style: TextStyle, color: Color): Element => {
  const sized = element.text_size(style.size).text_color(color);

  return style.semibold ? sized.font_semibold() : sized.font_normal();
};

export const label = (text: string, style: TextStyle, color: Color): Element =>
  styled(div().min_w(0).truncate(), style, color).child(text);

export const fixedLabel = (text: string, style: TextStyle, color: Color): Element =>
  label(text, style, color).flex_none();

export const middleCutLabel = (text: string, style: TextStyle, color: Color): Element =>
  label(text, style, color).text_ellipsis_middle();

const dot = (size: number, color: Color): Element =>
  div()
    .size(size)
    .rounded(size / 2)
    .flex_none()
    .bg(color);

const markShape = (status: Status, color: Color): Element => {
  if (status === 'working') {
    return spinner().text_color(color);
  }

  if (status === 'done') {
    return icon('check', 'small').text_color(color);
  }

  if (status === 'blocked') {
    return dot(dotSize, color);
  }

  return dot(quietDotSize, color);
};

export const statusMark = (status: Status | null, tokens: DirectionTokens): Element => {
  const slot = h_flex().w(markSlot).flex_none().items_center().justify_center();

  if (status === null) {
    return slot;
  }

  return slot.child(markShape(status, tokens.marks[status]));
};

export const attentionBadge = (text: string, tokens: DirectionTokens): Element =>
  styled(
    h_flex()
      .h(badgeHeight)
      .px(badgePadding)
      .flex_none()
      .items_center()
      .rounded(tokens.marks.badgeRadius)
      .bg(tokens.marks.badgeFill),
    tokens.text.badge,
    tokens.marks.badgeText,
  ).child(text);

const controlFrame = (name: IconName, tokens: DirectionTokens): Element =>
  h_flex()
    .size(tokens.controls.size)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(tokens.controls.radius)
    .child(icon(name, 'small'));

export const iconButton = (name: IconName, tokens: DirectionTokens, color: Color): Element =>
  controlFrame(name, tokens)
    .text_color(color)
    .hover((element) => element.bg(tokens.rows.hoverFill));

export const iconToggle = (name: IconName, active: boolean, tokens: DirectionTokens): Element => {
  const toggle = controlFrame(name, tokens);

  if (active) {
    return toggle.bg(tokens.controls.toggleFill).text_color(tokens.ink.text);
  }

  return toggle.text_color(tokens.ink.muted).hover((element) => element.bg(tokens.rows.hoverFill));
};

// One mode pill shows in both modes, so the mode is always visible in the tab bar.
export const modePill = (tokens: DirectionTokens): Element => {
  const { controls } = tokens;
  const look = controls.modePill;

  const pill = h_flex()
    .h(controls.size)
    .px(pillPadding)
    .flex_none()
    .items_center()
    .rounded(controls.radius);

  if (look.fill !== null) {
    pill.bg(look.fill);
  }

  if (look.border !== null) {
    pill.border(1).border_color(look.border);
  }

  return styled(pill, tokens.text.detail, look.text).child(tokens.normal ? 'Normal' : 'Insert');
};

export const row = (options: RowOptions, tokens: DirectionTokens): Element => {
  const { rows } = tokens;

  const element = h_flex()
    .flex_none()
    .min_w(0)
    .h(rows.height)
    .mx(rows.inset)
    .px(rows.paddingX)
    .gap(rowGap)
    .items_center()
    .rounded(rows.radius);

  if (options.selected) {
    element.bg(rows.selectedFill);
  } else {
    element.hover((hovered) => hovered.bg(rows.hoverFill));
  }

  if (options.start !== undefined) {
    element.child(options.start);
  }

  return element
    .child(h_flex().flex_1().min_w(0).items_center().child(options.label))
    .children(options.end);
};
