import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { controlSize, radius, rowHeight, spacing } from '../../../../kit/size.ts';
import { fixedLabel, iconButton, label, terminalFont, uiFont } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { conflictBlock } from './conflict.ts';
import type { DraftFile, DraftState } from './data.ts';
import {
  composingLineNumber,
  editedLineNumber,
  isBodyFile,
  openLineEdit,
  selectedRange,
  showsLineComposer,
} from './data.ts';
import { commentMark, gutterMarkWidth } from './marks.ts';
import { commentCard, commentComposer } from './parts.ts';

interface SourceLook {
  state: DraftState;
  inline: boolean;
}

const sourceSize = {
  line: 16,
  field: 26,
  hint: 18,
  mark: gutterMarkWidth,
  markHeight: 14,
  lineNumber: 18,
};

const gutterGap = spacing.large;
const gutterGapCount = 3;
const currentLines = { body: 18, plan: 17, release: 3 };
const editSlotWidth = spacing.xxsmall;
const bandInset = spacing.medium;

export const textInset =
  sourceSize.mark + sourceSize.lineNumber + editSlotWidth + gutterGap * gutterGapCount + bandInset;

const lineMark = (file: DraftFile, number: number, tokens: DirectionTokens): Element => {
  const mark = div().w(sourceSize.mark).h(sourceSize.markHeight).flex_none();

  const comment = file.comments.find((candidate) => {
    if (candidate.start === null || candidate.end === null) {
      return false;
    }

    return number >= candidate.start && number <= candidate.end;
  });

  if (comment === undefined) {
    return mark;
  }

  if (comment.start === comment.end) {
    return commentMark('single', tokens).h(sourceSize.line);
  }

  if (number === comment.start) {
    return commentMark('start', tokens).h(sourceSize.line);
  }

  if (number === comment.end) {
    return commentMark('end', tokens).h(sourceSize.line);
  }

  return commentMark('middle', tokens).h(sourceSize.line);
};

const lineField = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(sourceSize.field)
    .flex_1()
    .min_w(0)
    .ml(-spacing.xsmall - 1)
    .px(spacing.xsmall)
    .items_center()
    .rounded(radius.pill)
    .border(1)
    .border_color(tokens.pane.focusedBorder)
    .bg(tokens.pane.fill)
    .child(
      label(`${openLineEdit.text}▏`, tokens.text.body, tokens.ink.text).font_family(terminalFont),
    );

const lineState = (file: DraftFile, number: number, state: DraftState) => {
  const body = isBodyFile(file);
  const editingFile = body && state === 'edit-file';
  const edited = file.editedLines.includes(number);
  const openLine = body && number === openLineEdit.line;
  const editingLine = openLine && state === 'edit-line';
  const commentAnchor = body && number === composingLineNumber;
  const selected = commentAnchor && showsLineComposer(state);

  const unsaved = state === 'saving-failed';

  return { editingFile, edited, editingLine, selected, unsaved };
};

const currentLine = (file: DraftFile, state: DraftState): number | null => {
  if (state === 'changed-on-disk') {
    return null;
  }

  if (state === 'sent' || state === 'edit-file' || state === 'edit-line') {
    return null;
  }

  if (state === 'plan') {
    return file.name === 'slice-3.md' ? currentLines.plan : null;
  }

  if (state === 'file-comment') {
    return file.name === 'release-notes.md' ? currentLines.release : null;
  }

  if (!isBodyFile(file)) {
    return null;
  }

  if (showsLineComposer(state)) {
    return composingLineNumber;
  }

  return state === 'range' ? selectedRange.end : currentLines.body;
};

const lineActions = (number: number, tokens: DirectionTokens): Element =>
  h_flex()
    .h(sourceSize.line)
    .flex_none()
    .items_center()
    .gap(spacing.xsmall)
    .child(
      iconButton('message-square', tokens, tokens.ink.dim)
        .size(controlSize.smallButton)
        .tooltip(`Comment on line ${number}`),
    )
    .child(
      iconButton('square-pen', tokens, tokens.ink.dim)
        .size(controlSize.smallButton)
        .tooltip(`Edit line ${number}`),
    );

export const sourceText = (text: string, editing: boolean, tokens: DirectionTokens): Element => {
  const content = label(text, tokens.text.body, tokens.ink.text).font_family(terminalFont).flex_1();

  if (!editing && text.startsWith('#')) {
    content.font_semibold();
  }

  return content;
};

const lineContent = (
  text: string,
  look: ReturnType<typeof lineState>,
  tokens: DirectionTokens,
): Element => {
  if (look.editingLine) {
    return lineField(tokens);
  }

  const caret = look.editingFile && look.edited;
  const value = caret ? `${text}▏` : text;

  const content = sourceText(value, look.editingFile, tokens);

  if (!look.edited || look.editingFile) {
    return content;
  }

  const note = look.unsaved ? 'unsaved' : 'edited';
  const ink = look.unsaved ? tokens.marks.working : tokens.ink.dim;

  return h_flex()
    .flex_1()
    .min_w(0)
    .items_center()
    .gap(spacing.small)
    .child(content.flex_none())
    .child(fixedLabel(note, tokens.text.detail, ink).font_family(uiFont));
};

