import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { IconName } from '../../../kit/index.ts';
import { icon } from '../../../kit/index.ts';
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

export const dot = (size: number, color: Color): Element =>
  div()
    .size(size)
    .rounded(size / 2)
    .flex_none()
    .bg(color);

const markShape = (status: Status, color: Color): Element => {
  if (status === 'working') {
    // Drawn still: a capture of a spinning arc catches a random frame, which can read as a letter.
    return icon('loader-circle', 'xsmall').text_color(color);
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

export const paneHeaderFrame = (tokens: DirectionTokens): Element => {
  const { pane } = tokens;

  return h_flex()
    .h(pane.headerHeight)
    .flex_none()
    .px(pane.headerPadding)
    .gap(pane.headerGap)
    .items_center()
    .overflow_hidden()
    .border_b(1)
    .border_color(pane.headerDivider);
};

export const card = (focused: boolean, tokens: DirectionTokens): Element => {
  const { pane } = tokens;

  return v_flex()
    .flex_1()
    .min_w(0)
    .min_h(0)
    .rounded(pane.radius)
    .bg(pane.fill)
    .overflow_hidden()
    .border(1)
    .border_color(focused ? pane.focusedBorder : pane.border);
};

export const cardSlot = (inner: Element, tokens: DirectionTokens): Element =>
  v_flex().h_full().min_w(0).rounded(tokens.pane.radius).child(inner);

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
