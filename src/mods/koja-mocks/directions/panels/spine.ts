import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { groupHeader } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { directionWindow } from '../window.ts';
import { commitBar } from './changes.ts';
import type { FakePull } from './data.ts';
import { oneCard, panelCard, panelColumn, panelWidth, sectionDivider } from './frame.ts';
import { stackHeader, workGroups } from './rail.ts';
import { baseRail } from './railData.ts';
import { railList } from './railGraph.ts';
import type { PullLook } from './stack.ts';
import {
  checkedOutPull,
  factsLine,
  mapLine,
  markCenter,
  mergedFold,
  pullFactsRow,
  pullLine,
  shownPulls,
  stackFacts,
  stackList,
  titleStart,
} from './stack.ts';

export type SpineTake = 'inline' | 'rail' | 'pinned';

// The checked-out PR's own work, as two groups.
const pullGroups = (tokens: DirectionTokens): Element[] => workGroups(baseRail, tokens);

const spineCard = (header: Element, body: Element[], tokens: DirectionTokens): Element =>
  panelCard([header, ...body, commitBar(tokens)], panelWidth, tokens);

// The line runs down from under the PR's mark; the content starts at the title column.
const inlineBlock = (pull: FakePull, tokens: DirectionTokens): Element => {
  const { rows } = tokens;
  const lineStart = rows.inset + rows.paddingX + markCenter;
  const contentStart = titleStart - markCenter - 1 - rows.inset - rows.paddingX;

  return v_flex()
    .flex_none()
    .ml(lineStart)
    .pl(contentStart)
    .border_l(1)
    .border_color(tokens.pane.border)
    .child(pullFactsRow(pull, tokens))
    .children(pullGroups(tokens));
};

const inlineLook: PullLook = (pull, tokens) => {
  if (!pull.checkedOut) {
    return pullLine(pull, tokens);
  }

  return v_flex().flex_none().child(pullLine(pull, tokens)).child(inlineBlock(pull, tokens));
};

const inlineCard = (tokens: DirectionTokens): Element =>
  spineCard(
    stackHeader(stackFacts(tokens), tokens),
    [panelColumn([stackList(inlineLook, tokens)])],
    tokens,
  );

const railCard = (tokens: DirectionTokens): Element =>
  spineCard(
    stackHeader(stackFacts(tokens), tokens),
    [panelColumn([railList(baseRail, workGroups, tokens)])],
    tokens,
  );

const pinnedBlock = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .pt(tokens.rows.listPadding)
    .child(pullLine(checkedOutPull, tokens))
    .child(factsLine(checkedOutPull, tokens))
    .children(pullGroups(tokens));

const stackMap = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .child(groupHeader('Stack', tokens).gap(tokens.pane.headerGap).children(stackFacts(tokens)))
    .children(shownPulls.map((pull) => mapLine(pull, tokens)))
    .child(mergedFold(tokens));

// The current PR never scrolls; only the stack map below it does.
const pinnedCard = (tokens: DirectionTokens): Element =>
  spineCard(
    stackHeader([], tokens),
    [pinnedBlock(tokens), sectionDivider(tokens), panelColumn([stackMap(tokens)])],
    tokens,
  );

const takes: Record<SpineTake, (tokens: DirectionTokens) => Element> = {
  inline: inlineCard,
  rail: railCard,
  pinned: pinnedCard,
};

export const spineTakeScene = (take: SpineTake, tokens: DirectionTokens): Element =>
  directionWindow(tokens, mapSidebar, oneCard(takes[take]));
