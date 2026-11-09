import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import { icon } from '../../../../kit/index.ts';
import { cardFrame } from '../floating.ts';
import { fixedLabel, label, row, terminalFont } from '../parts.ts';
import { dimFact, divider, rowLine, titleLabel } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeAgent, MenuItem, PlacedSpace } from './content.ts';
import { notInstalled } from './content.ts';

interface ItemOptions {
  start: Element;
  text: string;
  end: Element[];
  selected: boolean;
}

const lineGap = 6;
const keyGap = 4;
const keycapPadding = 4;
const keycapLift = 6;
// Every cap is at least this wide, so key columns line up across rows.
const keycapMinWidth = 18;
const caretWidth = 1;
// The caret spans the input's line, a little taller than the text.
const caretLift = 4;
// From the top of the content area to the pane tops: the tab bar and the content padding.
const paneTopOffset = 44;
// A clear gap below the pane tops, so the overlay edge never runs beside a pane edge.
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

// Search popups keep their taller rows.
const searchRowLift = 4;

export const searchRowHeight = (tokens: DirectionTokens): number =>
  tokens.rows.height + searchRowLift;

export const mainLeft = 268;

export const mainWidth = 992;

export const overlayTop = paneTopOffset + overlayGap;

// The left edge that centers a card of this width in the main column.
export const centered = (width: number): number => mainLeft + (mainWidth - width) / 2;

export const iconMark = (name: IconName, color: Color): Element =>
  icon(name, 'small').text_color(color);

// One outlined box per key, with the badge radius, the same on every row. The overlay border keeps
// the outline visible on the selected row's pill. The terminal font keeps `l` apart from `I`.
export const keycaps = (keys: string[], tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .gap(keyGap / 2)
    .items_center()
    .children(
      keys.map((key) =>
        h_flex()
          .h(tokens.text.detail.size + keycapLift)
          .min_w(keycapMinWidth)
          .px(keycapPadding)
          .flex_none()
          .items_center()
          .justify_center()
          .rounded(tokens.marks.badgeRadius)
          .bg(overlaySurface)
          .border(1)
          .border_color(overlayBorder)
          .child(fixedLabel(key, tokens.text.detail, tokens.ink.dim).font_family(terminalFont)),
      ),
    );

// A heading's part letter in the rows' first key column, with an empty slot for the second key.
export const leadKeycap = (key: string, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .gap(keyGap / 2)
    .child(keycaps([key], tokens))
    .child(div().w(keycapMinWidth).flex_none());

export const keycapHints =
  (tokens: DirectionTokens) =>
  (keys: string[]): Element[] =>
    keys.length === 0 ? [] : [keycaps(keys, tokens)];

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
        .gap(caretWidth)
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

export const menuItem = (
  menu: MenuItem,
  selected: boolean,
  hint: (keys: string[]) => Element[],
  tokens: DirectionTokens,
): Element =>
  item(
    {
      start: iconMark(menu.icon, tokens.ink.muted),
      text: menu.label,
      end: hint(menu.keys),
      selected,
    },
    tokens,
  );

// An agent that is not installed dims its icon and its name together.
const missingAgentOpacity = 0.45;

// Herdr's agent logos are its own assets, which a mod may not name, so the mock draws the kit's
// terminal icon in their place.
export const agentItem = (
  agent: FakeAgent,
  hint: (keys: string[]) => Element[],
  tokens: DirectionTokens,
): Element => {
  if (agent.key !== null) {
    return item(
      {
        start: iconMark('terminal', tokens.ink.muted),
        text: agent.name,
        end: hint([agent.key]),
        selected: false,
      },
      tokens,
    );
  }

  return row(
    {
      selected: false,
      start: iconMark('terminal', tokens.ink.muted).opacity(missingAgentOpacity),
      label: label(agent.name, tokens.text.body, tokens.ink.text).opacity(missingAgentOpacity),
      end: [dimFact(notInstalled, tokens)],
    },
    tokens,
  );
};

// Dim footer text and keycaps in one run, read left to right.
export const footerLine = (parts: (string | string[])[], tokens: DirectionTokens): Element =>
  line(
    parts.map((part) => (typeof part === 'string' ? dimFact(part, tokens) : keycaps(part, tokens))),
    [],
    tokens,
  );

// The line under a menu that says how its key hints are reached.
export const modeFooter = (tokens: DirectionTokens): Element[] => [
  divider(tokens),
  footerLine(['Press', ['ctrl-b'], 'then a key'], tokens),
];

// Draws the menu's rows, with a divider above each row that starts a group. Pass row tokens.
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
