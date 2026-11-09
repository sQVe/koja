import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import { icon } from '../../../../kit/index.ts';
import { fixedLabel, label, row } from '../parts.ts';
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
const mainLeft = 268;
const keyGap = 4;
const keycapPadding = 4;
const keycapLift = 6;

// Overlay rows sit flush in their box, which already pads them, and can be taller than panel rows.
export const overlayTokens = (height: number, tokens: DirectionTokens): DirectionTokens => ({
  ...tokens,
  rows: { ...tokens.rows, height, inset: 0 },
});

// Search popups keep their taller rows.
const searchRowLift = 4;

export const searchRowHeight = (tokens: DirectionTokens): number =>
  tokens.rows.height + searchRowLift;

export const mainWidth = 992;

export const overlayTop = 52;

// The left edge that centers a card of this width in the main column.
export const centered = (width: number): number => mainLeft + (mainWidth - width) / 2;

export const iconMark = (name: IconName, color: Color): Element =>
  icon(name, 'small').text_color(color);

// A quiet gray in both modes: the pane border turns indigo in normal mode, which is too loud for
// every key of a list.
export const keycapOutline = (tokens: DirectionTokens): Color => tokens.rows.selectedFill;

// One outlined box per key, with the badge radius. The pane fill keeps the box visible on the
// selected row's pill, which has the outline's color.
export const keycaps = (keys: string[], tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .gap(keyGap / 2)
    .items_center()
    .children(
      keys.map((key) =>
        h_flex()
          .h(tokens.text.detail.size + keycapLift)
          .min_w(tokens.text.detail.size + keycapLift)
          .px(keycapPadding)
          .flex_none()
          .items_center()
          .justify_center()
          .rounded(tokens.marks.badgeRadius)
          .bg(tokens.pane.fill)
          .border(1)
          .border_color(keycapOutline(tokens))
          .child(fixedLabel(key, tokens.text.detail, tokens.ink.dim)),
      ),
    );

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

export const searchLine = (placeholder: string, tokens: DirectionTokens): Element =>
  line(
    [iconMark('search', tokens.ink.dim), fixedLabel(placeholder, tokens.text.body, tokens.ink.dim)],
    [],
    tokens,
  ).h(searchRowHeight(tokens) + lineGap);

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
      progress: false,
    },
    tokens,
  );

export const menuItem = (
  menu: MenuItem,
  hint: (keys: string[]) => Element[],
  tokens: DirectionTokens,
): Element =>
  item(
    {
      start: iconMark(menu.icon, tokens.ink.muted),
      text: menu.label,
      end: hint(menu.keys),
      selected: false,
    },
    tokens,
  );

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
      start: iconMark('terminal', tokens.ink.dim),
      label: label(agent.name, tokens.text.body, tokens.ink.dim),
      end: [dimFact(notInstalled, tokens)],
    },
    tokens,
  );
};

// Draws the menu's rows, with a divider above each row that starts a group. Pass row tokens.
export const dividedRows = (
  menus: MenuItem[],
  draw: (menu: MenuItem) => Element,
  tokens: DirectionTokens,
): Element[] => {
  const drawn: Element[] = [];

  for (const menu of menus) {
    if (menu.divided === true) {
      drawn.push(divider(tokens));
    }

    drawn.push(draw(menu));
  }

  return drawn;
};
