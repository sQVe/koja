import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { factSize, rowHeight, spacing } from './size.ts';
import type { SourceTarget } from './sourceLink.ts';
import { sourceLink } from './sourceLink.ts';
import { withTextRole } from './textRole.ts';

export interface Fact {
  label: string;
  value: string;
  // A value that opens its source draws as a link naming that source.
  source?: SourceTarget;
  repository?: string;
}

const factLabel = (fact: Fact): Element => {
  const box = div().flex_none().min_w(0).truncate();

  return withTextRole(box, 'detail', 'dim').child(fact.label);
};

const factValue = (fact: Fact): Element => {
  if (fact.source !== undefined) {
    const options = {
      identifier: fact.value,
      source: fact.source,
      ...(fact.repository === undefined ? {} : { repository: fact.repository }),
    };

    return sourceLink(options);
  }

  const box = div().min_w(0).truncate();

  return withTextRole(box, 'detail', 'foreground').child(fact.value);
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