const editMark = (edited: boolean, tokens: DirectionTokens): Element => {
  const mark = div().w(editSlotWidth).h(sourceSize.markHeight).flex_none();

  return edited ? mark.bg(tokens.marks.working) : mark;
};

export const sourceLineNumber = (
  number: string,
  tokens: DirectionTokens,
  current = false,
): Element => {
  const ink = current ? tokens.ink.text : tokens.ink.dim;

  return fixedLabel(number, tokens.text.detail, ink)
    .w(sourceSize.lineNumber)
    .font_family(terminalFont)
    .text_right();
};

const sourceLine = (
  file: DraftFile,
  index: number,
  state: DraftState,
  tokens: DirectionTokens,
): Element => {
  const number = index + 1;
  const look = lineState(file, number, state);
  const { editingFile, editingLine, selected } = look;
  const text = file.lines[index] ?? '';

  const gutter = editingFile
    ? div().w(sourceSize.mark).flex_none()
    : lineMark(file, number, tokens);

  const content = lineContent(text, look, tokens);

  const band = h_flex()
    .h_full()
    .flex_1()
    .min_w(0)
    .pl(bandInset)
    .items_center()
    .gap(gutterGap)
    .rounded(tokens.rows.radius)
    .child(content);

  const current = number === currentLine(file, state);
  const lineNumber = sourceLineNumber(String(number), tokens, current);

  if (current) {
    lineNumber.font_semibold();

    if (state !== 'range') {
      band.bg(tokens.rows.hoverFill);
    }

    band.child(lineActions(number, tokens));
  }

  if (selected) {
    band.bg(tokens.rows.selectedFill);
  }

  return h_flex()
    .h(editingLine ? sourceSize.field : sourceSize.line)
    .flex_none()
    .min_w(0)
    .items_center()
    .gap(gutterGap)
    .child(gutter)
    .child(lineNumber)
    .child(editMark(look.edited && !editingFile, tokens))
    .child(band);
};

const conflictLine = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .gap(gutterGap)
    .items_start()
    .child(
      h_flex()
        .h(rowHeight.small)
        .mt(spacing.medium + spacing.xxsmall + 1)
        .gap(gutterGap)
        .items_center()
        .child(div().w(sourceSize.mark))
        .child(
          fixedLabel(String(editedLineNumber), tokens.text.detail, tokens.ink.dim)
            .w(sourceSize.lineNumber)
            .font_family(terminalFont)
            .text_right(),
        )
        .child(editMark(true, tokens)),
    )
    .child(conflictBlock(tokens).ml(-1).my(spacing.xxsmall));

const inlineComments = (
  file: DraftFile,
  number: number,
  state: DraftState,
  tokens: DirectionTokens,
): Element[] => {
  const unsaved = isBodyFile(file) && state === 'saving-failed';

  const comments = file.comments
    .filter((comment) => comment.end === number)
    .map((comment) => commentCard(comment, unsaved, tokens).ml(textInset).my(spacing.xxsmall));

  const composing = isBodyFile(file) && showsLineComposer(state);

  if (composing && number === composingLineNumber) {
    comments.push(
      commentComposer({ anchor: 'L18', text: 'Name the sandbox command here.' }, tokens)
        .ml(textInset)
        .my(spacing.xxsmall),
    );
  }

  return comments;
};

const rangeSelection = (file: DraftFile, state: DraftState, tokens: DirectionTokens): Element =>
  v_flex()
    .relative()
    .flex_none()
    .min_w(0)
    .child(
      div()
        .absolute()
        .left(textInset - bandInset)
        .right(0)
        .top(0)
        .bottom(0)
        .rounded(tokens.rows.radius)
        .bg(tokens.rows.selectedFill),
    )
    .child(sourceLine(file, selectedRange.start - 1, state, tokens))
    .child(sourceLine(file, selectedRange.end - 1, state, tokens));

const rangeComposer = (tokens: DirectionTokens): Element =>
  commentComposer({ anchor: 'L19–20', text: 'Comment on lines 19–20', placeholder: true }, tokens)
    .ml(textInset)
    .my(spacing.xxsmall);

const lineHint = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(sourceSize.hint)
    .flex_none()
    .ml(textInset)
    .items_center()
    .child(
      fixedLabel(
        'Enter keeps and saves the line · Esc cancels',
        tokens.text.detail,
        tokens.ink.dim,
      ),
    );

const rowParts = (
  file: DraftFile,
  index: number,
  look: SourceLook,
  tokens: DirectionTokens,
): Element[] => {
  const number = index + 1;
  const range = isBodyFile(file) && look.state === 'range';

  if (range && number === selectedRange.end) {
    return [];
  }

  if (range && number === selectedRange.start) {
    return [rangeSelection(file, look.state, tokens), rangeComposer(tokens)];
  }

  const edited = isBodyFile(file) && number === editedLineNumber;
  const conflict = edited && look.state === 'changed-on-disk';
  const row = conflict ? conflictLine(tokens) : sourceLine(file, index, look.state, tokens);
  const parts = [row];

  const { editingLine } = lineState(file, number, look.state);

  if (editingLine) {
    parts.push(lineHint(tokens));
  }

  if (look.inline) {
    parts.push(...inlineComments(file, number, look.state, tokens));
  }

  return parts;
};

export const sourceLines = (file: DraftFile, look: SourceLook, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .children(file.lines.flatMap((_text, index) => rowParts(file, index, look, tokens)));
