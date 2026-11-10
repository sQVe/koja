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
  scrollBody,
} from '../content/parts.ts';
import { diffCounts } from '../panels/changes.ts';
import { sectionDivider } from '../panels/frame.ts';
import type { DirectionTokens } from '../tokens.ts';
import { mergeMenu, readyActions } from './actions.ts';
import type { PullState, PullTake } from './data.ts';
import { filesFor, pullDiffs } from './data.ts';
import { fileDiff, filesList } from './diff.ts';
import { detailText, mergeBlockers, needsYouSection } from './parts.ts';

const factsRailWidth = 240;
const railInset = 16;
const menuTop = 104;

const filesSection = (state: PullState, tokens: DirectionTokens): Element => {
  const files = filesFor(state);
  const added = files.reduce((sum, file) => sum + file.add, 0);
  const removed = files.reduce((sum, file) => sum + file.del, 0);
  const open = state === 'ready';

  const section = v_flex()
    .flex_none()
    .min_w(0)
    .child(
      contentSectionHeader(
        { name: 'Files', count: files.length },
        open,
        diffCounts(added, removed, tokens),
        tokens,
      ),
    );

  if (open) {
    section.child(filesList(state, false, tokens));
  }

  return section;
};

const overview = (state: PullState, item: ContentItem, tokens: DirectionTokens): Element => {
  const body = v_flex().flex_none().min_w(0);

  if (state === 'blocked') {
    body.child(needsYouSection(tokens));
  }

  return body
    .child(contentSection({ name: 'Description' }, [description(item, tokens)], tokens))
    .child(filesSection(state, tokens));
};

const factsRail = (
  take: PullTake,
  state: PullState,
  item: ContentItem,
  tokens: DirectionTokens,
): Element => {
  const rail = scrollBody('pr-facts')
    .w(factsRailWidth)
    .flex_none()
    .p(railInset)
    .gap(spacing.large)
    .border_l(1)
    .border_color(tokens.pane.headerDivider);

  const status = state === 'ready' ? readyActions(take, tokens) : mergeBlockers(tokens);

  rail.child(status).child(factRows(item.facts, tokens));

  if (state === 'diff') {
    rail
      .child(
        contentSectionHeader({ name: 'Files', count: filesFor(state).length }, true, [], tokens).mx(
          0,
        ),
      )
      .child(filesList(state, true, tokens).mx(-railInset));
  }

  return rail;
};

const leftFileDiff = (item: ContentItem, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .min_w(0)
    .child(itemHeading(item, tokens))
    .child(
      detailText('1 check failing · 2 threads unresolved · changes requested', tokens)
        .mx(readingInset)
        .pb(spacing.large),
    )
    .child(sectionDivider(tokens))
    .child(
      h_flex()
        .flex_1()
        .min_h(0)
        .min_w(0)
        .items_stretch()
        .child(
          scrollBody('pr-file-navigation')
            .w(factsRailWidth)
            .flex_none()
            .border_r(1)
            .border_color(tokens.pane.headerDivider)
            .child(
              contentSectionHeader(
                { name: 'Files', count: filesFor('diff').length },
                true,
                [],
                tokens,
              ),
            )
            .child(filesList('diff', true, tokens)),
        )
        .child(scrollBody('pr-diff').child(fileDiff(pullDiffs[0], tokens))),
    );

export const pullBody = (
  take: PullTake,
  state: PullState,
  item: ContentItem,
  tokens: DirectionTokens,
): Element => {
  if (take === 'agent' && state === 'diff') {
    return leftFileDiff(item, tokens);
  }

  const reading = scrollBody('pr-reading').child(itemHeading(item, tokens));

  if (state === 'blocked') {
    return reading
      .child(factsBlock(item.facts, tokens))
      .child(sectionDivider(tokens))
      .child(overview(state, item, tokens))
      .pb(spacing.large);
  }

  const content = state === 'diff' ? fileDiff(pullDiffs[0], tokens) : overview(state, item, tokens);

  reading.child(content).pb(spacing.large);

  const body = v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .min_w(0)
    .child(
      h_flex()
        .flex_1()
        .min_h(0)
        .min_w(0)
        .items_stretch()
        .child(reading)
        .child(factsRail(take, state, item, tokens)),
    );

  if (take === 'split' && state === 'ready') {
    body.child(
      mergeMenu(tokens)
        .absolute()
        .right(railInset)
        .top(menuTop)
        .w(factsRailWidth - railInset * 2),
    );
  }

  return body;
};
