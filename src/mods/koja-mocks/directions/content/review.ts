import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { diffSize, rowHeight, spacing } from '../../../../kit/size.ts';
import { fixedLabel, label, row, terminalFont } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { reviewComments, reviewFiles, reviewLines } from './data.ts';
import { paragraph } from './parts.ts';
import type { ContentState } from './states.ts';

const fileTabWidth = 128;
const commentInset = 42;
const lineInset = 12;
const lineNumberWidth = 18;
const editedLineNumber = 6;

export const reviewFileList = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(spacing.small)
    .children(
      reviewFiles.map((file, index) =>
        row(
          {
            selected: index === 0,
            start: icon('file', 'small').text_color(tokens.ink.dim),
            label: label(file, tokens.text.body, tokens.ink.text),
            end: [],
          },
          tokens,
        ),
      ),
    );

export const reviewFileChoices = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .px(spacing.medium)
    .py(spacing.xsmall)
    .children(
      reviewFiles.map((file, index) =>
        row(
          {
            selected: index === 0,
            start: icon('file', 'small').text_color(tokens.ink.dim),
            label: label(file, tokens.text.body, tokens.ink.text),
            end: [],
          },
          tokens,
        ).w(fileTabWidth),
      ),
    );

const lineComment = (
  comment: (typeof reviewComments)[number],
  readOnly: boolean,
  tokens: DirectionTokens,
): Element => {
  const heading = h_flex()
    .gap(spacing.small)
    .items_center()
    .child(icon('message-square', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel('You', tokens.text.heading, tokens.ink.text))
    .child(fixedLabel(comment.range, tokens.text.detail, tokens.ink.dim));

  if (readOnly) {
    heading.child(fixedLabel('Read-only', tokens.text.detail, tokens.ink.dim));
  }

  return v_flex()
    .flex_none()
    .min_w(0)
    .ml(commentInset)
    .mr(lineInset)
    .my(spacing.xsmall)
    .px(spacing.large)
    .py(spacing.small)
    .gap(2)
    .rounded(tokens.pane.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(heading)
    .child(paragraph(comment.text, tokens));
};

const documentLine = (
  text: string,
  index: number,
  unsaved: boolean,
  tokens: DirectionTokens,
): Element => {
  const line = h_flex()
    .h(diffSize.rowHeight)
    .flex_none()
    .min_w(0)
    .px(lineInset)
    .gap(lineInset)
    .items_center()
    .font_family(terminalFont)
    .child(fixedLabel(String(index + 1), tokens.text.detail, tokens.ink.dim).w(lineNumberWidth))
    .child(label(text, tokens.text.body, tokens.ink.text).flex_1());

  if (unsaved) {
    line
      .border_l(2)
      .border_color(tokens.marks.working)
      .child(fixedLabel('Unsaved', tokens.text.detail, tokens.marks.working));
  }

  return line;
};

const documentHeading = (readOnly: boolean, tokens: DirectionTokens): Element => {
  const heading = h_flex()
    .h(rowHeight.large)
    .px(lineInset)
    .gap(spacing.medium)
    .flex_none()
    .items_center()
    .child(fixedLabel('design.md', tokens.text.heading, tokens.ink.text))
    .child(fixedLabel('20 lines', tokens.text.detail, tokens.ink.dim));

  if (readOnly) {
    heading.child(fixedLabel('Read-only', tokens.text.detail, tokens.ink.dim));
  }

  return heading;
};

export const reviewText = (state: ContentState, tokens: DirectionTokens): Element => {
  const lines: Element[] = [];
  const readOnly = state === 'sent';

  reviewLines.forEach((text, index) => {
    const unsaved = state === 'saving-failed' && index + 1 === editedLineNumber;
    const currentText = unsaved ? 'The item keeps your edits until you send it.' : text;

    lines.push(documentLine(currentText, index, unsaved, tokens));

    const comment = reviewComments.find((candidate) => candidate.end === index + 1);

    if (comment !== undefined) {
      lines.push(lineComment(comment, readOnly, tokens));
    }
  });

  return v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.medium)
    .child(documentHeading(readOnly, tokens))
    .children(lines);
};
