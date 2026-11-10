import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { diffSize, rowHeight, spacing } from '../../../../kit/size.ts';
import { fixedLabel, label, row, terminalFont } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { reviewComments, reviewFiles, reviewLines } from './data.ts';
import { paragraph, readingInset } from './parts.ts';
import type { ContentState } from './states.ts';

const fileTabWidth = 104;
const commentedFileTabWidth = 154;
const lineInset = 12;
const lineNumberWidth = 18;
const gutterMarkWidth = 4;
const gutterWidth = gutterMarkWidth + spacing.xsmall + lineNumberWidth;
const commentGap = gutterWidth + lineInset - gutterMarkWidth;
const editedLineNumber = 6;

const fileComments = (index: number, tokens: DirectionTokens): Element[] => {
  if (index !== 0) {
    return [];
  }

  return [
    h_flex()
      .flex_none()
      .gap(spacing.xsmall)
      .items_center()
      .child(icon('message-square', 'small').text_color(tokens.ink.dim))
      .child(fixedLabel(String(reviewComments.length), tokens.text.detail, tokens.ink.dim)),
  ];
};

const fileRow = (file: string, index: number, tokens: DirectionTokens): Element =>
  row(
    {
      selected: index === 0,
      start: icon('file', 'small').text_color(tokens.ink.dim),
      label: label(file, tokens.text.body, tokens.ink.text),
      end: fileComments(index, tokens),
    },
    tokens,
  ).mx(0);

export const reviewFileList = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(spacing.small)
    .children(reviewFiles.map((file, index) => fileRow(file, index, tokens)));

export const reviewFileChoices = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .py(spacing.xsmall)
    .gap(spacing.xsmall)
    .children(
      reviewFiles.map((file, index) => {
        const width = index === 0 ? commentedFileTabWidth : fileTabWidth;

        return fileRow(file, index, tokens).w(width);
      }),
    );

const lineComment = (
  comment: (typeof reviewComments)[number],
  state: ContentState,
  tokens: DirectionTokens,
): Element => {
  const readOnly = state === 'sent';
  const unsaved = state === 'saving-failed';

  const heading = h_flex()
    .gap(spacing.small)
    .items_center()
    .child(icon('message-square', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel('You', tokens.text.heading, tokens.ink.text))
    .child(fixedLabel(comment.range, tokens.text.detail, tokens.ink.dim));

  if (readOnly) {
    heading.child(fixedLabel('Read-only', tokens.text.detail, tokens.ink.dim));
  }

  if (unsaved) {
    heading.child(fixedLabel('Unsaved', tokens.text.detail, tokens.marks.working));
  }

  const card = v_flex()
    .flex_1()
    .min_w(0)
    .px(spacing.large)
    .py(spacing.small)
    .gap(2)
    .rounded(tokens.pane.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(heading)
    .child(paragraph(comment.text, tokens));

  const mark = div().w(gutterMarkWidth).flex_none();

  if (unsaved) {
    mark.bg(tokens.marks.working);
  }

  return h_flex()
    .flex_none()
    .min_w(0)
    .ml(readingInset)
    .mr(readingInset)
    .my(spacing.xsmall)
    .gap(commentGap)
    .items_stretch()
    .child(mark)
    .child(card);
};

const lineGutter = (number: number, unsaved: boolean, tokens: DirectionTokens): Element => {
  const commented = reviewComments.some(
    (comment) => number >= comment.start && number <= comment.end,
  );

  const mark = div().w(gutterMarkWidth).h(lineInset).flex_none();
  const numberInk = commented ? tokens.ink.text : tokens.ink.dim;

  if (commented && !unsaved) {
    mark.child(div().w(2).h_full().bg(tokens.ink.muted));
  }

  if (unsaved) {
    mark.bg(tokens.marks.working);
  }

  return h_flex()
    .w(gutterWidth)
    .flex_none()
    .gap(spacing.xsmall)
    .items_center()
    .child(mark)
    .child(
      fixedLabel(String(number), tokens.text.detail, numberInk).w(lineNumberWidth).text_right(),
    );
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
    .px(readingInset)
    .gap(lineInset)
    .items_center()
    .font_family(terminalFont)
    .child(lineGutter(index + 1, unsaved, tokens))
    .child(label(text, tokens.text.body, tokens.ink.text).flex_1());

  if (unsaved) {
    line.child(fixedLabel('Unsaved', tokens.text.detail, tokens.marks.working));
  }

  return line;
};

const documentHeading = (readOnly: boolean, tokens: DirectionTokens): Element => {
  const heading = h_flex()
    .h(rowHeight.large)
    .px(readingInset)
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
    const currentText = unsaved ? 'Keep the selected space visible when groups fold.' : text;

    lines.push(documentLine(currentText, index, unsaved, tokens));

    const comment = reviewComments.find((candidate) => candidate.end === index + 1);

    if (comment !== undefined) {
      lines.push(lineComment(comment, state, tokens));
    }
  });

  return v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.medium)
    .child(documentHeading(readOnly, tokens))
    .children(lines);
};
