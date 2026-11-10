import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { rowHeight, spacing } from '../../../../kit/size.ts';
import { fixedLabel, label } from '../parts.ts';
import { sourceLink } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { ContentItem } from './data.ts';
import { readingInset } from './parts.ts';

const factLabelWidth = 64;
const factValueMaxWidth = 440;

const factValue = (fact: ContentItem['facts'][number], tokens: DirectionTokens): Element => {
  if (fact.link === true) {
    return sourceLink(fact.value, tokens)
      .max_w(factValueMaxWidth)
      .text_color(tokens.ink.dim)
      .flex_shrink(1)
      .tooltip(fact.value);
  }

  return label(fact.value, tokens.text.detail, tokens.ink.dim);
};

const factPair = (fact: ContentItem['facts'][number], tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .max_w_full()
    .h(rowHeight.small)
    .gap(spacing.medium)
    .items_center()
    .child(fixedLabel(fact.name, tokens.text.detail, tokens.ink.dim))
    .child(factValue(fact, tokens));

const alignedFact = (fact: ContentItem['facts'][number], tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .h(rowHeight.small)
    .gap(spacing.medium)
    .items_center()
    .child(fixedLabel(fact.name, tokens.text.detail, tokens.ink.dim).w(factLabelWidth))
    .child(factValue(fact, tokens).flex_1());

export const factRows = (facts: ContentItem['facts'], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .children(facts.map((fact) => alignedFact(fact, tokens)));

export const factsBlock = (facts: ContentItem['facts'], tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .flex_wrap()
    .px(readingInset)
    .pb(spacing.large)
    .gap(spacing.medium)
    .children(facts.map((fact) => factPair(fact, tokens)));
