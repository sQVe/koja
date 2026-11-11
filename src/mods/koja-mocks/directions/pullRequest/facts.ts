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

export const pullFactsGrid = (facts: ContentFact[], tokens: DirectionTokens): Element => {
  const branch = facts.filter((fact) => fact.name === 'Branch');
  const related = facts.filter((fact) => fact.name !== 'Branch');
  const columns = related.map((fact) => factRows([fact], tokens).w(0).flex_1());

  return v_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .pb(spacing.large)
    .child(factRows(branch, tokens))
    .child(h_flex().min_w(0).gap(spacing.large).children(columns))
    .child(filesFact(tokens));
};
