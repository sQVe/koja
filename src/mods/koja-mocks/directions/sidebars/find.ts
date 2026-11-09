import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import { icon } from '../../../../kit/index.ts';
import { fixedLabel, label } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { SidebarDrawing } from '../window.ts';
import { directionWindow } from '../window.ts';
import type { WorkNeed } from './content.ts';
import { fakeProjects } from './content.ts';
import { agentMark, dimFact, divider, joinedFacts } from './facts.ts';
import { mapSidebar, mapSidebarHovering } from './sidebar.ts';

type LayerState = 'merged' | 'open' | 'draft';

interface FakeLayer {
  pull: number;
  ticket: string;
  title: string;
  state: LayerState;
  checkedOut: boolean;
  need?: WorkNeed;
}

const hoveredTitle = 'Tau workflow sidebar';
const searchQuery = '504';

const cardWidth = 312;
const hoveredRowCenter = 134;
const arrowDepth = 4;
const arrowTip = 266;
const cardLeft = arrowTip + arrowDepth;
const titleCenter = 19;
const cardTop = hoveredRowCenter - titleCenter;
const pickerWidth = 480;
const pickerLeft = 390;
const pickerTop = 56;
const cardPadding = 6;
const cardGap = 2;
const layerHeight = 22;
const markWidth = 14;
const pullWidth = 34;
const ticketWidth = 58;
const lineGap = 6;

const stackLayers: FakeLayer[] = [
  { pull: 502, ticket: 'ME-1032', title: 'Data layer', state: 'merged', checkedOut: false },
  { pull: 504, ticket: 'ME-1033', title: 'Two-line rows', state: 'merged', checkedOut: false },
  { pull: 505, ticket: 'ME-1034', title: 'Status marks', state: 'merged', checkedOut: false },
  {
    pull: 507,
    ticket: 'ME-1035',
    title: 'Stack panel',
    state: 'open',
    checkedOut: false,
    need: 'merge',
  },
  {
    pull: 509,
    ticket: 'ME-1036',
    title: 'Row menu',
    state: 'open',
    checkedOut: false,
    need: 'review',
  },
  { pull: 511, ticket: 'ME-1037', title: 'Narrow rail', state: 'draft', checkedOut: false },
  { pull: 512, ticket: 'ME-1038', title: 'Keys', state: 'draft', checkedOut: false },
  { pull: 514, ticket: 'ME-1031', title: 'Tau workflow sidebar', state: 'open', checkedOut: true },
];

const needIcons: Record<WorkNeed, IconName> = {
  conflict: 'triangle-alert',
  failing: 'circle-x',
  review: 'message-square',
  restack: 'layers',
  merge: 'git-merge',
};

const needColor = (need: WorkNeed, tokens: DirectionTokens): Color => {
  if (need === 'merge') {
    return tokens.marks.done;
  }

  const waits = need === 'review' || need === 'restack';

  return waits ? tokens.marks.modified : tokens.marks.blocked;
};

const floating = (width: number, tokens: DirectionTokens): Element =>
  v_flex()
    .absolute()
    .w(width)
    .p(cardPadding)
    .gap(cardGap)
    .rounded(tokens.pane.radius)
    .bg(tokens.pane.fill)
    .border(1)
    .border_color(tokens.pane.border);

const cardLine = (start: Element[], end: Element[], tokens: DirectionTokens): Element =>
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

const layerMark = (layer: FakeLayer, tokens: DirectionTokens): Element => {
  const slot = h_flex().w(markWidth).flex_none().items_center().justify_center();

  if (layer.checkedOut) {
    return slot.child(icon('git-branch', 'small').text_color(tokens.ink.text));
  }

  return slot;
};

const layerEnd = (layer: FakeLayer, tokens: DirectionTokens): Element[] => {
  if (layer.need !== undefined) {
    return [icon(needIcons[layer.need], 'small').text_color(needColor(layer.need, tokens))];
  }

  return layer.state === 'draft' ? [dimFact('draft', tokens)] : [];
};

const layerRow = (layer: FakeLayer, tokens: DirectionTokens): Element => {
  const ink = layer.state === 'draft' ? tokens.ink.dim : tokens.ink.text;

  return h_flex()
    .h(layerHeight)
    .flex_none()
    .min_w(0)
    .px(tokens.rows.paddingX)
    .gap(lineGap)
    .items_center()
    .child(layerMark(layer, tokens))
    .child(fixedLabel(`#${layer.pull}`, tokens.text.detail, tokens.ink.muted).w(pullWidth))
    .child(fixedLabel(layer.ticket, tokens.text.detail, tokens.ink.dim).w(ticketWidth))
    .child(label(layer.title, tokens.text.body, ink).flex_1())
    .children(layerEnd(layer, tokens));
};

