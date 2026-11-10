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
import { changeSegmentsOf, diffCounts } from '../panels/changes.ts';
import { sectionDivider } from '../panels/frame.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullState, PullVariant } from './data.ts';
import { blockedTotals, filesFor, pullDiffs } from './data.ts';
import { compactFiles, fileDiff, filesList, inlineDiffs } from './diff.ts';
import { checksSection, mergeBlock, needsYouSection, threadsSection } from './parts.ts';

const factsRailWidth = 240;

const viewSwitch = (state: PullState, tokens: DirectionTokens): Element =>
  changeSegmentsOf(
    [
      { name: 'Overview', active: state !== 'diff' },
      { name: 'Files', count: filesFor(state).length, active: state === 'diff' },
    ],
    tokens,
  )
    .ml(readingInset)
    .my(spacing.small);

const filesSection = (variant: PullVariant, state: PullState, tokens: DirectionTokens): Element => {
  const files = filesFor(state);
  const added = files.reduce((sum, file) => sum + file.add, 0);
  const removed = files.reduce((sum, file) => sum + file.del, 0);
  const open = variant !== 'reader' && state !== 'blocked';

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

const overview = (
  variant: PullVariant,
  state: PullState,
  item: ContentItem,
  tokens: DirectionTokens,
): Element => {
  const body = v_flex().flex_none().min_w(0);

  if (variant === 'handoff') {
    if (state !== 'ready') {
      body.child(needsYouSection(tokens));
    }
  } else {
    body.child(checksSection(state, tokens)).child(threadsSection(state, tokens));
  }

  const foldedDescription = variant === 'box' && state === 'blocked';

  const descriptionSection = foldedDescription
    ? contentSectionHeader({ name: 'Description' }, false, [], tokens)
    : contentSection({ name: 'Description' }, [description(item, tokens)], tokens);

  return body.child(descriptionSection).child(filesSection(variant, state, tokens));
};

const factsRail = (
  variant: PullVariant,
  state: PullState,
  item: ContentItem,
  tokens: DirectionTokens,
): Element => {
  const rail = scrollBody('pr-facts')
    .w(factsRailWidth)
    .flex_none()
    .p(spacing.large)
    .gap(spacing.large)
    .border_l(1)
    .border_color(tokens.pane.headerDivider);

  if (state === 'ready' || variant === 'box') {
    rail.child(mergeBlock(variant, state, tokens));
  }

  rail.child(factRows(item.facts, tokens));

  if (variant === 'box' && state === 'diff') {
    rail
      .child(contentSectionHeader({ name: 'Files', count: 9 }, true, [], tokens).mx(0))
      .child(filesList(state, true, tokens).mx(-spacing.large));
  }

  return rail;
};

const diffBody = (variant: PullVariant, tokens: DirectionTokens): Element => {
  if (variant === 'reader') {
    return v_flex()
      .min_w(0)
      .flex_none()
      .child(
        contentSectionHeader(
          { name: 'Files', count: 9 },
          true,
          diffCounts(blockedTotals.added, blockedTotals.removed, tokens),
          tokens,
        ),
      )
      .child(inlineDiffs(tokens));
  }

  const body = v_flex().flex_none().min_w(0);

  if (variant === 'handoff') {
    body.child(compactFiles(tokens)).child(sectionDivider(tokens));
  }

  return body.child(fileDiff(pullDiffs[0], tokens));
};

export const pullBody = (
  variant: PullVariant,
  state: PullState,
  item: ContentItem,
  tokens: DirectionTokens,
): Element => {
  const reading = scrollBody('pr-reading').child(itemHeading(item, tokens));

  if (state === 'blocked') {
    const facts =
      variant === 'box'
        ? item.facts.filter((fact) => ['Branch', 'Ticket', 'Files'].includes(fact.name))
        : item.facts;

    reading.child(factsBlock(facts, tokens)).child(sectionDivider(tokens));

    if (variant === 'box') {
      reading.child(mergeBlock(variant, state, tokens).mx(readingInset).my(spacing.xsmall));
    }
  }

  if (variant === 'handoff') {
    reading.child(viewSwitch(state, tokens));
  }

  const content =
    state === 'diff' ? diffBody(variant, tokens) : overview(variant, state, item, tokens);

  reading.child(content).pb(spacing.large);

  if (state === 'blocked') {
    return reading;
  }

  return h_flex()
    .flex_1()
    .min_h(0)
    .min_w(0)
    .items_stretch()
    .child(reading)
    .child(factsRail(variant, state, item, tokens));
};
