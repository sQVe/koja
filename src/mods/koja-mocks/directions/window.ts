import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../kit/index.ts';
import type { FakePane, FakeTab } from '../scenes/shellContent.ts';
import { agentPane, fakeTabs, shellPane } from '../scenes/shellContent.ts';
import { changeList, changeTotals } from './panels/changes.ts';
import {
  card,
  cardSlot,
  fixedLabel,
  iconButton,
  iconToggle,
  label,
  modePill,
  paneHeaderFrame,
  statusMark,
  styled,
  terminalFont,
  uiFont,
} from './parts.ts';
import { mapSidebar } from './sidebars/sidebar.ts';
import type { DirectionTokens } from './tokens.ts';

export type SidebarDrawing = (tokens: DirectionTokens) => Element;

export interface PanelArrangement {
  toggles: (tokens: DirectionTokens) => Element[];
  panes: (tokens: DirectionTokens) => Element[];
  agent?: FakePane;
}

const tabLabelMaxWidth = 170;
const controlGap = 4;
const tabContentGap = 6;
const terminalLineGap = 2;

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

const tabControls = (toggles: Element[], tokens: DirectionTokens): Element =>
  h_flex()
    .flex_1()
    .h_full()
    .px(tokens.tabs.barPadding)
    .gap(controlGap)
    .items_center()
    .justify_end()
    .child(iconButton('plus', tokens, tokens.controls.primary))
    .child(modePill(tokens))
    .children(toggles);

const tabBar = (toggles: Element[], tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.tabs.barHeight)
    .flex_none()
    .gap(tokens.tabs.gap)
    .items_center()
    .bg(tokens.areas.frame)
    .child(div().w(tokens.tabs.barPadding).h_full().flex_none())
    .children(fakeTabs.map((fakeTab) => tabElement(fakeTab, tokens)))
    .child(tabControls(toggles, tokens));

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

const terminalPane = (fakePane: FakePane, focused: boolean, tokens: DirectionTokens): Element => {
  const inner = card(focused, tokens)
    .child(paneHeader(fakePane, focused, tokens))
    .child(terminalBody(fakePane.lines, tokens));

  const slot = cardSlot(inner, tokens);

  return focused ? slot.flex_1() : slot.w(tokens.areas.shellPaneWidth).flex_none();
};

const sidePanel = (tokens: DirectionTokens): Element => {
  const header = paneHeaderFrame(tokens)
    .child(fixedLabel('Changes', tokens.text.title, tokens.ink.text))
    .child(fixedLabel('3 files', tokens.text.detail, tokens.ink.dim))
    .child(h_flex().flex_1())
    .children(changeTotals(tokens));

  return cardSlot(card(false, tokens).child(header).child(changeList(tokens)), tokens)
    .w(tokens.areas.panelWidth)
    .flex_none();
};

const shellArrangement: PanelArrangement = {
  toggles: (tokens) => [
    iconToggle('git-compare', true, tokens),
    iconToggle('folder', false, tokens),
  ],
  panes: (tokens) => [terminalPane(shellPane, false, tokens), sidePanel(tokens)],
};

const content = (arrangement: PanelArrangement, tokens: DirectionTokens): Element => {
  const { areas } = tokens;

  return h_flex()
    .flex_1()
    .min_h(0)
    .bg(areas.frame)
    .p(areas.contentPadding)
    .gap(areas.contentGap)
    .child(terminalPane(arrangement.agent ?? agentPane, true, tokens))
    .children(arrangement.panes(tokens));
};

const mainColumn = (arrangement: PanelArrangement, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .h_full()
    .min_w(0)
    .min_h(0)
    .child(tabBar(arrangement.toggles(tokens), tokens))
    .child(content(arrangement, tokens));

export const directionWindow = (
  tokens: DirectionTokens,
  drawSidebar: SidebarDrawing = mapSidebar,
  arrangement: PanelArrangement = shellArrangement,
): Element =>
  styled(
    h_flex().flex_1().min_h(0).bg(tokens.areas.frame).font_family(uiFont),
    tokens.text.body,
    tokens.ink.text,
  )
    .child(drawSidebar(tokens))
    .child(mainColumn(arrangement, tokens));
