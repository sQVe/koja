import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import type { FakeChange } from '../../scenes/shellContent.ts';
import { contentSectionHeader, readingInset } from '../content/parts.ts';
import { sourceLineNumber, sourceText } from '../draftReview/source.ts';
import { diffCounts, fileStatusInk } from '../panels/changes.ts';
import { fixedLabel, label, middleCutLabel, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DiffLine, PullDiff, PullState } from './data.ts';
import { filesFor, pullDiffs, pullThreads } from './data.ts';
import { threadCard } from './parts.ts';

const lineHeight = 16;
const codeInset = 70;
const markSlotWidth = 12;

const diffLine = (line: DiffLine, tokens: DirectionTokens): Element => {
  const ink = line.kind === 'context' ? tokens.ink.text : tokens.marks[line.kind];
  const sign = { context: ' ', added: '+', removed: '−' }[line.kind];
  const old = line.old === null ? '' : String(line.old);
  const current = line.current === null ? '' : String(line.current);

  return h_flex()
    .h(lineHeight)
    .min_w(0)
    .flex_none()
    .items_center()
    .gap(spacing.small)
    .child(sourceLineNumber(old, tokens))
    .child(sourceLineNumber(current, tokens))
    .child(fixedLabel(sign, tokens.text.detail, ink).w(spacing.small))
    .child(sourceText(line.text, true, tokens).text_color(ink));
};

const diffLineParts = (line: DiffLine, tokens: DirectionTokens): Element[] => {
  const parts = [diffLine(line, tokens)];

  if (line.thread !== undefined) {
    parts.push(threadCard(line.thread, tokens).ml(codeInset).my(spacing.small));
  }

  return parts;
};

export const fileDiff = (file: PullDiff, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(
      contentSectionHeader(
        { name: file.path },
        true,
        diffCounts(file.added, file.removed, tokens),
        tokens,
      ),
    )
    .children(
      file.hunks.map((hunk) =>
        v_flex()
          .flex_none()
          .min_w(0)
          .mx(readingInset)
          .pb(spacing.small)
          .child(
            label(hunk.range, tokens.text.detail, tokens.ink.dim).py(spacing.small).ml(codeInset),
          )
          .children(hunk.lines.flatMap((line) => diffLineParts(line, tokens))),
      ),
    );

const fileRow = (
  file: FakeChange,
  selected: boolean,
  tokens: DirectionTokens,
  compact = false,
): Element => {
  const end = diffCounts(file.add, file.del, tokens);
  const name = compact ? (file.path.split('/').at(-1) ?? file.path) : file.path;

  if (pullThreads.some((thread) => thread.path === file.path)) {
    end.push(icon('message-square', 'xsmall').text_color(tokens.marks.working));
  }

  return row(
    {
      selected,
      start: fixedLabel(file.status, tokens.text.detail, fileStatusInk(file.status, tokens)).w(
        markSlotWidth,
      ),
      label: middleCutLabel(name, tokens.text.body, tokens.ink.text).tooltip(file.path),
      end,
    },
    tokens,
  );
};

export const filesList = (state: PullState, selected: boolean, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .children(
      filesFor(state).map((file) => {
        const current = selected && file.path === pullDiffs[0].path;

        return fileRow(file, current, tokens, selected);
      }),
    );
