import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { agentPane, fakeTabs } from '../../scenes/shellContent.ts';
import { factRows } from '../content/facts.ts';
import {
  contentHeader,
  contentSectionHeader,
  itemHeading,
  readingInset,
  scrollBody,
} from '../content/parts.ts';
import { koja, kojaNormal } from '../koja.ts';
import { card, cardSlot, fixedLabel } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DirectionTab } from '../window.ts';
import { directionWindow } from '../window.ts';
import { brokenBody, draftActions } from './actions.ts';
import type { DraftState, DraftView } from './data.ts';
import { pinnedDocument } from './documents.ts';
import { fileNavigation } from './parts.ts';
import { draftView } from './views.ts';

const railWidth = 260;
const bodyInset = 16;
const stateRowHeight = 20;

const factsRail = (view: DraftView, tokens: DirectionTokens): Element =>
  scrollBody('draft-facts')
    .w(railWidth)
    .flex_none()
    .p(bodyInset)
    .gap(bodyInset)
    .border_l(1)
    .border_color(tokens.pane.headerDivider)
    .child(draftActions(view.state, tokens))
    .child(factRows(view.item.facts, tokens))
    .child(
      v_flex()
        .flex_none()
        .child(
          contentSectionHeader({ name: 'Files', count: view.files.length }, true, [], tokens).mx(0),
        )
        .child(fileNavigation(view, tokens)),
    );

const reviewHeading = (view: DraftView, tokens: DirectionTokens): Element => {
  const heading = itemHeading(view.item, {
    ...tokens,
    marks: { ...tokens.marks, blocked: tokens.ink.dim },
  }).relative();

  if (view.state === 'sent' || view.state === 'broken') {
    return heading;
  }

  const hint =
    view.state === 'edit-file'
      ? 'Done editing returns body.md to line comments'
      : 'Click a line to comment or edit · Drag line numbers for more lines';

  return heading.child(
    h_flex()
      .absolute()
      .right(readingInset)
      .bottom(spacing.medium)
      .h(stateRowHeight)
      .items_center()
      .child(fixedLabel(hint, tokens.text.detail, tokens.ink.dim)),
  );
};

const reviewBody = (view: DraftView, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_1()
    .min_h(0)
    .items_stretch()
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .min_h(0)
        .child(reviewHeading(view, tokens))
        .child(pinnedDocument(view, tokens)),
    )
    .child(factsRail(view, tokens));

const draftPane = (view: DraftView, tokens: DirectionTokens): Element => {
  const body = view.state === 'broken' ? brokenBody(view, tokens) : reviewBody(view, tokens);

  return cardSlot(
    card(true, tokens).child(contentHeader(view.item, tokens)).child(body),
    tokens,
  ).flex_1();
};

export const draftReviewScene = (state: DraftState): Element => {
  const view = draftView(state);
  const mode = state === 'normal' ? kojaNormal : koja;

  const tabs: DirectionTab[] = fakeTabs.map((tab) => ({
    label: tab.label,
    active: false,
    status: tab.status,
    program: tab.program,
  }));

  tabs.push({
    label: view.item.tab,
    active: true,
    status: null,
    program: agentPane.program,
    icon: view.item.icon,
  });

  return directionWindow(mode, undefined, {
    agent: null,
    agentFocused: false,
    tabs,
    toggles: () => [],
    panes: (tokens) => [draftPane(view, tokens)],
  });
};
