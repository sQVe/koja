import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { factSize, rowHeight, spacing } from './size.ts';
import type { LinkTarget } from './sourceLink.ts';
import { sourceLink } from './sourceLink.ts';
import { roleText } from './textRole.ts';

export interface Fact {
  label: string;
  value: string;
  // A value that opens its source draws as a link naming that source.
  link?: LinkTarget;
}

// A fact label is one short word, so it keeps its width and the value takes the cut.
const factLabel = (fact: Fact): Element => roleText('detail', fact.label, 'dim').flex_none();

const factValue = (fact: Fact): Element => {
  if (fact.link !== undefined) {
    return sourceLink({ identifier: fact.value, ...fact.link });
  }

  return roleText('detail', fact.value, 'foreground');
};

const railRow = (fact: Fact): Element => {
  const label = factLabel(fact).w(factSize.labelWidth).pt(spacing.xsmall);
  const value = factValue(fact).flex_1().py(spacing.xsmall);

  return h_flex()
    .min_w(0)
    .min_h(rowHeight.small)
    .gap(spacing.medium)
    .items_start()
    .child(label)
    .child(value);
};

const wrappedPair = (fact: Fact): Element =>
  h_flex()
    .min_w(0)
    .max_w_full()
    .min_h(rowHeight.small)
    .gap(spacing.small)
    .items_center()
    .child(factLabel(fact))
    .child(factValue(fact));

// A rail aligns the labels in one column, one fact per line.
export const factRows = (facts: Fact[]): Element =>
  v_flex().flex_none().min_w(0).children(facts.map(railRow));

// Under a title, whole label and value pairs wrap, with a wider gap between pairs than inside one.
export const factPairs = (facts: Fact[]): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .flex_wrap()
    .px(spacing.xxlarge)
    .pb(spacing.large)
    .gap_x(factSize.pairGap)
    .gap_y(0)
    .children(facts.map(wrappedPair));
