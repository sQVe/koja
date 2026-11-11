import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import type { SourceTarget } from '../content/data.ts';
import { externalLink } from '../content/links.ts';
import { readingInset } from '../content/parts.ts';
import { fixedLabel, label, row, statusMark } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { Slice } from './data.ts';
import { readinessStatus } from './parts.ts';

interface SliceLook {
  linked: boolean;
  selected: boolean;
  expanded: boolean;
  source: SourceTarget;
}

export interface SpineNode {
  content: Element;
  mark: Element;
  selected: boolean;
}

const trackHeight = 3;
const spineInk = '#7b8089';
const markCenter = 12;
const markLeft = 14;
const markTop = 6;
const markWidth = 12;
const spineLeft = 20;
const nextMarkSize = 8;

export const progressTrack = (slices: Slice[], tokens: DirectionTokens): Element => {
  const merged = slices.filter((slice) => slice.readiness === 'merged').length;

  return v_flex()
    .flex_none()
    .mx(readingInset)
    .py(spacing.xsmall)
    .gap(spacing.small)
    .child(fixedLabel(`${merged} of ${slices.length} merged`, tokens.text.detail, tokens.ink.muted))
    .child(
      h_flex()
        .h(trackHeight)
        .gap(trackHeight)
        .children(
          slices.map((slice) =>
            div().flex_1().h_full().bg(tokens.marks[readinessStatus[slice.readiness]]),
          ),
        ),
    );
};

export const sliceMark = (slice: Slice, tokens: DirectionTokens): Element => {
  if (slice.readiness === 'ready') {
    return div()
      .size(nextMarkSize)
      .rounded(nextMarkSize / 2)
      .border(2)
      .border_color(tokens.marks.idle);
  }

  return statusMark(readinessStatus[slice.readiness], tokens);
};

export const sliceName = (
  slice: Slice,
  linked: boolean,
  source: SourceTarget,
  tokens: DirectionTokens,
): Element => {
  const identifier = linked
    ? externalLink(slice.identifier, source, tokens).flex_none()
    : fixedLabel(slice.identifier, tokens.text.detail, tokens.ink.muted);

  return h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(identifier)
    .child(label(slice.title, tokens.text.body, tokens.ink.text).flex_1().tooltip(slice.title));
};

const sliceRow = (slice: Slice, look: SliceLook, tokens: DirectionTokens): Element => {
  const readiness = slice.readiness === 'ready' ? 'next' : slice.readiness;
  const name = h_flex().flex_1().min_w(0).gap(spacing.xsmall).items_center();

  if (look.expanded) {
    name.child(icon('chevron-down', 'xsmall').flex_none().text_color(tokens.ink.dim));
  }

  name.child(sliceName(slice, look.linked, look.source, tokens));

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(
      row(
        {
          selected: look.selected,
          start: statusMark(null, tokens),
          label: name,
          end: [fixedLabel(readiness, tokens.text.detail, tokens.ink.dim)],
        },
        tokens,
      ),
    );
};

export const spineSlice = (slice: Slice, look: SliceLook, tokens: DirectionTokens): SpineNode => ({
  content: sliceRow(slice, look, tokens),
  mark: sliceMark(slice, tokens),
  selected: look.selected,
});

const spineLine = (index: number, length: number): Element => {
  const line = div().absolute().left(spineLeft).w(1).bg(spineInk);
  const top = index === 0 ? markCenter : 0;

  line.top(top);

  if (index === length - 1) {
    return line.h(markCenter);
  }

  return line.bottom(0);
};

export const spine = (nodes: SpineNode[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.small)
    .children(
      nodes.map((node, index) => {
        const fill = node.selected ? tokens.rows.selectedFill : tokens.pane.fill;

        return v_flex()
          .relative()
          .flex_none()
          .min_w(0)
          .child(node.content)
          .child(spineLine(index, nodes.length))
          .child(
            h_flex()
              .absolute()
              .left(markLeft)
              .top(markTop)
              .size(markWidth)
              .items_center()
              .justify_center()
              .bg(fill)
              .child(node.mark),
          );
      }),
    );
