import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { rowHeight, spacing } from '../../../../kit/size.ts';
import { diffCounts } from '../panels/changes.ts';
import { fixedLabel, label, middleCutLabel, styled } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { ContentFact } from './data.ts';
import { agentLink, externalLink } from './links.ts';
import { checkMark, readingInset } from './parts.ts';

const factLabelWidth = 64;
const factValueMaxWidth = 440;
const factPairGap = 24;

const factValue = (fact: ContentFact, tokens: DirectionTokens): Element => {
  if (fact.target === 'agent') {
    return agentLink(fact.value, tokens);
  }

  if (fact.target === 'GitHub') {
    return h_flex()
      .min_w(0)
      .gap(spacing.xsmall)
      .items_center()
      .child(externalLink(fact.value, fact.target, tokens))
      .child(fixedLabel('· open', tokens.text.detail, tokens.ink.dim));
  }

  if (fact.target !== undefined) {
    return externalLink(fact.value, fact.target, tokens).max_w(factValueMaxWidth).flex_shrink(1);
  }

  if (fact.diff !== undefined) {
    return h_flex()
      .gap(spacing.xsmall)
      .items_center()
      .child(fixedLabel(fact.value, tokens.text.detail, tokens.ink.text))
      .children(diffCounts(fact.diff.added, fact.diff.removed, tokens));
  }

  if (fact.checkState === undefined) {
    const ink = fact.warning === true ? tokens.marks.working : tokens.ink.text;

    if (fact.truncateMiddle === true) {
      return middleCutLabel(fact.value, tokens.text.detail, ink).tooltip(fact.value);
    }

    if (fact.wrap === true) {
      return styled(div().min_w(0), tokens.text.detail, ink).child(fact.value);
    }

    return label(fact.value, tokens.text.detail, ink);
  }

  const value = h_flex()
    .min_w(0)
    .gap(spacing.xsmall)
    .items_center()
    .child(checkMark(fact.checkState, tokens))
    .child(fixedLabel(fact.value, tokens.text.detail, tokens.ink.text));

  if (fact.age !== undefined) {
    value.child(fixedLabel(`· ${fact.age}`, tokens.text.detail, tokens.ink.dim));
  }

  return value;
};

const factPair = (fact: ContentFact, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .max_w_full()
    .min_h(rowHeight.small)
    .gap(spacing.small)
    .items_center()
    .child(fixedLabel(fact.name, tokens.text.detail, tokens.ink.dim))
    .child(factValue(fact, tokens));

const alignedFact = (fact: ContentFact, tokens: DirectionTokens): Element =>
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
    .child(factValue(fact, tokens).flex_1().py(spacing.xsmall));

export const factRows = (facts: ContentFact[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .children(facts.map((fact) => alignedFact(fact, tokens)));

export const factsGrid = (facts: ContentFact[], tokens: DirectionTokens): Element => {
  const grid = v_flex().flex_none().min_w(0).px(readingInset).pb(spacing.large);

  for (let index = 0; index < facts.length; index += 2) {
    const pair = facts.slice(index, index + 2);
    const columns = pair.map((fact) => alignedFact(fact, tokens).w(0).flex_1());

    if (pair.length === 1) {
      columns.push(div().w(0).flex_1());
    }

    grid.child(h_flex().min_w(0).gap(spacing.large).children(columns));
  }

  return grid;
};

export const factsBlock = (facts: ContentFact[], tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .flex_wrap()
    .px(readingInset)
    .pb(spacing.large)
    .gap_x(factPairGap)
    .gap_y(0)
    .children(facts.map((fact) => factPair(fact, tokens)));
