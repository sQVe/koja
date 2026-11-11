import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { rowHeight, spacing } from '../../../../kit/size.ts';
import { externalLink } from '../content/links.ts';
import { readingInset } from '../content/parts.ts';
import { fixedLabel, label } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { TicketFact } from './data.ts';
import { detailSeparator } from './parts.ts';

const factLabelWidth = 64;
const factPairGap = 24;

const factValue = (
  fact: TicketFact,
  layout: 'inline' | 'stacked',
  tokens: DirectionTokens,
): Element => {
  if (fact.name === 'Project') {
    return fixedLabel(fact.value, tokens.text.detail, tokens.ink.text);
  }

  const value = layout === 'inline' ? h_flex().items_center() : v_flex();

  value
    .flex_1()
    .min_w(0)
    .gap(0)
    .child(externalLink(fact.value, fact.target, tokens).flex_none());

  if (fact.title !== null) {
    const title = label(fact.title, tokens.text.detail, tokens.ink.text).tooltip(fact.title);

    if (layout === 'inline') {
      value.child(detailSeparator(tokens));
      title.flex_1();
    }

    value.child(title);
  }

  return value;
};

const factPair = (fact: TicketFact, tokens: DirectionTokens): Element => {
  const pair = h_flex()
    .min_w(0)
    .min_h(rowHeight.small)
    .gap(spacing.small)
    .items_center()
    .child(fixedLabel(fact.name, tokens.text.detail, tokens.ink.dim))
    .child(factValue(fact, 'inline', tokens));

  return fact.name === 'Project' ? pair.flex_none() : pair.flex_1();
};

export const ticketFacts = (facts: TicketFact[], tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .pb(spacing.large)
    .gap(factPairGap)
    .children(facts.map((fact) => factPair(fact, tokens)));

export const ticketFactRows = (facts: TicketFact[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .children(
      facts.map((fact) =>
        h_flex()
          .min_w(0)
          .min_h(rowHeight.small)
          .gap(spacing.medium)
          .items_start()
          .child(
            fixedLabel(fact.name, tokens.text.detail, tokens.ink.dim)
              .w(factLabelWidth)
              .pt(spacing.xsmall),
          )
          .child(factValue(fact, 'stacked', tokens).flex_1().py(spacing.xsmall)),
      ),
    );
