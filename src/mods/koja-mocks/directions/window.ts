import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../kit/index.ts';
import type { FakeChange, FakePane, FakeTab } from '../scenes/shellContent.ts';
import { agentPane, changeRows, fakeTabs, shellPane } from '../scenes/shellContent.ts';
import {
  fixedLabel,
  iconButton,
  iconToggle,
  label,
  middleCutLabel,
  modePill,
  row,
  statusMark,
  styled,
  terminalFont,
  uiFont,
} from './parts.ts';
import { mapSidebar } from './sidebars/sidebar.ts';
import type { DirectionTokens } from './tokens.ts';

export type SidebarDrawing = (tokens: DirectionTokens) => Element;

const tabLabelMaxWidth = 170;
const controlGap = 4;
const tabContentGap = 6;
const terminalLineGap = 2;
const markSlotWidth = 12;

const tabFrame = (active: boolean, tokens: DirectionTokens): Element => {
  const { tabs } = tokens;

  const frame = h_flex()
    .h(tabs.height)
    .px(tabs.paddingX)
    .gap(tabContentGap)
    .flex_none()
    .items_center()
    .rounded(tabs.radius);

  if (active) {
    return frame.bg(tabs.activeFill).border(1).border_color(tabs.activeBorder);
  }

  return frame.hover((hovered) => hovered.text_color(tokens.ink.text));
};

const tabElement = (fakeTab: FakeTab, tokens: DirectionTokens): Element => {
  const { tabs } = tokens;
  const text = fakeTab.active ? tabs.activeText : tabs.text;
  const shown = fakeTab.status === 'idle' ? null : fakeTab.status;

  const element = tabFrame(fakeTab.active, tokens)
    .child(icon('terminal', 'small').text_color(text))
    .child(label(fakeTab.label, tokens.text.body, text).max_w(tabLabelMaxWidth))
    .child(statusMark(shown, tokens));

  return fakeTab.active ? element.child(iconButton('x', tokens, tokens.ink.dim)) : element;
};

const tabControls = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_1()
    .h_full()
    .px(tokens.tabs.barPadding)
    .gap(controlGap)
    .items_center()
    .justify_end()
    .child(iconButton('plus', tokens, tokens.controls.primary))
    .child(modePill(tokens))
    .child(iconToggle('git-compare', true, tokens))
    .child(iconToggle('folder', false, tokens));

const tabBar = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.tabs.barHeight)
    .flex_none()
    .gap(tokens.tabs.gap)
    .items_center()
    .bg(tokens.areas.frame)
    .child(div().w(tokens.tabs.barPadding).h_full().flex_none())
    .children(fakeTabs.map((fakeTab) => tabElement(fakeTab, tokens)))
    .child(tabControls(tokens));

const paneHeaderFrame = (tokens: DirectionTokens): Element => {
  const { pane } = tokens;

  return h_flex()
    .h(pane.headerHeight)
    .flex_none()
    .px(pane.headerPadding)
    .gap(pane.headerGap)
    .items_center()
    .overflow_hidden()
    .border_b(1)
    .border_color(pane.headerDivider);
};

