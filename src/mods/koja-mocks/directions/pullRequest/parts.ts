import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import {
  checkMark,
  contentSection,
  paragraph,
  readingInset,
  saveRecoveryButton,
  sectionBodyInset,
} from '../content/parts.ts';
import { fixedLabel, label, row, styled, terminalFont } from '../parts.ts';
import { workNeedMark } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullThread } from './data.ts';
import { checkFailure, pullThreads } from './data.ts';

const markSlotWidth = 12;

const markSlot = (mark: Element): Element =>
  h_flex().w(markSlotWidth).flex_none().items_center().justify_center().child(mark);

export const detailText = (text: string, tokens: DirectionTokens): Element =>
  styled(div().min_w(0), tokens.text.detail, tokens.ink.dim).child(text);

const detailBlock = (tokens: DirectionTokens): Element =>
  v_flex().flex_none().min_w(0).ml(sectionBodyInset(tokens)).mr(readingInset);

const logLines = (lines: string[], tokens: DirectionTokens): Element =>
  v_flex()
    .min_w(0)
    .pl(spacing.small)
    .py(spacing.xsmall)
    .border_l(1)
    .border_color(tokens.pane.border)
    .children(lines.map((line) => detailText(line, tokens).font_family(terminalFont)));

const failedCheck = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(
      row(
        {
          selected: false,
          start: markSlot(checkMark('failing', tokens)),
          label: label('typecheck', tokens.text.body, tokens.ink.text),
          end: [
            fixedLabel('failing', tokens.text.detail, tokens.marks.blocked),
            saveRecoveryButton('Send to agent', tokens),
          ],
        },
        tokens,
      ),
    )
    .child(
      detailBlock(tokens)
        .child(logLines([checkFailure.path, checkFailure.message], tokens))
        .child(detailText(checkFailure.age, tokens)),
    );

const threadRow = (thread: PullThread, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.xxsmall)
    .child(
      row(
        {
          selected: false,
          start: markSlot(workNeedMark('review', tokens)),
          label: label(thread.reference, tokens.text.title, tokens.ink.text),
          end: [
            fixedLabel('unresolved', tokens.text.detail, tokens.ink.dim),
            saveRecoveryButton('Send to agent', tokens),
          ],
        },
        tokens,
      ),
    )
    .child(
      detailBlock(tokens)
        .child(detailText(thread.author, tokens))
        .child(paragraph(thread.text, tokens))
        .child(logLines(thread.snippet, tokens)),
    );

export const needsYouSection = (tokens: DirectionTokens): Element =>
  contentSection(
    { name: 'Needs you', count: 3 },
    [
      failedCheck(tokens),
      ...pullThreads.map((thread) => threadRow(thread, tokens)),
      detailBlock(tokens).child(detailText('3 checks passed · 1 thread resolved', tokens)),
    ],
    tokens,
  );

export const threadCard = (thread: PullThread, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .p(spacing.medium)
    .gap(spacing.xsmall)
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(
      h_flex()
        .gap(spacing.small)
        .items_center()
        .child(icon('message-square', 'small').text_color(tokens.marks.working))
        .child(detailText(`${thread.reference} · unresolved`, tokens)),
    )
    .child(paragraph(thread.text, tokens))
    .child(
      h_flex()
        .items_center()
        .gap(spacing.small)
        .child(detailText(thread.author, tokens).flex_1())
        .child(saveRecoveryButton('Send to agent', tokens)),
    );

const mergeReason = (text: string, mark: Element, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_start()
    .child(markSlot(mark).mt(spacing.xxsmall))
    .child(detailText(text, tokens));

export const mergeBlockers = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(mergeReason('1 check failing', checkMark('failing', tokens), tokens))
    .child(mergeReason('2 threads unresolved', workNeedMark('review', tokens), tokens))
    .child(mergeReason('Changes requested by jonas-l', workNeedMark('review', tokens), tokens))
    .child(detailText('Merge waits for these.', tokens));
