import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import { icon } from '../../../../kit/index.ts';
import { fixedLabel, label, statusMark } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeSpace, WorkNeed } from './content.ts';

interface RowLook {
  space: FakeSpace;
  middle: Element[];
  trailing: Element[];
  hovered: boolean;
  progress: boolean;
}

const factGap = 6;
const innerGap = 4;
const progressWidth = 12;
const progressHeight = 3;
// Translucent, so the track shows on the frame and on the selected row's pill alike.
const progressTrack = '#43464e33';
const ringSize = 6;
const markSlot = 14;
const listRowGap = 2;
const dividerHeight = 1;

const needIcons: Record<WorkNeed, IconName> = {
  conflict: 'triangle-alert',
  failing: 'circle-x',
  review: 'message-square',
  restack: 'layers',
  merge: 'git-merge',
};

const stateIcon = (name: IconName, color: Color): Element => icon(name, 'small').text_color(color);

const needColor = (need: WorkNeed, tokens: DirectionTokens): Color => {
  if (need === 'merge') {
    return tokens.marks.done;
  }

  const waits = need === 'review' || need === 'restack';

  return waits ? tokens.marks.modified : tokens.marks.blocked;
};

const slot = (): Element => h_flex().w(markSlot).flex_none().items_center().justify_center();

export const dimFact = (text: string, tokens: DirectionTokens): Element =>
  fixedLabel(text, tokens.text.detail, tokens.ink.dim);

const needMark = (space: FakeSpace, tokens: DirectionTokens): Element => {
  if (space.need === undefined) {
    return slot();
  }

  return slot().child(stateIcon(needIcons[space.need], needColor(space.need, tokens)));
};

// An agent that asks the user gets its own icon; other states keep the kit's marks. A space with
// no agent shows a hollow ring.
export const agentMark = (space: FakeSpace, tokens: DirectionTokens): Element => {
  if (space.agent === 'blocked') {
    return slot().child(stateIcon('message-circle-question', tokens.marks.blocked));
  }

  if (space.agent !== null) {
    return statusMark(space.agent, tokens).w(markSlot);
  }

  const ring = div()
    .size(ringSize)
    .rounded(ringSize / 2)
    .flex_none()
    .border(1)
    .border_color(tokens.marks.idle);

  return slot().child(ring);
};

// A thin bar shows how far the stack has merged, a shape no status mark uses.
export const progressBar = (merged: number, total: number, tokens: DirectionTokens): Element =>
  h_flex()
    .w(progressWidth)
    .h(progressHeight)
    .flex_none()
    .rounded(progressHeight / 2)
    .bg(progressTrack)
    .child(
      div()
        .w((progressWidth * merged) / total)
        .h_full()
        .rounded(progressHeight / 2)
        .bg(tokens.ink.dim),
    );

const stackFact = (space: FakeSpace, tokens: DirectionTokens): Element[] => {
  if (space.stack === undefined) {
    return [];
  }

  const { merged, total } = space.stack;

  const progress = h_flex()
    .flex_none()
    .gap(innerGap - 1)
    .items_center()
    .child(progressBar(merged, total, tokens))
    .child(dimFact(`${merged}/${total}`, tokens));

  return [progress];
};

export const titleLabel = (space: FakeSpace, tokens: DirectionTokens): Element =>
  label(space.title, tokens.text.body, tokens.ink.text).flex_shrink(1);

// Hover is a 1 px outline; selection is the gray pill.
export const rowLine = (look: RowLook, tokens: DirectionTokens): Element => {
  const { space } = look;
  const { rows } = tokens;

  const line = h_flex()
    .flex_none()
    .min_w(0)
    .h(rows.height)
    .mx(rows.inset)
    .px(rows.paddingX)
    .gap(factGap)
    .items_center()
    .rounded(rows.radius)
    .child(agentMark(space, tokens))
    .children(look.middle)
    .child(h_flex().flex_1())
    .children(look.trailing)
    .children(look.progress ? stackFact(space, tokens) : [])
    .child(needMark(space, tokens));

  if (space.selected) {
    return line.bg(rows.selectedFill);
  }

  return look.hovered ? line.border(1).border_color(tokens.pane.border) : line;
};

// Facts that belong together sit close and are split by a dim dot.
export const joinedFacts = (parts: Element[], tokens: DirectionTokens): Element => {
  const joined = h_flex().min_w(0).gap(innerGap).items_center();

  parts.forEach((part, index) => {
    if (index > 0) {
      joined.child(fixedLabel('·', tokens.text.detail, tokens.ink.dim));
    }

    joined.child(part);
  });

  return joined;
};

export const groupHeader = (name: string, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .h(tokens.rows.height)
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .items_center()
    .child(fixedLabel(name, tokens.text.heading, tokens.ink.text));

export const sidebarGroup = (header: Element, rows: Element[]): Element =>
  v_flex().flex_none().gap(listRowGap).child(header).children(rows);

export const divider = (tokens: DirectionTokens): Element =>
  div().h(dividerHeight).flex_none().mx(tokens.rows.inset).bg(tokens.rows.selectedFill);

export const sidebarFrame = (tokens: DirectionTokens): Element =>
  v_flex()
    .w(tokens.areas.sidebarWidth)
    .flex_none()
    .h_full()
    .min_h(0)
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.groupGap)
    .bg(tokens.areas.frame);
