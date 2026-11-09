import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import { icon } from '../../../../kit/index.ts';
import { cardFrame } from '../floating.ts';
import { fixedLabel, label, row, terminalFont } from '../parts.ts';
import { dimFact, divider, rowLine, titleLabel } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { MenuItem, PlacedSpace } from './content.ts';

export interface KeycapLook {
  fill: Color | null;
  outline: Color;
  ink: Color;
}

interface ItemOptions {
  start: Element;
  text: string;
  end: Element[];
  selected: boolean;
}

const lineGap = 6;
const keyGap = 4;
const keycapPadding = 4;
// An even cap height, so the cap sits on whole pixels in the even-height rows.
const keycapLift = 5;
// The font centers its line box, which puts letters without an ascender low in the cap. Raise
// those by one pixel, and those with a descender as well by one more.
const tallGlyphs = /[A-Z0-9bdfhijklt↵]/u;
const descendingGlyphs = /[gpqy]/u;
// Glyphs sit about 1 px left of the cap's center, so the left padding takes 1 px more.
const keycapOpticalShift = 1;
const keycapMinWidth = 18;
const caretWidth = 1;
const caretLift = 4;
const caretTextInset = 2;
// From the top of the content area to the pane tops: the tab bar and the content padding.
const paneTopOffset = 44;
const overlayGap = 40;

// One step lighter than the pane body, so an overlay reads as a layer above the panes.
export const overlaySurface = '#e6e8eb';

// A mid gray between the pane border and the dark ink, in both modes, so the overlay edge does not
// read as the insert-mode focus border. Indigo stays on the panes.
export const overlayBorder = '#959aa4';

export const overlayCard = (tokens: DirectionTokens): Element =>
  cardFrame(tokens).bg(overlaySurface).border_color(overlayBorder);

export const floatingOverlay = (width: number, tokens: DirectionTokens): Element =>
  overlayCard(tokens).absolute().w(width);

// Overlay rows sit flush in their box, which already pads them, and can be taller than panel rows.
export const overlayTokens = (height: number, tokens: DirectionTokens): DirectionTokens => ({
  ...tokens,
  rows: { ...tokens.rows, height, inset: 0 },
});

const searchRowLift = 4;

export const searchRowHeight = (tokens: DirectionTokens): number =>
  tokens.rows.height + searchRowLift;

export const mainLeft = 268;

export const mainWidth = 992;

export const overlayTop = paneTopOffset + overlayGap;

export const centered = (width: number): number => mainLeft + (mainWidth - width) / 2;

export const iconMark = (name: IconName, color: Color): Element =>
  icon(name, 'small').text_color(color);

// One outlined box per key, with the badge radius, the same on every row. The overlay border keeps
// the outline visible on the selected row's pill. The terminal font keeps `l` apart from `I`.
const plainKeycap = (tokens: DirectionTokens): KeycapLook => ({
  fill: overlaySurface,
  outline: overlayBorder,
  ink: tokens.ink.dim,
});

const glyphRaise = (key: string): number => {
  const short = tallGlyphs.test(key) ? 0 : 1;
  const descending = descendingGlyphs.test(key) ? 1 : 0;

  return short + descending;
};

const keycap = (key: string, look: KeycapLook, tokens: DirectionTokens): Element => {
  const cap = h_flex()
    .h(tokens.text.detail.size + keycapLift)
    .min_w(keycapMinWidth)
    .pl(keycapPadding + keycapOpticalShift)
    .pr(keycapPadding)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(tokens.marks.badgeRadius)
    .border(1)
    .border_color(look.outline);

  if (look.fill !== null) {
    cap.bg(look.fill);
  }

  const glyph = fixedLabel(key, tokens.text.detail, look.ink).font_family(terminalFont);

  return cap.child(glyph.relative().top(-glyphRaise(key)));
};

export const keycaps = (
  keys: string[],
  tokens: DirectionTokens,
  look: KeycapLook = plainKeycap(tokens),
): Element =>
  h_flex()
    .flex_none()
    .gap(keyGap / 2)
    .items_center()
    .children(keys.map((key) => keycap(key, look, tokens)));

export const item = (options: ItemOptions, tokens: DirectionTokens): Element =>
  row(
    {
      selected: options.selected,
      start: options.start,
      label: label(options.text, tokens.text.body, tokens.ink.text),
      end: options.end,
    },
    tokens,
  );

export const line = (start: Element[], end: Element[], tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .min_w(0)
    .px(tokens.rows.paddingX)
    .gap(lineGap)
    .items_center()
    .children(start)
    .child(h_flex().flex_1())
    .children(end);

export const heading = (text: string, end: Element[], tokens: DirectionTokens): Element =>
  line([fixedLabel(text, tokens.text.heading, tokens.ink.muted)], end, tokens);

const caret = (tokens: DirectionTokens): Element =>
  div()
    .w(caretWidth)
    .h(tokens.text.body.size + caretLift)
    .flex_none()
    .bg(tokens.ink.text);

export const searchLineHeight = (tokens: DirectionTokens): number =>
  searchRowHeight(tokens) + lineGap;

export const searchLine = (placeholder: string, tokens: DirectionTokens): Element =>
  line(
    [
      iconMark('search', tokens.ink.dim),
      h_flex()
        .flex_none()
        .gap(caretTextInset)
        .items_center()
        .child(caret(tokens))
        .child(fixedLabel(placeholder, tokens.text.body, tokens.ink.dim)),
    ],
    [],
    tokens,
  ).h(searchLineHeight(tokens));

export const spaceRow = (
  placed: PlacedSpace,
  selected: boolean,
  tokens: DirectionTokens,
): Element =>
  rowLine(
    {
      space: { ...placed.space, selected },
      middle: [titleLabel(placed.space, tokens), dimFact(placed.project, tokens)],
      trailing: [],
      hovered: false,
      progress: true,
    },
    tokens,
  );

const settingState = (menu: MenuItem, tokens: DirectionTokens): Element[] =>
  menu.state === undefined ? [] : [dimFact(menu.state, tokens)];

const modeHints = (menu: MenuItem, tokens: DirectionTokens): Element[] => {
  const keys = tokens.normal ? menu.normalKeys : (menu.insertKeys ?? []);

  return keys.length === 0 ? [] : [keycaps(keys, tokens)];
};

export const menuItem = (menu: MenuItem, selected: boolean, tokens: DirectionTokens): Element =>
  item(
    {
      start: iconMark(menu.icon, tokens.ink.muted),
      text: menu.label,
      end: [...settingState(menu, tokens), ...modeHints(menu, tokens)],
      selected,
    },
    tokens,
  );

export const footerLine = (parts: (string | string[])[], tokens: DirectionTokens): Element =>
  line(
    parts.map((part) => (typeof part === 'string' ? dimFact(part, tokens) : keycaps(part, tokens))),
    [],
    tokens,
  );

export const dividedRows = (
  menus: MenuItem[],
  draw: (menu: MenuItem, index: number) => Element,
  tokens: DirectionTokens,
): Element[] => {
  const drawn: Element[] = [];

  menus.forEach((menu, index) => {
    if (menu.divided === true) {
      drawn.push(divider(tokens));
    }

    drawn.push(draw(menu, index));
  });

  return drawn;
};
