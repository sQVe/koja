import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import type { ContentFact } from '../content/data.ts';
import { factRow, factRows } from '../content/facts.ts';
import { readingInset } from '../content/parts.ts';
import { diffCounts } from '../panels/changes.ts';
import { fixedLabel } from '../parts.ts';
import { sourceLink } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { pullFileTotals, pullRequestFiles } from './data.ts';

export const filesFact = (tokens: DirectionTokens): Element => {
  const value = h_flex()
    .min_w(0)
    .flex_wrap()
    .gap(spacing.xsmall)
    .items_center()
    .child(fixedLabel(`${pullRequestFiles.length} changed`, tokens.text.detail, tokens.ink.text))
    .children(diffCounts(pullFileTotals.added, pullFileTotals.removed, tokens))
    .child(sourceLink('diff in Greppa', tokens));

  return factRow('Files', value, tokens);
};

export const pullFacts = (facts: ContentFact[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .pb(spacing.large)
    .child(factRows(facts, tokens))
    .child(filesFact(tokens));
