import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import type { FakePane } from '../../scenes/shellContent.ts';
import { changeList, changeTotals } from '../panels/changes.ts';
import {
  card,
  cardSlot,
  fixedLabel,
  iconButton,
  label,
  middleCutLabel,
  statusMark,
  styled,
  terminalFont,
} from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { branchField, headerIconColor, paneName, terminalBody } from '../window.ts';

// The keys typed so far in normal mode, as Neovim's showcmd shows them. Empty when none are pending.
export type PaneFocus = { focused: false } | { focused: true; pending: string };

// Where a pane draws its chrome row: above the terminal body or below it.
export type RowPosition = 'top' | 'bottom';

// How far a row has narrowed. At `full` the task cuts at its end. Once less than about a word of
// it would stay, the task drops whole and the branch cuts in its middle. The folder drops last. A
// scene states the step, because a mock cannot measure.
export type RowFit = 'full' | 'taskDropped' | 'folderDropped';

export interface RowLook {
  focus: PaneFocus;
  fit: RowFit;
  position: RowPosition;
}

const branchGap = 4;
// The cut branch keeps this width, icon included, so the ticket number and the last word stay.
const branchMinimum = 112;
const tagHeight = 18;
const tagPadding = 6;
const tagRadius = 4;
const keysPadding = 5;
const keysMinWidth = 18;

const rowFrame = (position: RowPosition, tokens: DirectionTokens): Element => {
  const { pane } = tokens;

  const frame = h_flex()
    .h(pane.headerHeight)
    .flex_none()
    .px(pane.headerPadding)
    .gap(pane.headerGap)
    .items_center()
    .overflow_hidden();

  const divided = position === 'top' ? frame.border_b(1) : frame.border_t(1);

  return divided.border_color(pane.headerDivider);
};

const tagFrame = (): Element =>
  h_flex().h(tagHeight).flex_none().items_center().justify_center().rounded(tagRadius);

// A flat tag without a border, so the mode does not read as a button.
const modeTag = (tokens: DirectionTokens): Element => {
  const { controls, rows, ink, text } = tokens;
  const tag = tagFrame().px(tagPadding);

  if (tokens.normal) {
    return styled(
      tag.bg(controls.modePill.fill ?? rows.selectedFill),
      text.heading,
      controls.modePill.text,
    ).child('Normal');
  }

  return styled(tag.bg(rows.hoverFill), text.heading, ink.text).child('Insert');
};

const pendingKeys = (pending: string, tokens: DirectionTokens): Element => {
  const { ink, pane, text } = tokens;

  const cap = tagFrame()
    .min_w(keysMinWidth)
    .px(keysPadding)
    .bg(pane.fill)
    .border(1)
    .border_color(pane.cardBorder)
    .font_family(terminalFont);

  return styled(cap, text.detail, ink.text).child(pending);
};

const cutBranch = (branch: string, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_1()
    .min_w(branchMinimum)
    .gap(branchGap)
    .items_center()
    .justify_end()
    .text_color(tokens.ink.dim)
    .child(icon('git-branch', 'small').flex_none())
    .child(middleCutLabel(branch, tokens.text.detail, tokens.ink.dim));

const focusParts = (focus: PaneFocus, tokens: DirectionTokens): Element[] => {
  if (!focus.focused) {
    return [];
  }

  const parts = [modeTag(tokens)];

  if (focus.pending !== '') {
    parts.push(pendingKeys(focus.pending, tokens));
  }

  return parts;
};

const taskParts = (fakePane: FakePane, fit: RowFit, tokens: DirectionTokens): Element[] =>
  fit === 'full' ? [label(fakePane.task ?? '', tokens.text.detail, tokens.ink.muted)] : [];

const branchParts = (fakePane: FakePane, fit: RowFit, tokens: DirectionTokens): Element[] => {
  if (fakePane.branch === undefined) {
    return [h_flex().flex_1()];
  }

  if (fit === 'full') {
    return [h_flex().flex_1(), branchField(fakePane.branch, tokens)];
  }

  return [cutBranch(fakePane.branch, tokens)];
};

const folderParts = (fakePane: FakePane, fit: RowFit, tokens: DirectionTokens): Element[] =>
  fit === 'folderDropped' ? [] : [fixedLabel(fakePane.folder, tokens.text.detail, tokens.ink.dim)];

const chromeRow = (fakePane: FakePane, look: RowLook, tokens: DirectionTokens): Element => {
  const { focus, fit } = look;
  const chrome = rowFrame(look.position, tokens);
  const fill = focus.focused ? tokens.pane.focusedHeaderFill : null;

  if (fill !== null) {
    chrome.bg(fill);
  }

  return chrome
    .children(focusParts(focus, tokens))
    .child(icon('terminal', 'default').text_color(headerIconColor(focus.focused, tokens)))
    .child(paneName(fakePane, focus.focused, tokens))
    .children(taskParts(fakePane, fit, tokens))
    .children(branchParts(fakePane, fit, tokens))
    .children(folderParts(fakePane, fit, tokens))
    .child(statusMark(fakePane.status, tokens))
    .child(iconButton('ellipsis', tokens, tokens.ink.dim));
};

const stacked = (position: RowPosition, chrome: Element, body: Element): Element[] =>
  position === 'top' ? [chrome, body] : [body, chrome];

export const chromePane = (fakePane: FakePane, look: RowLook, tokens: DirectionTokens): Element =>
  card(look.focus.focused, tokens).children(
    stacked(look.position, chromeRow(fakePane, look, tokens), terminalBody(fakePane.lines, tokens)),
  );

export const changesPanel = (position: RowPosition, tokens: DirectionTokens): Element => {
  const title = rowFrame(position, tokens)
    .child(fixedLabel('Changes', tokens.text.title, tokens.ink.text))
    .child(fixedLabel('3 files', tokens.text.detail, tokens.ink.dim))
    .child(h_flex().flex_1())
    .children(changeTotals(tokens));

  const list = v_flex().flex_1().min_h(0).child(changeList(tokens));

  return cardSlot(card(false, tokens).children(stacked(position, title, list)), tokens)
    .w(tokens.areas.panelWidth)
    .flex_none();
};
