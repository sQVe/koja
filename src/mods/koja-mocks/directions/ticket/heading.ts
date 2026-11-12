import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { markSize, spacing } from '../../../../kit/size.ts';
import { itemHeading } from '../content/parts.ts';
import { dot, fixedLabel, statusMark } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { TicketView } from './data.ts';

const chipHeight = 20;

const ticketStateMark = (state: string, tokens: DirectionTokens): Element => {
  if (state === 'In progress') {
    return statusMark('working', tokens);
  }

  if (state === 'Done') {
    return statusMark('done', tokens);
  }

  const color = state === 'open' ? tokens.marks.done : tokens.marks.idle;

  return dot(markSize.quietDot, color);
};

const ticketStateChip = (state: string, tokens: DirectionTokens): Element =>
  h_flex()
    .h(chipHeight)
    .px(spacing.small)
    .gap(spacing.xsmall)
    .flex_none()
    .items_center()
    .rounded(tokens.marks.badgeRadius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(ticketStateMark(state, tokens))
    .child(fixedLabel(state, tokens.text.detail, tokens.ink.muted));

const freshnessSources = (view: TicketView): string => {
  if (view.state === 'sync-failed' || view.state === 'plain') {
    return view.item.source;
  }

  return `${view.item.source} and GitHub`;
};

export const ticketHeading = (view: TicketView, tokens: DirectionTokens): Element => {
  const { item } = view;
  const heading = itemHeading({ ...item, state: null }, [], 'badge', tokens);

  if (item.state === null) {
    return heading;
  }

  const state = h_flex()
    .mt(spacing.xsmall)
    .gap(spacing.medium)
    .items_center()
    .child(ticketStateChip(item.state, tokens));

  if (item.readAge !== null) {
    const sources = freshnessSources(view);

    state.child(
      fixedLabel(`${sources} synced ${item.readAge}`, tokens.text.detail, tokens.ink.dim),
    );
  }

  return heading.child(state);
};
