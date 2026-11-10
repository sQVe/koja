import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { dialogButton, icon } from '../../../../kit/index.ts';
import { rowHeight, spacing, textSize } from '../../../../kit/size.ts';
import { colors } from '../../../../kit/theme.ts';
import { paragraph } from '../content/parts.ts';
import { fixedLabel, label, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DraftComment, DraftFile, DraftView } from './data.ts';
import { isBodyFile } from './data.ts';

interface ComposerContent {
  anchor: string;
  text: string;
  placeholder?: boolean;
}

export const outlineAction = (text: string, tokens: DirectionTokens): Element =>
  dialogButton({ label: text, kind: 'outline' })
    .h(rowHeight.small)
    .rounded(tokens.controls.radius)
    .border_color(tokens.pane.cardBorder)
    .text_color(tokens.ink.text);

const quietAction = (text: string, tokens: DirectionTokens): Element =>
  outlineAction(text, tokens)
    .border(0)
    .px(spacing.small)
    .text_size(tokens.text.detail.size)
    .text_color(tokens.ink.dim)
    .hover((element) => element.text_color(tokens.ink.text));

export const fileHeading = (file: DraftFile, view: DraftView, tokens: DirectionTokens): Element => {
  const { state } = view;
  const lineCount = file.lines.length === 1 ? '1 line' : `${file.lines.length} lines`;
  const editing = isBodyFile(file) && state === 'edit-file';
  const commentCount = file.comments.length;
  const commentUnit = commentCount === 1 ? 'comment' : 'comments';
  const metadata = commentCount === 0 ? lineCount : `${lineCount} · ${commentCount} ${commentUnit}`;

  const heading = h_flex()
    .h(rowHeight.large)
    .flex_none()
    .min_w(0)
    .gap(spacing.large)
    .items_center()
    .child(icon('file', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel(file.name, tokens.text.title, tokens.ink.text))
    .child(fixedLabel(metadata, tokens.text.detail, tokens.ink.dim));

  if (editing) {
    heading.child(fixedLabel('· Editing', tokens.text.detail, tokens.ink.text));
  }

  heading.child(div().flex_1());

  if (state === 'sent') {
    return heading.child(fixedLabel('Read-only', tokens.text.detail, tokens.ink.dim));
  }

  if (editing) {
    return heading.child(outlineAction('Done editing', tokens));
  }

  return heading
    .child(quietAction('Comment on file', tokens))
    .child(quietAction('Edit file', tokens));
};

const fileMarkWidth = { edit: 12, comments: 32 };

const fileMarks = (file: DraftFile, tokens: DirectionTokens): Element[] => {
  const edited = h_flex().w(fileMarkWidth.edit).flex_none().items_center();

  const comments = h_flex()
    .w(fileMarkWidth.comments)
    .flex_none()
    .items_center()
    .justify_end()
    .gap(spacing.small);

  if (file.editedLines.length > 0) {
    edited.child(fixedLabel('M', tokens.text.detail, tokens.marks.modified));
  }

  if (file.comments.length > 0) {
    comments
      .child(icon('message-square', 'small').text_color(tokens.ink.dim))
      .child(fixedLabel(String(file.comments.length), tokens.text.detail, tokens.ink.dim));
  }

  return [edited, comments];
};

const fileChoice = (file: DraftFile, selected: boolean, tokens: DirectionTokens): Element =>
  row(
    {
      selected,
      start: icon('file', 'small').text_color(tokens.ink.dim),
      label: label(file.name, tokens.text.body, tokens.ink.text),
      end: fileMarks(file, tokens),
    },
    tokens,
  ).mx(0);

export const fileNavigation = (view: DraftView, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .gap(2)
    .children(view.files.map((file) => fileChoice(file, file.name === view.selected.name, tokens)));

const commentFrame = (
  anchor: string,
  unsaved: boolean,
  tokens: DirectionTokens,
  actions?: Element,
): Element => {
  const header = h_flex()
    .items_center()
    .gap(spacing.medium)
    .child(icon('message-square', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel('You', tokens.text.heading, tokens.ink.text))
    .child(fixedLabel(anchor, tokens.text.detail, tokens.ink.dim));

  if (unsaved) {
    header.child(fixedLabel('unsaved', tokens.text.detail, tokens.marks.working));
  }

  if (actions !== undefined) {
    header
      .child(fixedLabel('· draft', tokens.text.detail, tokens.ink.dim))
      .child(div().flex_1())
      .child(actions);
  }

  const frame = v_flex()
    .flex_none()
    .min_w(0)
    .px(spacing.large)
    .py(spacing.xsmall)
    .gap(2)
    .rounded(tokens.pane.radius)
    .child(header);

  if (actions === undefined) {
    frame.border(1).border_color(tokens.pane.cardBorder);
  }

  return frame;
};

export const commentCard = (
  comment: DraftComment,
  unsaved: boolean,
  tokens: DirectionTokens,
): Element => commentFrame(comment.anchor, unsaved, tokens).child(paragraph(comment.text, tokens));

const composerField = (content: ComposerContent, tokens: DirectionTokens): Element => {
  if (content.placeholder === true) {
    return h_flex()
      .min_w(0)
      .gap(spacing.xxsmall)
      .items_center()
      .child(div().w(1).h(textSize.large).bg(tokens.ink.text))
      .child(label(content.text, tokens.text.body, tokens.ink.dim));
  }

  return paragraph(`${content.text}▏`, tokens);
};

const composerInput = (content: ComposerContent, tokens: DirectionTokens): Element =>
  div()
    .min_w(0)
    .px(spacing.medium)
    .py(spacing.xsmall)
    .rounded(tokens.pane.radius)
    .border(spacing.hairline)
    .border_color(colors().border)
    .child(composerField(content, tokens));

const cancelComment = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(rowHeight.small)
    .px(spacing.small)
    .items_center()
    .child(fixedLabel('Cancel', tokens.text.detail, tokens.ink.dim));

export const commentComposer = (content: ComposerContent, tokens: DirectionTokens): Element =>
  commentFrame(
    content.anchor,
    false,
    tokens,
    h_flex()
      .gap(spacing.small)
      .child(cancelComment(tokens))
      .child(outlineAction('Comment', tokens)),
  ).child(composerInput(content, tokens));
