import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { StackCardModel, StackCardPull } from '../../../../kit/index.ts';
import { icon, sidebarSize, spacing, stackCard, stackCardHeight } from '../../../../kit/index.ts';
import { floating, withFloating } from '../floating.ts';
import { fixedLabel } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
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

const hoveredRowCenter = 134;
const pickerWidth = 480;
const pickerLeft = 390;
const pickerTop = 56;
const cardPadding = 6;
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

const cardLine = (start: Element[], end: Element[], tokens: DirectionTokens): Element => {
  const spacer = h_flex().flex_1();

  return h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .min_w(0)
    .px(tokens.rows.paddingX)
    .gap(lineGap)
    .items_center()
    .children(start)
    .child(spacer)
    .children(end);
};

const pullEnd = (layer: FakeLayer): StackCardPull['end'] => {
  if (layer.need !== undefined) {
    return layer.need;
  }

  return layer.state === 'draft' ? 'draft' : null;
};

const stackCardModel = (): StackCardModel => {
  const merged = stackLayers.filter((layer) => layer.state === 'merged');
  const pulls = stackLayers.filter((layer) => layer.state !== 'merged');

  return {
    title: hoveredTitle,
    project: 'koja',
    merged: merged.map((layer) => layer.pull),
    pulls: pulls.map((layer) => ({
      number: layer.pull,
      ticket: layer.ticket,
      title: layer.title,
      checkedOut: layer.checkedOut,
      end: pullEnd(layer),
    })),
    total: stackLayers.length,
  };
};

const stackCardOf = (): Element => {
  const model = stackCardModel();

  return div()
    .absolute()
    .left(sidebarSize.width - spacing.xxsmall)
    .top(hoveredRowCenter - stackCardHeight(model) / 2)
    .child(stackCard(model));
};

export const hoverScene = (tokens: DirectionTokens): Element =>
  withFloating(
    (sidebarTokens) => mapSidebarHovering(hoveredTitle, sidebarTokens),
    [stackCardOf()],
    tokens,
  );

const searchLine = (tokens: DirectionTokens): Element => {
  const searchIcon = icon('search', 'small').text_color(tokens.ink.dim);

  return h_flex()
    .h(tokens.rows.height + cardPadding)
    .flex_none()
    .px(tokens.rows.paddingX)
    .gap(lineGap)
    .items_center()
    .child(searchIcon)
    .child(fixedLabel(searchQuery, tokens.text.body, tokens.ink.text));
};

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

  const spacer = h_flex().flex_1();

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
    .child(spacer)
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