export const branchField = (branch: string, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .gap(controlGap)
    .items_center()
    .text_color(tokens.ink.dim)
    .child(icon('git-branch', 'small'))
    .child(fixedLabel(branch, tokens.text.detail, tokens.ink.dim));

const paneName = (fakePane: FakePane, focused: boolean, tokens: DirectionTokens): Element => {
  const { ink, pane, text } = tokens;

  if (!focused) {
    return fixedLabel(fakePane.name, text.body, ink.muted);
  }

  return fixedLabel(fakePane.name, text.title, pane.focusedHeaderInk ?? ink.text);
};

const headerIconColor = (focused: boolean, tokens: DirectionTokens): Color =>
  focused ? (tokens.pane.focusedHeaderInk ?? tokens.ink.muted) : tokens.ink.dim;

const paneHeader = (fakePane: FakePane, focused: boolean, tokens: DirectionTokens): Element => {
  const { ink, pane, text } = tokens;
  const header = paneHeaderFrame(tokens);
  const fill = focused ? pane.focusedHeaderFill : null;

  if (fill !== null) {
    header.bg(fill);
  }

  header
    .child(icon('terminal', 'default').text_color(headerIconColor(focused, tokens)))
    .child(paneName(fakePane, focused, tokens))
    .child(label(fakePane.task ?? '', text.detail, ink.muted).flex_1());

  if (fakePane.branch !== undefined) {
    header.child(branchField(fakePane.branch, tokens));
  }

  return header
    .child(fixedLabel(fakePane.folder, text.detail, ink.dim))
    .child(statusMark(fakePane.status, tokens))
    .child(iconButton('ellipsis', tokens, ink.dim));
};

const terminalBody = (lines: string[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .p(tokens.pane.bodyPadding)
    .gap(terminalLineGap)
    .font_family(terminalFont)
    .text_size(tokens.text.terminal)
    .text_color(tokens.ink.text)
    .children(lines.map((line) => div().truncate().child(line)));

const card = (focused: boolean, tokens: DirectionTokens): Element => {
  const { pane } = tokens;

  return v_flex()
    .flex_1()
    .min_w(0)
    .min_h(0)
    .rounded(pane.radius)
    .bg(pane.fill)
    .overflow_hidden()
    .border(1)
    .border_color(focused ? pane.focusedBorder : pane.border);
};

const cardSlot = (inner: Element, tokens: DirectionTokens): Element =>
  v_flex().h_full().min_w(0).rounded(tokens.pane.radius).child(inner);

const terminalPane = (fakePane: FakePane, focused: boolean, tokens: DirectionTokens): Element => {
  const inner = card(focused, tokens)
    .child(paneHeader(fakePane, focused, tokens))
    .child(terminalBody(fakePane.lines, tokens));

  const slot = cardSlot(inner, tokens);

  return focused ? slot.flex_1() : slot.w(tokens.areas.shellPaneWidth).flex_none();
};

const changeCounts = (change: FakeChange, tokens: DirectionTokens): Element[] => {
  const { marks, text } = tokens;
  const counts: Element[] = [];

  if (change.add > 0) {
    counts.push(fixedLabel(`+${change.add}`, text.detail, marks.added));
  }

  if (change.del > 0) {
    counts.push(fixedLabel(`−${change.del}`, text.detail, marks.removed));
  }

  return counts;
};

const changeRow = (change: FakeChange, tokens: DirectionTokens): Element => {
  const { marks, text } = tokens;
  const statusColor = change.status === 'M' ? marks.modified : marks.added;

  return row(
    {
      selected: false,
      start: fixedLabel(change.status, text.title, statusColor).w(markSlotWidth),
      label: middleCutLabel(change.path, text.body, tokens.ink.text),
      end: changeCounts(change, tokens),
    },
    tokens,
  );
};

const changeList = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .children(changeRows.map((change) => changeRow(change, tokens)));

const sidePanel = (tokens: DirectionTokens): Element => {
  const { marks, text } = tokens;

  const header = paneHeaderFrame(tokens)
    .child(fixedLabel('Changes', text.title, tokens.ink.text))
    .child(fixedLabel('3 files', text.detail, tokens.ink.dim))
    .child(h_flex().flex_1())
    .child(fixedLabel('+38', text.detail, marks.added))
    .child(fixedLabel('−6', text.detail, marks.removed));

  return cardSlot(card(false, tokens).child(header).child(changeList(tokens)), tokens)
    .w(tokens.areas.panelWidth)
    .flex_none();
};

const content = (tokens: DirectionTokens): Element => {
  const { areas } = tokens;

  return h_flex()
    .flex_1()
    .min_h(0)
    .bg(areas.frame)
    .p(areas.contentPadding)
    .gap(areas.contentGap)
    .child(terminalPane(agentPane, true, tokens))
    .child(terminalPane(shellPane, false, tokens))
    .child(sidePanel(tokens));
};

const mainColumn = (tokens: DirectionTokens): Element =>
  v_flex().flex_1().h_full().min_w(0).min_h(0).child(tabBar(tokens)).child(content(tokens));

export const directionWindow = (
  tokens: DirectionTokens,
  drawSidebar: SidebarDrawing = mapSidebar,
): Element =>
  styled(
    h_flex().flex_1().min_h(0).bg(tokens.areas.frame).font_family(uiFont),
    tokens.text.body,
    tokens.ink.text,
  )
    .child(drawSidebar(tokens))
    .child(mainColumn(tokens));
