import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { hoverCard, hoverCardHeight } from './hoverCard.ts';
import { icon } from './icon.ts';
import { listRow } from './listRow.ts';
import { hoverCardSize, spacing } from './size.ts';
import { statusMark } from './statusMark.ts';
import { roleText } from './textRole.ts';
import { colors } from './theme.ts';
import type { WorkNeed } from './workIcon.ts';
import { emptyWorkSlot, workIcon } from './workIcon.ts';

export interface StackCardPull {
  number: number | null;
  ticket: string | null;
  title: string;
  checkedOut: boolean;
  end: WorkNeed | 'draft' | 'closed' | null;
}

export interface StackCardModel {
  title: string;
  project: string;
  merged: number[];
  pulls: StackCardPull[];
  total: number;
}

const cardLine = (start: Element, end: string | null): Element => {
  const line = h_flex().flex_1().min_w(0).gap(spacing.small).items_center().child(start.flex_1());

  if (end !== null) {
    line.child(roleText('detail', end));
  }

  return line;
};

const pullNumber = (number: number | null): Element =>
  number === null
    ? div().w(hoverCardSize.pullColumn)
    : roleText('detail', `#${number}`, 'muted').w(hoverCardSize.pullColumn);

const ticketLabel = (ticket: string | null): Element =>
  ticket === null
    ? div().w(hoverCardSize.ticketColumn)
    : roleText('detail', ticket).w(hoverCardSize.ticketColumn);

const layerMark = (pull: StackCardPull): Element =>
  pull.checkedOut ? icon('git-branch', 'small') : statusMark(null);

const layerEnd = (pull: StackCardPull): Element => {
  if (pull.end === null) {
    return emptyWorkSlot();
  }

  if (pull.end === 'draft' || pull.end === 'closed') {
    return roleText('detail', pull.end, 'muted');
  }

  return workIcon(pull.end);
};

const isMuted = (pull: StackCardPull): boolean => pull.end === 'draft' || pull.end === 'closed';

const layerLabel = (pull: StackCardPull): Element => {
  const title = div().flex_1().min_w(0).truncate().child(pull.title);

  return h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(pullNumber(pull.number))
    .child(ticketLabel(pull.ticket))
    .child(title);
};

const layerRow = (pull: StackCardPull): Element =>
  listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    muted: isMuted(pull),
    start: layerMark(pull),
    label: layerLabel(pull),
    end: [layerEnd(pull)],
  });

const mergedRow = (merged: number[]): Element => {
  const checkIcon = icon('check', 'small').text_color(colors().dim);
  const pulls = merged.map((number) => `#${number}`).join(' · ');

  return listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    start: checkIcon,
    label: roleText('detail', pulls, 'muted'),
    end: [roleText('detail', `${merged.length} merged`)],
  });
};

const drawsMergedLine = (model: StackCardModel): boolean => model.merged.length > 0;

const stackCardRows = (model: StackCardModel): number =>
  model.pulls.length + (drawsMergedLine(model) ? 1 : 0);

export const stackCardHeight = (model: StackCardModel): number =>
  hoverCardHeight(stackCardRows(model));

const bodyRows = (model: StackCardModel): Element[] => {
  const rows: Element[] = [];

  if (drawsMergedLine(model)) {
    rows.push(mergedRow(model.merged));
  }

  return [...rows, ...model.pulls.map((pull) => layerRow(pull))];
};

export const stackCard = (model: StackCardModel): Element =>
  hoverCard({
    header: cardLine(roleText('title', model.title), model.project),
    body: bodyRows(model),
    footer: cardLine(roleText('detail', `${model.total} PRs`), null),
  });
