import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { fixedLabel, label, terminalFont } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { conflictBlock } from './conflict.ts';
import type { DraftFile, DraftState } from './data.ts';
import {
  composingLineNumber,
  editedLineNumber,
  isBodyFile,
  retypedLine,
  selectedRange,
  showsLineComposer,
} from './data.ts';
import { commentCard, commentComposer } from './parts.ts';

interface SourceLook {
  state: DraftState;
  inline: boolean;
}

const sourceSize = { line: 16, hint: 18, mark: 3, markHeight: 14, lineNumber: 18 };

export const textInset = sourceSize.mark + sourceSize.lineNumber + spacing.medium * 2;

const lineMark = (file: DraftFile, number: number, tokens: DirectionTokens): Element => {
  const mark = div().w(sourceSize.mark).h(sourceSize.markHeight).flex_none();

  if (isBodyFile(file) && number === editedLineNumber) {
    return mark.bg(tokens.marks.working);
  }

  const commented = file.comments.some((comment) => {
    if (comment.start === null || comment.end === null) {
      return false;
    }

    return number >= comment.start && number <= comment.end;
  });

  if (commented) {
    return mark.w(2).mr(1).bg(tokens.ink.muted);
  }

  return mark;
};

const lineField = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(sourceSize.line)
    .flex_1()
    .min_w(0)
    .px(spacing.xsmall)
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.focusedBorder)
    .bg(tokens.pane.fill)
    .child(label(`${retypedLine}▏`, tokens.text.body, tokens.ink.text));

const lineState = (file: DraftFile, number: number, state: DraftState) => {
  const body = isBodyFile(file);
  const editingFile = body && state === 'edit-file';
  const edited = body && number === editedLineNumber;
  const editingLine = edited && state === 'edit-line';
  const commentAnchor = body && number === composingLineNumber;
  const selected = commentAnchor && showsLineComposer(state);

  return { editingFile, edited, editingLine, selected };
};

const sourceLine = (
  file: DraftFile,
  index: number,
  state: DraftState,
  tokens: DirectionTokens,
): Element => {
  const number = index + 1;
  const { editingFile, edited, editingLine, selected } = lineState(file, number, state);
  let text = file.lines[index] ?? '';

  if (editingFile && edited) {
    text += '▏';
  }

  const gutter = editingFile
    ? div().w(sourceSize.mark).flex_none()
    : lineMark(file, number, tokens);

  const content = editingLine
    ? lineField(tokens)
    : label(text, tokens.text.body, tokens.ink.text).flex_1();

  const line = h_flex()
    .h(sourceSize.line)
    .flex_none()
    .min_w(0)
    .items_center()
    .gap(spacing.medium)
    .rounded(tokens.rows.radius)
    .font_family(terminalFont)
    .child(gutter)
    .child(
      fixedLabel(String(number), tokens.text.detail, tokens.ink.dim)
        .w(sourceSize.lineNumber)
        .text_right(),
    )
    .child(content);

  if (selected) {
    line.bg(tokens.rows.selectedFill);
  }

  if (edited && !editingFile) {
    const note = state === 'saving-failed' ? 'unsaved' : 'edited';

    line.child(fixedLabel(note, tokens.text.detail, tokens.ink.dim));
  }

  return line;
};

const conflictLine = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .gap(spacing.medium)
    .items_start()
    .child(div().w(sourceSize.mark).h(sourceSize.markHeight).bg(tokens.marks.working))
    .child(
      fixedLabel(String(editedLineNumber), tokens.text.detail, tokens.ink.dim)
        .w(sourceSize.lineNumber)
        .text_right(),
    )
    .child(conflictBlock(tokens).my(spacing.xxsmall));

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
    .flex_none()
    .min_w(0)
    .rounded(tokens.rows.radius)
    .bg(tokens.rows.selectedFill)
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
    .child(fixedLabel('Enter keeps the line · Esc cancels', tokens.text.detail, tokens.ink.dim));

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

  if (edited && look.state === 'edit-line') {
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
