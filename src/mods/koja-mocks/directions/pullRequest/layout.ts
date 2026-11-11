import { h_flex, Scrollbar, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import type { ContentItem } from '../content/data.ts';
import { factRows, factsBlock } from '../content/facts.ts';
import {
  contentSection,
  contentSectionHeader,
  description,
  itemHeading,
  readingInset,
  saveRecoveryButton,
  scrollBody,
  sectionBodyInset,
} from '../content/parts.ts';
import { sectionDivider } from '../panels/frame.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import { blockedMerge, mergeActionWidth, mergeMenu, readyActions } from './actions.ts';
import type { PullView } from './data.ts';
import { hasResolvedReview, isBottomBarView } from './data.ts';
import { filesFact, pullFacts } from './facts.ts';
import { filesSection } from './files.ts';
import { detailText, needsYouSection } from './parts.ts';
import { promptBar, promptHeader } from './prompt.ts';

const factsRailWidth = 240;
const railInset = 16;
const menuTop = 328;
const sectionGap = spacing.medium;

const overview = (view: PullView, item: ContentItem, tokens: DirectionTokens): Element => {
  const resolved = hasResolvedReview(view.state);
  const body = v_flex().flex_none().min_w(0);

  if (view.queued && view.tray === 'header') {
    body.child(promptHeader(tokens));
  }

  if (view.state === 'zoomed') {
    body.child(sectionDivider(tokens).mx(readingInset));
  }

  if (resolved) {
    body.child(readyActions(view.state, tokens).mx(readingInset).py(spacing.medium));
  } else if (isBottomBarView(view)) {
    body.child(blockedMerge(tokens).mx(readingInset).py(spacing.medium));
  }

  if (isBottomBarView(view)) {
    body.child(sectionDivider(tokens).mx(readingInset));
  }

  if (!resolved) {
    body.child(needsYouSection(view, tokens));
  }

  const foldedDescription = view.tray === 'header';

  const descriptionSection = foldedDescription
    ? contentSectionHeader({ name: 'Description' }, false, [], tokens)
    : contentSection({ name: 'Description' }, [description(item, tokens)], tokens);

  const filesOpen = resolved || view.state === 'zoomed';

  if (resolved) {
    descriptionSection.mb(sectionGap);
  }

  return body.child(descriptionSection).child(filesSection(view, filesOpen, tokens));
};

const readingViewport = (reading: Element, view: PullView): Element => {
  if (!isBottomBarView(view)) {
    return reading;
  }

  return v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .min_w(0)
    .child(reading)
    .child(
      Scrollbar.vertical('pr-reading')
        .mode('always')
        .viewport_from_layout()
        .absolute()
        .top(0)
        .bottom(0)
        .left(0)
        .right(spacing.small),
    );
};

const pullHeading = (view: PullView, item: ContentItem, tokens: DirectionTokens): Element => {
  const actions: Element[] = [];

  if (isBottomBarView(view)) {
    actions.push(saveRecoveryButton('Sync', tokens).ml(spacing.large - spacing.medium));
  }

  const stateLook = isBottomBarView(view) ? 'plain' : 'badge';
  const heading = itemHeading(item, actions, stateLook, tokens);

  if (view.state === 'checks-failed') {
    heading.child(
      h_flex()
        .mt(spacing.small)
        .gap(spacing.small)
        .items_center()
        .child(icon('triangle-alert', 'small').text_color(tokens.marks.working))
        .child(detailText('Could not sync checks · GitHub timed out', tokens)),
    );
  }

  return heading;
};

export const pullBody = (view: PullView, item: ContentItem, tokens: DirectionTokens): Element => {
  const reading = isBottomBarView(view)
    ? v_flex().id('pr-reading').flex_1().min_h(0).min_w(0).pr(spacing.medium).overflow_y_scroll()
    : scrollBody('pr-reading');

  reading.child(pullHeading(view, item, tokens));

  if (view.state === 'unreachable') {
    reading.child(
      errorLine('Could not read PR · GitHub is unreachable', 'Retry', tokens).mt(spacing.medium),
    );

    return readingViewport(reading, view);
  }

  const wide = view.state === 'zoomed';

  if (!wide) {
    const facts = isBottomBarView(view)
      ? pullFacts(item.facts, tokens)
      : factsBlock(item.facts, tokens);

    const divider = sectionDivider(tokens);

    if (isBottomBarView(view)) {
      divider.mx(readingInset);
    }

    reading.child(facts).child(divider);
  }

  const content = overview(view, item, tokens);

  if (isBottomBarView(view)) {
    content.pb(sectionGap);
  } else {
    reading.pb(spacing.large);
  }

  reading.child(content);
  const column = v_flex().flex_1().min_h(0).min_w(0).child(readingViewport(reading, view));

  if (view.queued && isBottomBarView(view)) {
    column.child(promptBar(tokens));
  }

  const body = h_flex().relative().flex_1().min_h(0).min_w(0).items_stretch().child(column);

  if (wide) {
    body.child(
      scrollBody('pr-facts')
        .w(factsRailWidth)
        .flex_none()
        .p(railInset)
        .border_l(1)
        .border_color(tokens.pane.headerDivider)
        .child(factRows(item.facts, tokens))
        .child(filesFact(tokens)),
    );
  }

  if (view.state === 'ready-menu') {
    body.child(
      mergeMenu(tokens).absolute().left(sectionBodyInset(tokens)).top(menuTop).w(mergeActionWidth),
    );
  }

  return body;
};
