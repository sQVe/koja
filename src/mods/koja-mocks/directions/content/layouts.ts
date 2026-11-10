import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon, stateLine } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import { sectionDivider } from '../panels/frame.ts';
import { fixedLabel } from '../parts.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import { pullSections, ticketSections } from './details.ts';
import { factRows, factsBlock } from './facts.ts';
import {
  contentSection,
  doneButton,
  itemHeading,
  paragraph,
  readingInset,
  scrollBody,
} from './parts.ts';
import { reviewFileChoices, reviewFileList, reviewText } from './review.ts';
import type { ContentState, ContentView } from './states.ts';

const factsRailWidth = 240;
const railInset = 16;
const sectionGap = 12;

const readingBody = (view: ContentView, tokens: DirectionTokens): Element => {
  const { item, state } = view;

  if (item.kind === 'review') {
    return reviewText(state, tokens);
  }

  const staleChecks = state === 'checks-failed';

  const sections =
    item.kind === 'pr' ? pullSections(item, staleChecks, tokens) : ticketSections(item, tokens);

  return v_flex().flex_none().min_w(0).py(sectionGap).gap(sectionGap).children(sections);
};

const reviewActions = (state: ContentState, tokens: DirectionTokens): Element => {
  if (state === 'sent') {
    return v_flex()
      .gap(spacing.medium)
      .child(
        h_flex()
          .gap(spacing.small)
          .items_center()
          .child(icon('check', 'small').text_color(tokens.marks.done))
          .child(fixedLabel('Review sent to Tau', tokens.text.body, tokens.ink.text)),
      )
      .child(paragraph('Tau closes this pane after collecting the review.', tokens));
  }

  const enabled = state !== 'saving-failed';
  const actions = v_flex().gap(spacing.medium).child(doneButton(enabled, tokens));

  if (!enabled) {
    actions
      .child(errorLine('Could not save', tokens).mx(0).px(0))
      .child(paragraph('Your edits are kept', tokens));
  }

  return actions;
};

const reviewRail = (view: ContentView, tokens: DirectionTokens): Element =>
  v_flex()
    .w(factsRailWidth)
    .flex_none()
    .p(railInset)
    .gap(railInset)
    .border_l(1)
    .border_color(tokens.pane.headerDivider)
    .child(reviewActions(view.state, tokens))
    .child(factRows(view.item.facts, tokens))
    .child(contentSection('Files 3', [reviewFileList(tokens)], tokens));

const narrowReviewControls = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .items_center()
    .gap(spacing.medium)
    .py(spacing.small)
    .child(reviewFileChoices(tokens).flex_1().min_w(0))
    .child(doneButton(true, tokens).mr(readingInset));

export const contentBody = (view: ContentView, tokens: DirectionTokens): Element => {
  const reading = scrollBody('content-reading').child(itemHeading(view.item, tokens));

  if (view.state === 'unreachable') {
    return reading.child(
      errorLine('Could not read PR · GitHub is unreachable', tokens).mt(spacing.medium),
    );
  }

  if (view.state === 'loading') {
    return reading.child(
      stateLine({ kind: 'loading', text: 'Loading ticket' }).px(readingInset).mt(spacing.medium),
    );
  }

  if (view.wide) {
    return h_flex()
      .flex_1()
      .min_h(0)
      .items_stretch()
      .child(reading.child(readingBody(view, tokens)))
      .child(reviewRail(view, tokens));
  }

  reading.child(factsBlock(view.item.facts, tokens)).child(sectionDivider(tokens));

  if (view.item.kind === 'review') {
    reading.child(narrowReviewControls(tokens));
  }

  return reading.child(readingBody(view, tokens));
};
