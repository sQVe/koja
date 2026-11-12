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

// How far a footer has narrowed. The folder drops whole before the branch gives up any width, and
// the task cuts only after the branch. A scene states the step, because a mock cannot measure.
export type FooterFit = 'full' | 'folderDropped' | 'branchCut';

export interface FooterLook {
  focus: PaneFocus;
  fit: FooterFit;
}

const branchGap = 4;
// The cut branch keeps this width, icon included, before the task gives up any width.
const branchMinimum = 94;
const tagHeight = 18;
const tagPadding = 6;
const tagRadius = 4;
const keysPadding = 5;
const keysMinWidth = 18;

const footerFrame = (tokens: DirectionTokens): Element => {
  const { pane } = tokens;

  return h_flex()
    .h(pane.headerHeight)
    .flex_none()
    .px(pane.headerPadding)
    .gap(pane.headerGap)
    .items_center()
    .overflow_hidden()
    .border_t(1)
    .border_color(pane.headerDivider);
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

const branchParts = (fakePane: FakePane, fit: FooterFit, tokens: DirectionTokens): Element[] => {
  if (fakePane.branch === undefined) {
    return [h_flex().flex_1()];
  }

  if (fit === 'branchCut') {
    return [cutBranch(fakePane.branch, tokens)];
  }

  return [h_flex().flex_1(), branchField(fakePane.branch, tokens)];
};

const folderParts = (fakePane: FakePane, fit: FooterFit, tokens: DirectionTokens): Element[] =>
  fit === 'full' ? [fixedLabel(fakePane.folder, tokens.text.detail, tokens.ink.dim)] : [];

const paneFooter = (fakePane: FakePane, look: FooterLook, tokens: DirectionTokens): Element => {
  const { ink, pane, text } = tokens;
  const { focus, fit } = look;
  const footer = footerFrame(tokens);
  const fill = focus.focused ? pane.focusedHeaderFill : null;

  if (fill !== null) {
    footer.bg(fill);
  }

  return footer
    .children(focusParts(focus, tokens))
    .child(icon('terminal', 'default').text_color(headerIconColor(focus.focused, tokens)))
    .child(paneName(fakePane, focus.focused, tokens))
    .child(label(fakePane.task ?? '', text.detail, ink.muted))
    .children(branchParts(fakePane, fit, tokens))
    .children(folderParts(fakePane, fit, tokens))
    .child(statusMark(fakePane.status, tokens))
    .child(iconButton('ellipsis', tokens, ink.dim));
};

export const footerPane = (
  fakePane: FakePane,
  look: FooterLook,
  tokens: DirectionTokens,
): Element =>
  card(look.focus.focused, tokens)
    .child(terminalBody(fakePane.lines, tokens))
    .child(paneFooter(fakePane, look, tokens));

export const footerSidePanel = (tokens: DirectionTokens): Element => {
  const title = footerFrame(tokens)
    .child(fixedLabel('Changes', tokens.text.title, tokens.ink.text))
    .child(fixedLabel('3 files', tokens.text.detail, tokens.ink.dim))
    .child(h_flex().flex_1())
    .children(changeTotals(tokens));

  const list = v_flex().flex_1().min_h(0).child(changeList(tokens));

  return cardSlot(card(false, tokens).child(list).child(title), tokens)
    .w(tokens.areas.panelWidth)
    .flex_none();
};
