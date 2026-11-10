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
  reviewActionButton,
  saveRecoveryButton,
  sectionBodyInset,
} from '../content/parts.ts';
import { fixedLabel, label, row, styled, terminalFont } from '../parts.ts';
import { workNeedMark } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullState, PullThread, PullVariant } from './data.ts';
import { checkFailure, pullChecks, pullThreads } from './data.ts';

const markSlotWidth = 12;

const markSlot = (mark: Element): Element =>
  h_flex().w(markSlotWidth).flex_none().items_center().justify_center().child(mark);

const detailText = (text: string, tokens: DirectionTokens): Element =>
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

const checkRow = (
  name: string,
  failing: boolean,
  tokens: DirectionTokens,
  handoff = false,
): Element => {
  const state = failing ? 'failing' : 'passed';
  const ink = failing ? tokens.marks.blocked : tokens.ink.dim;
  const end = [fixedLabel(state, tokens.text.detail, ink)];

  if (handoff) {
    end.push(saveRecoveryButton('Send to agent', tokens));
  }

  return row(
    {
      selected: false,
      start: markSlot(checkMark(state, tokens)),
      label: label(name, tokens.text.body, tokens.ink.text),
      end,
    },
    tokens,
  );
};

const failedCheck = (handoff: boolean, tokens: DirectionTokens): Element => {
  const detail = detailBlock(tokens)
    .child(logLines([checkFailure.path, checkFailure.message], tokens))
    .child(detailText(checkFailure.age, tokens));

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(checkRow('typecheck', true, tokens, handoff))
    .child(detail);
};

export const checksSection = (state: PullState, tokens: DirectionTokens): Element => {
  const checks = pullChecks.map((check, index) => {
    if (state !== 'ready' && index === 0) {
      return failedCheck(false, tokens);
    }

    const checkBody = v_flex()
      .flex_none()
      .child(checkRow(check.name, false, tokens));

    const showDetail = state === 'ready' || check.name === 'tests';

    if (showDetail) {
      checkBody.child(detailBlock(tokens).child(detailText(check.detail, tokens)));
    }

    return checkBody;
  });

  return contentSection({ name: 'Checks', count: 4 }, checks, tokens);
};

const threadRow = (thread: PullThread, handoff: boolean, tokens: DirectionTokens): Element => {
  const detail = detailBlock(tokens)
    .child(detailText(thread.author, tokens))
    .child(paragraph(thread.text, tokens));

  const end = [fixedLabel('unresolved', tokens.text.detail, tokens.ink.dim)];

  if (handoff) {
    detail.child(logLines(thread.snippet, tokens));
    end.push(saveRecoveryButton('Send to agent', tokens));
  }

  return v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.xxsmall)
    .child(
      row(
        {
          selected: false,
          start: markSlot(workNeedMark('review', tokens)),
          label: label(thread.reference, tokens.text.title, tokens.ink.text),
          end,
        },
        tokens,
      ),
    )
    .child(detail);
};

export const threadsSection = (state: PullState, tokens: DirectionTokens): Element => {
  const parts: Element[] = [];

  if (state !== 'ready') {
    parts.push(...pullThreads.map((thread) => threadRow(thread, false, tokens)));
  }

  const summary = state === 'ready' ? '0 unresolved · 2 resolved' : '1 resolved';

  parts.push(detailBlock(tokens).child(detailText(summary, tokens)));
  const count = state === 'ready' ? 0 : 2;

  return contentSection({ name: 'Threads', count }, parts, tokens);
};

export const needsYouSection = (tokens: DirectionTokens): Element =>
  contentSection(
    { name: 'Needs you', count: 3 },
    [
      failedCheck(true, tokens),
      ...pullThreads.map((thread) => threadRow(thread, true, tokens)),
      detailBlock(tokens).child(detailText('3 checks passed · 1 thread resolved', tokens)),
    ],
    tokens,
  );

export const threadCard = (thread: PullThread, tokens: DirectionTokens): Element => {
  return v_flex()
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
    .child(detailText(thread.author, tokens));
};

const mergeReason = (text: string, mark: Element, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_start()
    .child(markSlot(mark).mt(spacing.xxsmall))
    .child(detailText(text, tokens));

export const mergeBlock = (
  variant: PullVariant,
  state: PullState,
  tokens: DirectionTokens,
): Element => {
  const block = v_flex().flex_none().min_w(0).gap(spacing.small);

  if (state !== 'ready') {
    return block
      .gap(0)
      .child(mergeReason('1 check failing', checkMark('failing', tokens), tokens))
      .child(mergeReason('2 threads unresolved', workNeedMark('review', tokens), tokens))
      .child(mergeReason('Changes requested by jonas-l', workNeedMark('review', tokens), tokens))
      .child(detailText('Merge waits for these.', tokens));
  }

  block
    .child(
      h_flex()
        .gap(spacing.small)
        .items_center()
        .child(icon('git-merge', 'small').text_color(tokens.marks.done))
        .child(fixedLabel('Ready to merge', tokens.text.title, tokens.ink.text)),
    )
    .child(detailText('4 checks passed · approved · no conflicts', tokens));

  if (variant === 'reader') {
    return block;
  }

  const action = variant === 'box' ? 'Squash and merge' : 'Ask agent to merge';

  block.child(reviewActionButton(action, tokens));

  if (variant === 'box') {
    block.child(detailText('Into main · deletes the branch', tokens));
  }

  return block;
};
