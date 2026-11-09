import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { FakeTab } from '../../scenes/shellContent.ts';
import { agentPane, fakeTabs } from '../../scenes/shellContent.ts';
import { withFloating } from '../floating.ts';
import { fixedLabel, label, statusMark, terminalFont } from '../parts.ts';
import type { FakeSpace } from '../sidebars/content.ts';
import { agentMark } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { branchField } from '../window.ts';
import type { PlacedSpace } from './content.ts';
import { placedSpaces } from './content.ts';
import {
  centered,
  heading,
  iconMark,
  footerLine,
  line,
  overlayBorder,
  overlaySurface,
  overlayTokens,
  overlayTop,
  searchLine,
  searchLineHeight,
  searchRowHeight,
  spaceRow,
} from './parts.ts';

interface StatusChip {
  text: string;
  status: Status | null;
}

// Wide enough for the preview header to show every pane header field, the task included.
const gotoWidth = 880;
const gotoHeight = 436;
const listWidth = 400;
const chipHeight = 22;
const chipPadding = 8;
const chipGap = 4;
const previewLineGap = 2;
// A tab row's status mark sits under its space's title: the agent mark's slot and its gap.
const tabIndent = 20;
// The agent mark's slot in a space row, so a tab's mark takes the same width.
const markSlotWidth = 14;
// Inactive chips keep a 1 px border box so the chip line does not shift, but draw no outline.
const noOutline = '#00000000';
const footerHeight = 30;

const statusChips: StatusChip[] = [
  { text: 'All', status: null },
  { text: 'Waiting', status: 'blocked' },
  { text: 'Done', status: 'done' },
  { text: 'Working', status: 'working' },
  { text: 'Idle', status: 'idle' },
];

// The search line and the chip line share one band with the preview's header, under one rule.
const headerBand = (tokens: DirectionTokens): number =>
  chipGap + searchLineHeight(tokens) + previewLineGap + chipHeight + chipGap;

// A space with only an agent status, so a chip draws the same mark as the rows and the sidebar.
const markedSpace = (agent: Status): FakeSpace => ({ title: '', agent, selected: false, age: '' });

// How many shown spaces have the chip's status. `All` counts every shown space.
const chipCount = (shown: StatusChip, tokens: DirectionTokens): Element => {
  const matching = placedSpaces.filter(
    (placed) => shown.status === null || placed.space.agent === shown.status,
  );

  return fixedLabel(String(matching.length), tokens.text.detail, tokens.ink.dim);
};

const chip = (shown: StatusChip, active: boolean, tokens: DirectionTokens): Element => {
  const element = h_flex()
    .h(chipHeight)
    .px(chipPadding)
    .gap(chipGap)
    .flex_none()
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(noOutline);

  if (shown.status !== null) {
    element.child(agentMark(markedSpace(shown.status), tokens));
  }

  // A segmented choice: the active chip takes the hover fill and an outline, so the selected row
  // stays the only gray pill.
  if (active) {
    element.bg(tokens.rows.hoverFill).border_color(overlayBorder);

    return element
      .child(fixedLabel(shown.text, tokens.text.detail, tokens.ink.text))
      .child(chipCount(shown, tokens));
  }

  return element
    .child(fixedLabel(shown.text, tokens.text.detail, tokens.ink.muted))
    .child(chipCount(shown, tokens));
};

const chipLine = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .px(tokens.rows.paddingX)
    .gap(chipGap)
    .items_center()
    .children(statusChips.map((shown, index) => chip(shown, index === 0, tokens)));

const bandRule = (element: Element, tokens: DirectionTokens): Element =>
  element.h(headerBand(tokens)).flex_none().border_b(1).border_color(tokens.pane.headerDivider);

const searchHead = (tokens: DirectionTokens): Element =>
  bandRule(
    v_flex()
      .p(chipGap)
      .gap(previewLineGap)
      .child(searchLine('Go to a space, tab or pane', tokens))
      .child(chipLine(tokens)),
    tokens,
  );

const tabRow = (tab: FakeTab, tokens: DirectionTokens): Element =>
  line(
    [
      statusMark(tab.status, tokens).w(markSlotWidth),
      iconMark('terminal', tokens.ink.muted),
      label(tab.label, tokens.text.body, tokens.ink.muted),
    ],
    [],
    tokens,
  ).pl(tokens.rows.paddingX + tabIndent);

// The current space has several tabs, so they follow it as child rows, as the live picker shows.
const spaceRows = (placed: PlacedSpace, tokens: DirectionTokens): Element[] => {
  const row = spaceRow(placed, placed.space.selected, tokens);

  if (!placed.space.selected) {
    return [row];
  }

  return [row, ...fakeTabs.map((tab) => tabRow(tab, tokens))];
};

const list = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(searchRowHeight(tokens), tokens);

  return v_flex()
    .w(listWidth)
    .flex_none()
    .h_full()
    .child(searchHead(tokens))
    .child(
      v_flex()
        .p(chipGap)
        .gap(previewLineGap)
        .child(heading('Spaces', [], tokens))
        .children(placedSpaces.flatMap((placed) => spaceRows(placed, rows))),
    );
};

// The space comes first, then the pane, so the header names the target the row selects. It drops
// the folder, so the branch shows whole.
const previewHeader = (tokens: DirectionTokens): Element => {
  const { ink, text } = tokens;

  const header = h_flex()
    .px(tokens.pane.headerPadding)
    .gap(tokens.pane.headerGap)
    .items_center()
    .overflow_hidden()
    .child(fixedLabel(agentPane.task ?? '', text.title, ink.text))
    .child(iconMark('terminal', ink.muted))
    .child(fixedLabel(agentPane.name, text.detail, ink.muted));

  if (agentPane.branch !== undefined) {
    header.child(branchField(agentPane.branch, tokens));
  }

  return bandRule(header.child(statusMark(agentPane.status, tokens)), tokens);
};

const preview = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .min_w(0)
    .h_full()
    .border_l(1)
    .border_color(tokens.pane.headerDivider)
    .child(previewHeader(tokens))
    .child(
      v_flex()
        .p(tokens.pane.bodyPadding)
        .gap(previewLineGap)
        .font_family(terminalFont)
        .text_size(tokens.text.terminal)
        .text_color(tokens.ink.text)
        .children(agentPane.lines.map((text) => div().truncate().child(text))),
    );

const footer = (tokens: DirectionTokens): Element =>
  footerLine([['tab'], 'Next filter', ['↵'], 'Go to'], tokens)
    .h(footerHeight)
    .px(tokens.rows.paddingX + chipGap)
    .border_t(1)
    .border_color(tokens.pane.headerDivider);

const goto = (tokens: DirectionTokens): Element =>
  v_flex()
    .absolute()
    .left(centered(gotoWidth))
    .top(overlayTop)
    .w(gotoWidth)
    .h(gotoHeight + footerHeight)
    .overflow_hidden()
    .rounded(tokens.pane.radius)
    .bg(overlaySurface)
    .border(1)
    .border_color(overlayBorder)
    .child(h_flex().flex_1().min_h(0).items_start().child(list(tokens)).child(preview(tokens)))
    .child(footer(tokens));

export const gotoScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [goto(tokens)], tokens);
