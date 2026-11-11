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
  contentSectionHeader,
  reviewActionButton,
  saveFailure,
  itemHeading,
  paragraph,
  readingInset,
  scrollBody,
} from './parts.ts';
import { reviewFileChoices, reviewFileList, reviewText } from './review.ts';
import type { ContentState, ContentView } from './states.ts';

const factsRailWidth = 240;
const railInset = 16;
const sectionGap = spacing.xxsmall;

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

export const reviewActions = (state: ContentState, tokens: DirectionTokens): Element => {
  if (state === 'sent') {
    return v_flex()
      .gap(spacing.medium)
      .child(
        h_flex()
          .gap(spacing.small)
          .items_center()
          .child(icon('check', 'small').text_color(tokens.marks.done))
          .child(fixedLabel('Sent to Tau', tokens.text.body, tokens.ink.text)),
      )
      .child(paragraph('Tau closes this pane after collecting the review.', tokens));
  }

  const failed = state === 'saving-failed';
  const action = failed ? 'Retry save' : 'Send to Tau';
  const actions = v_flex().gap(spacing.medium).child(reviewActionButton(action, tokens));

  if (failed) {
    actions.child(
      saveFailure(tokens, {
        error: 'Could not save: the folder is read-only',
        folder: '~/code/koja/.tau/reviews',
        unsaved: '1 line and 2 comments are unsaved. They stay in this pane.',
      }),
    );
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
    .child(
      v_flex()
        .child(contentSectionHeader({ name: 'Files', count: 3 }, true, [], tokens).mx(0))
        .child(reviewFileList(tokens)),
    );

const narrowReviewControls = (state: ContentState, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .items_center()
    .gap(spacing.medium)
    .py(spacing.small)
    .px(readingInset)
    .child(reviewFileChoices(tokens).flex_1().min_w(0))
    .child(reviewActions(state, tokens));

const reviewViewport = (reading: Element): Element =>
  v_flex().flex_1().min_h(0).min_w(0).pb(spacing.large).child(reading);

export const contentBody = (view: ContentView, tokens: DirectionTokens): Element => {
  const reading = scrollBody('content-reading').child(itemHeading(view.item, [], 'badge', tokens));

  if (view.state === 'unreachable') {
    return reading.child(
      errorLine('Could not read PR · GitHub is unreachable', 'Retry', tokens).mt(spacing.medium),
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
      .child(reviewViewport(reading.child(readingBody(view, tokens))))
      .child(reviewRail(view, tokens));
  }

  reading.child(factsBlock(view.item.facts, tokens)).child(sectionDivider(tokens));

  if (view.item.kind === 'review') {
    reading.child(narrowReviewControls(view.state, tokens));
  }

  reading.child(readingBody(view, tokens));

  if (view.item.kind === 'review') {
    return reviewViewport(reading);
  }

  return reading;
};
