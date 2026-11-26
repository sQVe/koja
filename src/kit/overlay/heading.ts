import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { keycap } from '../keycap.ts';
import { rowHeight, spacing } from '../size.ts';
import { withTextRole } from '../textRole.ts';

export const overlayHeading = (label: string, letter: string | null): Element => {
  const box = div().flex_none();
  const text = withTextRole(box, 'sectionHeading').child(label);

  const heading = h_flex()
    .h(rowHeight.small)
    .flex_none()
    .min_w(0)
    .px(spacing.medium)
    .gap(spacing.small)
    .items_center()
    .child(text);

  return letter === null ? heading : heading.child(keycap(letter));
};
