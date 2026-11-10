import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { dialogButton, icon } from '../../../../kit/index.ts';
import { rowHeight, spacing, textSize } from '../../../../kit/size.ts';
import { paragraph } from '../content/parts.ts';
import { fixedLabel, label, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DraftComment, DraftFile, DraftState, DraftView } from './data.ts';
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
  h_flex()
    .h(rowHeight.small)
    .px(spacing.small)
    .items_center()
    .rounded(tokens.controls.radius)
    .child(fixedLabel(text, tokens.text.detail, tokens.ink.muted));

export const fileHeading = (
  file: DraftFile,
  state: DraftState,
  tokens: DirectionTokens,
): Element => {
  const lineCount = file.lines.length === 1 ? '1 line' : `${file.lines.length} lines`;
  const editing = isBodyFile(file) && state === 'edit-file';

  const heading = h_flex()
    .h(rowHeight.large)
    .flex_none()
    .min_w(0)
    .gap(spacing.large)
    .items_center()
    .child(icon('file', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel(file.name, tokens.text.title, tokens.ink.text))
    .child(fixedLabel(lineCount, tokens.text.detail, tokens.ink.dim))
    .child(div().flex_1())
    .child(icon('message-square', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel(String(file.comments.length), tokens.text.detail, tokens.ink.dim));

  if (state === 'sent') {
    return heading.child(fixedLabel('Read-only', tokens.text.detail, tokens.ink.dim));
  }

  if (editing) {
    return heading
      .child(quietAction('Comment', tokens))
      .child(fixedLabel('Editing', tokens.text.detail, tokens.ink.dim))
      .child(outlineAction('Done editing', tokens));
  }

  return heading.child(quietAction('Comment', tokens)).child(quietAction('Edit file', tokens));
};

const fileChoice = (file: DraftFile, selected: boolean, tokens: DirectionTokens): Element =>
  row(
    {
      selected,
      start: icon('file', 'small').text_color(tokens.ink.dim),
      label: label(file.name, tokens.text.body, tokens.ink.text),
      end: [
        icon('message-square', 'small').text_color(tokens.ink.dim),
        fixedLabel(String(file.comments.length), tokens.text.detail, tokens.ink.dim),
      ],
    },
    tokens,
  ).mx(0);

export const fileNavigation = (view: DraftView, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .gap(2)
    .children(view.files.map((file) => fileChoice(file, file.name === view.selected.name, tokens)));

const commentFrame = (anchor: string, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .px(spacing.large)
    .py(spacing.xsmall)
    .gap(2)
    .rounded(tokens.pane.radius)
    .border(1)
    .border_color(tokens.pane.cardBorder)
    .child(
      h_flex()
        .items_center()
        .gap(spacing.medium)
        .child(icon('message-square', 'small').text_color(tokens.ink.dim))
        .child(fixedLabel('You', tokens.text.heading, tokens.ink.text))
        .child(fixedLabel(anchor, tokens.text.detail, tokens.ink.dim)),
    );

export const commentCard = (
  comment: DraftComment,
  unsaved: boolean,
  tokens: DirectionTokens,
): Element => {
  const card = commentFrame(comment.anchor, tokens).child(paragraph(comment.text, tokens));

  if (unsaved) {
    card
      .relative()
      .child(
        div()
          .absolute()
          .left(0)
          .top(spacing.xsmall)
          .bottom(spacing.xsmall)
          .w(2)
          .bg(tokens.marks.working),
      );
  }

  return card;
};

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

export const commentComposer = (content: ComposerContent, tokens: DirectionTokens): Element =>
  commentFrame(content.anchor, tokens)
    .border_color(tokens.pane.focusedBorder)
    .child(composerField(content, tokens))
    .child(
      h_flex()
        .gap(spacing.small)
        .justify_end()
        .child(outlineAction('Cancel', tokens))
        .child(outlineAction('Comment', tokens)),
    );
