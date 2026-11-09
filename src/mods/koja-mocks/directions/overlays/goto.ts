import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { agentPane } from '../../scenes/shellContent.ts';
import { withFloating } from '../floating.ts';
import { fixedLabel, label, statusMark, terminalFont } from '../parts.ts';
import { divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { placedSpaces } from './content.ts';
import {
  centered,
  iconMark,
  keycapOutline,
  line,
  overlayTokens,
  overlayTop,
  searchLine,
  searchRowHeight,
  spaceRow,
} from './parts.ts';

interface StatusChip {
  text: string;
  status: Status | null;
}

const gotoWidth = 780;
const gotoHeight = 300;
const listWidth = 400;
const chipHeight = 22;
const chipPadding = 8;
const chipGap = 4;
const previewLineGap = 2;

const statusChips: StatusChip[] = [
  { text: 'All', status: null },
  { text: 'Blocked', status: 'blocked' },
  { text: 'Done', status: 'done' },
  { text: 'Working', status: 'working' },
  { text: 'Idle', status: 'idle' },
];

const chip = (shown: StatusChip, active: boolean, tokens: DirectionTokens): Element => {
  const element = h_flex()
    .h(chipHeight)
    .px(chipPadding)
    .gap(chipGap)
    .flex_none()
    .items_center()
    .rounded(tokens.controls.radius);

  if (active) {
    element.bg(tokens.rows.selectedFill);
  } else {
    element.border(1).border_color(keycapOutline(tokens));
  }

  if (shown.status !== null) {
    element.child(statusMark(shown.status, tokens));
  }

  return element.child(fixedLabel(shown.text, tokens.text.detail, tokens.ink.muted));
};

const chipLine = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .px(tokens.rows.paddingX)
    .pb(chipGap)
    .gap(chipGap)
    .items_center()
    .children(statusChips.map((shown, index) => chip(shown, index === 0, tokens)));

const list = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(searchRowHeight(tokens), tokens);

  return v_flex()
    .w(listWidth)
    .flex_none()
    .h_full()
    .p(chipGap)
    .gap(previewLineGap)
    .child(searchLine('Go to a space, tab or pane', tokens))
    .child(chipLine(tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .children(placedSpaces.map((placed) => spaceRow(placed, placed.space.selected, rows)));
};

const preview = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .min_w(0)
    .h_full()
    .border_l(1)
    .border_color(tokens.pane.headerDivider)
    .child(
      line(
        [
          iconMark('terminal', tokens.ink.muted),
          fixedLabel(agentPane.name, tokens.text.title, tokens.ink.text),
          label(agentPane.task ?? '', tokens.text.detail, tokens.ink.dim),
        ],
        [statusMark(agentPane.status, tokens)],
        tokens,
      )
        .h(tokens.pane.headerHeight)
        .border_b(1)
        .border_color(tokens.pane.headerDivider),
    )
    .child(
      v_flex()
        .p(tokens.pane.bodyPadding)
        .gap(previewLineGap)
        .font_family(terminalFont)
        .text_size(tokens.text.terminal)
        .text_color(tokens.ink.text)
        .children(agentPane.lines.map((text) => div().truncate().child(text))),
    );

const goto = (tokens: DirectionTokens): Element =>
  h_flex()
    .absolute()
    .left(centered(gotoWidth))
    .top(overlayTop)
    .w(gotoWidth)
    .h(gotoHeight)
    .overflow_hidden()
    .rounded(tokens.pane.radius)
    .bg(tokens.pane.fill)
    .border(1)
    .border_color(tokens.pane.border)
    .child(list(tokens))
    .child(preview(tokens));

export const gotoScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [goto(tokens)], tokens);
