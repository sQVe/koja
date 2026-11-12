import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import type { FakePane } from '../../scenes/shellContent.ts';
import {
  card,
  fixedLabel,
  iconButton,
  label,
  middleCutLabel,
  paneHeaderFrame,
  statusMark,
  styled,
  terminalFont,
} from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { branchField, headerIconColor, paneName, sidePanel, terminalBody } from '../window.ts';

// The keys typed so far in normal mode, as Neovim's showcmd shows them. Empty when none are pending.
export type PaneFocus = { focused: false } | { focused: true; pending: string[] };

// How far a header has narrowed, in the order the steps apply. At `full` the task cuts at its end.
// Then the task drops whole, the folder shortens to its last segment, the branch cuts in its
// middle, and last the folder drops. A scene states the step, because a mock cannot measure.
export type HeaderFit = 'full' | 'taskDropped' | 'folderShort' | 'branchCut' | 'folderDropped';

export interface HeaderLook {
  focus: PaneFocus;
  fit: HeaderFit;
}

const branchGap = 4;
// The cut branch keeps this width, icon included, so the ticket number and the last word stay.
const branchMinimum = 112;
const tagHeight = 18;
const tagPadding = 6;
const tagRadius = 4;
const keycapPadding = 5;
const keycapMinWidth = 18;
const keycapGap = 2;

// In normal mode only the focused pane draws the accent border. Every other card keeps the outline
// it has in insert mode.
const quietOutline = (tokens: DirectionTokens): DirectionTokens => ({
  ...tokens,
  pane: { ...tokens.pane, border: tokens.pane.cardBorder },
});

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

const keycap = (key: string, tokens: DirectionTokens): Element => {
  const { ink, pane, text } = tokens;

  const cap = tagFrame()
    .min_w(keycapMinWidth)
    .px(keycapPadding)
    .bg(pane.fill)
    .border(1)
    .border_color(pane.cardBorder)
    .font_family(terminalFont);

  return styled(cap, text.detail, ink.text).child(key);
};

const focusParts = (focus: PaneFocus, tokens: DirectionTokens): Element[] => {
  if (!focus.focused) {
    return [];
  }

  const parts = [modeTag(tokens)];

  if (focus.pending.length > 0) {
    const keycaps = focus.pending.map((key) => keycap(key, tokens));

    parts.push(h_flex().flex_none().gap(keycapGap).items_center().children(keycaps));
  }

  return parts;
};

const taskParts = (fakePane: FakePane, fit: HeaderFit, tokens: DirectionTokens): Element[] =>
  fit === 'full' ? [label(fakePane.task ?? '', tokens.text.detail, tokens.ink.muted)] : [];

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

const cutsBranch = (fit: HeaderFit): boolean => fit === 'branchCut' || fit === 'folderDropped';

const branchParts = (fakePane: FakePane, fit: HeaderFit, tokens: DirectionTokens): Element[] => {
  if (fakePane.branch === undefined) {
    return [h_flex().flex_1()];
  }

  if (cutsBranch(fit)) {
    return [cutBranch(fakePane.branch, tokens)];
  }

  return [h_flex().flex_1(), branchField(fakePane.branch, tokens)];
};

const lastSegment = (folder: string): string => folder.split('/').at(-1) ?? folder;

const folderParts = (fakePane: FakePane, fit: HeaderFit, tokens: DirectionTokens): Element[] => {
  if (fit === 'folderDropped') {
    return [];
  }

  const keepsWhole = fit === 'full' || fit === 'taskDropped';
  const shown = keepsWhole ? fakePane.folder : lastSegment(fakePane.folder);

  return [fixedLabel(shown, tokens.text.detail, tokens.ink.dim)];
};

const modeHeader = (fakePane: FakePane, look: HeaderLook, tokens: DirectionTokens): Element => {
  const { focus, fit } = look;
  const header = paneHeaderFrame(tokens);
  const fill = focus.focused ? tokens.pane.focusedHeaderFill : null;

  if (fill !== null) {
    header.bg(fill);
  }

  return header
    .children(focusParts(focus, tokens))
    .child(icon('terminal', 'default').text_color(headerIconColor(focus.focused, tokens)))
    .child(paneName(fakePane, focus.focused, tokens))
    .children(taskParts(fakePane, fit, tokens))
    .children(branchParts(fakePane, fit, tokens))
    .children(folderParts(fakePane, fit, tokens))
    .child(statusMark(fakePane.status ?? 'idle', tokens))
    .child(iconButton('ellipsis', tokens, tokens.ink.dim));
};

export const modePane = (fakePane: FakePane, look: HeaderLook, tokens: DirectionTokens): Element =>
  card(look.focus.focused, quietOutline(tokens))
    .child(modeHeader(fakePane, look, tokens))
    .child(terminalBody(fakePane.lines, tokens));

export const changesPanel = (tokens: DirectionTokens): Element => sidePanel(quietOutline(tokens));