const mergedRow = (merged: FakeLayer[], tokens: DirectionTokens): Element =>
  h_flex()
    .h(layerHeight)
    .flex_none()
    .min_w(0)
    .px(tokens.rows.paddingX)
    .gap(lineGap)
    .items_center()
    .child(
      h_flex()
        .w(markWidth)
        .flex_none()
        .justify_center()
        .child(icon('check', 'small').text_color(tokens.ink.dim)),
    )
    .child(
      joinedFacts(
        merged.map((layer) => fixedLabel(`#${layer.pull}`, tokens.text.detail, tokens.ink.muted)),
        tokens,
      ),
    )
    .child(h_flex().flex_1())
    .child(dimFact(`${merged.length} merged`, tokens));

// One layer of the arrow: 1 px columns that grow 2 px each, so both edges run at 45 degrees and
// stay crisp. GPUI cannot rotate a box.
const arrowLayer = (from: number, columns: number, color: Color): Element =>
  h_flex()
    .absolute()
    .left(from)
    .top(hoveredRowCenter - columns)
    .h(columns * 2 + 1)
    .items_center()
    .children(
      Array.from({ length: columns + 1 }, (_unused, column) =>
        div()
          .w(1)
          .h(column * 2 + 1)
          .flex_none()
          .bg(color),
      ),
    );

// The border layer draws the outline; the fill layer sits 1 px inside it and reaches over the
// card's left border, so arrow and card read as one shape.
const hoverArrow = (tokens: DirectionTokens): Element[] => [
  arrowLayer(arrowTip, arrowDepth - 1, tokens.pane.border),
  arrowLayer(arrowTip + 1, arrowDepth - 1, tokens.pane.fill),
];

const stackCard = (tokens: DirectionTokens): Element => {
  const merged = stackLayers.filter((layer) => layer.state === 'merged');
  const open = stackLayers.filter((layer) => layer.state !== 'merged');

  return floating(cardWidth, tokens)
    .left(cardLeft)
    .top(cardTop)
    .child(
      cardLine(
        [fixedLabel(hoveredTitle, tokens.text.title, tokens.ink.text)],
        [dimFact('koja', tokens)],
        tokens,
      ),
    )
    .child(divider(tokens))
    .child(mergedRow(merged, tokens))
    .children(open.map((layer) => layerRow(layer, tokens)))
    .child(divider(tokens))
    .child(cardLine([dimFact('8 PRs', tokens)], [dimFact('Open stack ›', tokens)], tokens));
};

const withFloating = (
  drawSidebar: SidebarDrawing,
  floatingParts: Element[],
  tokens: DirectionTokens,
): Element =>
  v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(directionWindow(tokens, drawSidebar))
    .children(floatingParts);

export const hoverScene = (tokens: DirectionTokens): Element =>
  withFloating(
    (sidebarTokens) => mapSidebarHovering(hoveredTitle, sidebarTokens),
    [stackCard(tokens), ...hoverArrow(tokens)],
    tokens,
  );

const searchLine = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.rows.height + cardPadding)
    .flex_none()
    .px(tokens.rows.paddingX)
    .gap(lineGap)
    .items_center()
    .child(icon('search', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel(searchQuery, tokens.text.body, tokens.ink.text));

const matchedSpace = fakeProjects
  .flatMap((project) => project.spaces)
  .find((space) => space.title === hoveredTitle);

const resultRow = (tokens: DirectionTokens): Element[] => {
  if (matchedSpace === undefined) {
    return [];
  }

  const reason = joinedFacts(
    [
      fixedLabel(`#${searchQuery}`, tokens.text.title, tokens.ink.text),
      dimFact('PR 2 of 8', tokens),
      dimFact('merged', tokens),
    ],
    tokens,
  );

  const row = h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .min_w(0)
    .px(tokens.rows.paddingX)
    .gap(lineGap)
    .items_center()
    .rounded(tokens.rows.radius)
    .bg(tokens.rows.selectedFill)
    .child(agentMark(matchedSpace, tokens))
    .child(fixedLabel(matchedSpace.title, tokens.text.body, tokens.ink.text))
    .child(dimFact('koja', tokens))
    .child(h_flex().flex_1())
    .child(reason);

  return [row];
};

const pickerHeading = (text: string, tokens: DirectionTokens): Element =>
  cardLine([fixedLabel(text, tokens.text.heading, tokens.ink.muted)], [], tokens);

const picker = (tokens: DirectionTokens): Element =>
  floating(pickerWidth, tokens)
    .left(pickerLeft)
    .top(pickerTop)
    .child(searchLine(tokens))
    .child(divider(tokens))
    .child(pickerHeading('Spaces', tokens))
    .children(resultRow(tokens));

export const searchScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [picker(tokens)], tokens);
