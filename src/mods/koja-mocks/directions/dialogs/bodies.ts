import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { caret, iconMark, item, overlayTokens, searchLine } from '../overlays/parts.ts';
import { changeListOf } from '../panels/changes.ts';
import { fixedLabel, middleCutLabel } from '../parts.ts';
import { divider } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DialogAsk } from './content.ts';
import {
  branchDeletionHint,
  currentBranch,
  lostChanges,
  newBranch,
  newWorktreeFacts,
  renameHint,
  removalClosingLines,
  worktrees,
} from './content.ts';
import { fieldHintGap, renameField, wrappedText } from './parts.ts';

const fieldHeight = 28;
const checkboxSize = 18;
const checkboxGap = 8;
const checkboxLabelInset = checkboxSize + checkboxGap;
const metadataLabelWidth = 40;
const metadataBaseLabel = 'Base';
const metadataFieldGap = 6;
const branchLabelGap = 8;
const metadataGap = 6;
const metadataLineHeight = 18;
const shownColumnWidth = 58;
const ageColumnWidth = 35;

const metadataLine = (label: string, value: string, tokens: DirectionTokens): Element =>
  h_flex()
    .h(metadataLineHeight)
    .gap(metadataGap)
    .items_center()
    .child(fixedLabel(label, tokens.text.detail, tokens.ink.dim).w(metadataLabelWidth))
    .child(middleCutLabel(value, tokens.text.detail, tokens.ink.text).flex_1());

const worktreeMetadata = (tokens: DirectionTokens): Element =>
  v_flex()
    .child(metadataLine(metadataBaseLabel, newWorktreeFacts.from, tokens))
    .child(metadataLine('Folder', newWorktreeFacts.folder, tokens));

const branchInput = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(fieldHeight)
    .flex_none()
    .px(tokens.rows.paddingX)
    .items_center()
    .rounded(tokens.pane.radius)
    .bg(tokens.pane.fill)
    .border(1)
    .border_color(tokens.ink.text)
    .child(fixedLabel(newBranch, tokens.text.body, tokens.ink.text))
    .child(caret(tokens));

const branchField = (tokens: DirectionTokens): Element =>
  v_flex()
    .gap(branchLabelGap)
    .child(fixedLabel('Branch', tokens.text.heading, tokens.ink.muted))
    .child(
      v_flex().gap(metadataFieldGap).child(branchInput(tokens)).child(worktreeMetadata(tokens)),
    );

const deleteBranchRow = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.rows.height)
    .gap(checkboxGap)
    .items_center()
    .child(
      div()
        .size(checkboxSize)
        .flex_none()
        .rounded(tokens.marks.badgeRadius)
        .border(1)
        .border_color(tokens.ink.dim)
        .bg(tokens.pane.fill),
    )
    .child(fixedLabel('Also delete the branch', tokens.text.body, tokens.ink.text));

const deleteBranch = (tokens: DirectionTokens): Element =>
  v_flex()
    .gap(fieldHintGap)
    .child(deleteBranchRow(tokens))
    .child(
      wrappedText(branchDeletionHint, tokens.text.detail, tokens.ink.dim).ml(checkboxLabelInset),
    );

const lostFileRows = (tokens: DirectionTokens): Element => {
  const fileTokens: DirectionTokens = {
    ...tokens,
    rows: { ...tokens.rows, inset: 0, paddingX: 0, listPadding: 0 },
  };

  return changeListOf(lostChanges, fileTokens);
};

const worktreeFacts = (
  worktree: (typeof worktrees)[number],
  tokens: DirectionTokens,
): Element[] => {
  let state = worktree.open ? 'in a space' : '';

  if (worktree.branch === currentBranch) {
    state = 'this space';
  }

  const age = `${worktree.age} ago`;

  return [
    fixedLabel(state, tokens.text.detail, tokens.ink.dim).w(shownColumnWidth),
    fixedLabel(age, tokens.text.detail, tokens.ink.dim).w(ageColumnWidth).text_right(),
  ];
};

const worktreeRows = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height, tokens);
  const selected = worktrees.find((worktree) => !worktree.open);

  return v_flex()
    .child(searchLine('Find a worktree', rows))
    .child(divider(rows))
    .children(
      worktrees.map((worktree) =>
        item(
          {
            start: iconMark('git-branch', tokens.ink.muted),
            text: worktree.branch,
            end: worktreeFacts(worktree, tokens),
            selected: worktree === selected,
          },
          rows,
        ),
      ),
    );
};

const removalClosing = (tokens: DirectionTokens): Element =>
  v_flex().children(
    removalClosingLines.map((line) => wrappedText(line, tokens.text.body, tokens.ink.muted)),
  );

const renameBody = (tokens: DirectionTokens): Element =>
  v_flex()
    .gap(fieldHintGap)
    .child(renameField(tokens))
    .child(wrappedText(renameHint, tokens.text.detail, tokens.ink.dim));

export const askBody = (ask: DialogAsk, tokens: DirectionTokens): Element[] => {
  if (ask === 'rename') {
    return [renameBody(tokens)];
  }

  if (ask === 'wt-new') {
    return [branchField(tokens)];
  }

  if (ask === 'wt-remove') {
    return [lostFileRows(tokens), removalClosing(tokens), deleteBranch(tokens)];
  }

  if (ask === 'wt-open') {
    return [worktreeRows(tokens)];
  }

  return [];
};
