import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import type { SourceTarget } from '../content/data.ts';
import { readingInset } from '../content/parts.ts';
import { fixedLabel, label, row, statusMark } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { Slice } from './data.ts';
import { isActiveSlice } from './data.ts';
import { identifierCell, planChevronWidth, readinessStatus, statusWord } from './parts.ts';

interface SliceLook {
  kind: 'current' | 'linked';
  disclosure: 'none' | 'open' | 'closed';
  source: SourceTarget;
  identifierWidth: number;
  reason: string | null;
}

export interface SpineNode {
  content: Element;
  mark: Element;
  selected: boolean;
}

const trackHeight = 3;
const markCenter = 12;
const markLeft = 14;
const markTop = 6;
const markWidth = 12;
const spineLeft = 20;
const nextMarkSize = 8;

const nextMark = (tokens: DirectionTokens): Element => {
  const ring = div()
    .size(nextMarkSize)
    .rounded(nextMarkSize / 2)
    .border(2)
    .border_color(tokens.marks.idle);

  return h_flex().w(markWidth).flex_none().items_center().justify_center().child(ring);
};

const trackColor = (slice: Slice, tokens: DirectionTokens) => {
  if (slice.readiness === 'merged') {
    return tokens.marks.done;
  }

  if (slice.readiness === 'ready') {
    return tokens.marks.idle;
  }

  return slice.readiness === 'blocked' ? tokens.marks.blocked : tokens.marks.working;
};

const trackCounts = (slices: Slice[], tokens: DirectionTokens): Element => {
  const ready = slices.filter((slice) => slice.readiness === 'ready').length;

  const groups = [
    {
      name: `of ${slices.length} merged`,
      count: slices.filter((slice) => slice.readiness === 'merged').length,
      mark: statusMark('done', tokens),
    },
    {
      name: 'active',
      count: slices.filter(isActiveSlice).length,
      mark: statusMark('working', tokens),
    },
    { name: 'next', count: ready, mark: nextMark(tokens) },
    {
      name: 'blocked',
      count: slices.filter((slice) => slice.readiness === 'blocked').length,
      mark: statusMark('blocked', tokens),
    },
  ];

  const visible = groups.filter((group) => group.count > 0);
  const counts = h_flex().flex_none().min_w(0).gap(spacing.small).items_center();

  for (const [index, group] of visible.entries()) {
    if (index > 0) {
      counts.child(fixedLabel('·', tokens.text.detail, tokens.ink.dim));
    }

    const countGroup = h_flex()
      .gap(spacing.xsmall)
      .items_center()
      .child(group.mark)
      .child(fixedLabel(`${group.count} ${group.name}`, tokens.text.detail, tokens.ink.dim));

    counts.child(countGroup);
  }

  return counts;
};

export const progressTrack = (slices: Slice[], tokens: DirectionTokens): Element => {
  // The working mark reaches one pixel above the count text.
  const topInset = slices.some(isActiveSlice) ? spacing.medium : spacing.medium + spacing.hairline;

  const segments = h_flex()
    .h(trackHeight)
    .gap(trackHeight)
    .children(slices.map((slice) => div().flex_1().h_full().bg(trackColor(slice, tokens))));

  return v_flex()
    .flex_none()
    .ml(readingInset)
    .mr(tokens.rows.inset + tokens.rows.paddingX)
    .pt(topInset)
    .pb(spacing.xsmall)
    .gap(spacing.small)
    .child(segments)
    .child(trackCounts(slices, tokens));
};

export const sliceMark = (slice: Slice, tokens: DirectionTokens): Element => {
  if (slice.readiness === 'ready') {
    return nextMark(tokens);
  }

  return statusMark(readinessStatus[slice.readiness], tokens);
};

const sliceRow = (slice: Slice, look: SliceLook, tokens: DirectionTokens): Element => {
  const word = slice.readiness === 'ready' ? 'next' : slice.readiness;
  const chevron = h_flex().w(planChevronWidth).flex_none().items_center();

  if (look.disclosure !== 'none') {
    const name = look.disclosure === 'open' ? 'chevron-down' : 'chevron-right';

    const chevronIcon = icon(name, 'xsmall').text_color(tokens.ink.dim);

    chevron.child(chevronIcon);
  }

  const titleLabel = label(slice.title, tokens.text.body, tokens.ink.text).tooltip(slice.title);
  const title = h_flex().flex_1().min_w(0).gap(spacing.xxsmall).items_center().child(titleLabel);

  if (look.reason !== null) {
    const reasonLabel = fixedLabel(look.reason, tokens.text.detail, tokens.ink.dim).tooltip(
      look.reason,
    );

    title.child(fixedLabel('·', tokens.text.detail, tokens.ink.dim)).child(reasonLabel);
  }

  const identifier = identifierCell(
    slice.identifier,
    { source: look.source, width: look.identifierWidth, kind: look.kind },
    tokens,
  );

  const identifiedTitle = h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(identifier)
    .child(title);

  const rowLabel = h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.xsmall)
    .items_center()
    .child(chevron)
    .child(identifiedTitle);

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(
      row(
        {
          selected: look.kind === 'current',
          start: statusMark(null, tokens),
          label: rowLabel,
          end: [statusWord(word, tokens)],
        },
        tokens,
      ),
    );
};

export const spineSlice = (slice: Slice, look: SliceLook, tokens: DirectionTokens): SpineNode => ({
  content: sliceRow(slice, look, tokens),
  mark: sliceMark(slice, tokens),
  selected: look.kind === 'current',
});

const spineLine = (index: number, length: number, tokens: DirectionTokens): Element => {
  const line = div().absolute().left(spineLeft).w(1).bg(tokens.marks.spine);
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

        const markSlot = h_flex()
          .absolute()
          .left(markLeft)
          .top(markTop)
          .size(markWidth)
          .items_center()
          .justify_center()
          .bg(fill)
          .child(node.mark);

        return v_flex()
          .relative()
          .flex_none()
          .min_w(0)
          .child(node.content)
          .child(spineLine(index, nodes.length, tokens))
          .child(markSlot);
      }),
    );
