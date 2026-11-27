import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon, sidebarSize, spacing, stackCard, stackCardHeight } from '../../../../kit/index.ts';
import { stackCardFixture } from '../../stackCardFixture.ts';
import { floating, withFloating } from '../floating.ts';
import { fixedLabel } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { fakeProjects } from './content.ts';
import { agentMark, dimFact, divider, joinedFacts } from './facts.ts';
import { mapSidebar, mapSidebarHovering } from './sidebar.ts';

const hoveredTitle = 'Tau workflow sidebar';
const searchQuery = '504';

const hoveredRowCenter = 134;
const pickerWidth = 480;
const pickerLeft = 390;
const pickerTop = 56;
const cardPadding = 6;
const lineGap = 6;

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

const stackCardOf = (): Element => {
  const model = { ...stackCardFixture, title: hoveredTitle };

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
