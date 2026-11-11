import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

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
} from '../content/parts.ts';
import { sectionDivider } from '../panels/frame.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import { blockedMerge, mergeActionWidth, mergeMenu, readyActions } from './actions.ts';
import type { PullView } from './data.ts';
import { hasResolvedReview, isBottomBarView } from './data.ts';
import { filesFact, pullFactsGrid } from './facts.ts';
import { filesSection } from './files.ts';
import { needsYouSection } from './parts.ts';
import { promptBar, promptHeader } from './prompt.ts';

const factsRailWidth = 240;
const railInset = 16;
const menuTop = 302;

const overview = (view: PullView, item: ContentItem, tokens: DirectionTokens): Element => {
  const resolved = hasResolvedReview(view.state);
  const body = v_flex().flex_none().min_w(0);

  if (view.queued && view.tray === 'header') {
    body.child(promptHeader(tokens));
  }

  if (resolved) {
    body.child(readyActions(view.state, tokens).mx(readingInset).py(spacing.medium));
  } else {
    if (isBottomBarView(view)) {
      body.child(blockedMerge(tokens).mx(readingInset).py(spacing.medium));
    }

    body.child(needsYouSection(view, tokens));
  }

  const foldedDescription = view.tray === 'header';

  const descriptionSection = foldedDescription
    ? contentSectionHeader({ name: 'Description' }, false, [], tokens)
    : contentSection({ name: 'Description' }, [description(item, tokens)], tokens);

  const filesOpen = resolved || view.state === 'zoomed';

  if (resolved) {
    descriptionSection.mb(spacing.medium);
  }

  return body.child(descriptionSection).child(filesSection(view.state, filesOpen, tokens));
};

export const pullBody = (view: PullView, item: ContentItem, tokens: DirectionTokens): Element => {
  const actions: Element[] = [];

  if (isBottomBarView(view)) {
    actions.push(saveRecoveryButton('Sync', tokens));
  }

  const reading = scrollBody('pr-reading').child(itemHeading(item, actions, tokens));

  if (view.state === 'unreachable') {
    return reading.child(
      errorLine('Could not read PR · GitHub is unreachable', 'Retry', tokens).mt(spacing.medium),
    );
  }

  const wide = view.state === 'zoomed';

  if (!wide) {
    const facts = isBottomBarView(view)
      ? pullFactsGrid(item.facts, tokens)
      : factsBlock(item.facts, tokens);

    reading.child(facts).child(sectionDivider(tokens));
  }

  reading.child(overview(view, item, tokens)).pb(spacing.large);
  const column = v_flex().flex_1().min_h(0).min_w(0).child(reading);

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
    body.child(mergeMenu(tokens).absolute().left(readingInset).top(menuTop).w(mergeActionWidth));
  }

  return body;
};
