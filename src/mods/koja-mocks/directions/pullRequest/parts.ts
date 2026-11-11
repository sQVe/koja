import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import {
  checkMark,
  contentSectionHeader,
  paragraph,
  readingInset,
  sectionBodyInset,
} from '../content/parts.ts';
import { sectionHeaderOf } from '../panels/frame.ts';
import { fixedLabel, label, row, styled, terminalFont } from '../parts.ts';
import { workNeedMark } from '../sidebars/facts.ts';
import { sourceLink } from '../sidebars/sidebar.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullThread, PullView } from './data.ts';
import { checkFailure, isBottomBarView, pullThreads } from './data.ts';
import { promptAction, sectionSend } from './prompt.ts';

const markSlotWidth = 12;
const selectionInset = 18;

export const detailText = (text: string, tokens: DirectionTokens): Element =>
  styled(div().min_w(0), tokens.text.detail, tokens.ink.dim).child(text);

const selectionSlot = (picked: boolean, tokens: DirectionTokens): Element => {
  const slot = h_flex().w(markSlotWidth).flex_none().items_center().justify_center();

  if (picked) {
    slot.child(icon('check', 'xsmall').text_color(tokens.ink.text));
  }

  return slot;
};

const itemMark = (
  mark: Element,
  picked: boolean,
  view: PullView,
  tokens: DirectionTokens,
): Element => {
  const start = h_flex().items_center().gap(spacing.small);

  if (view.tray === 'section') {
    start.child(selectionSlot(picked, tokens));
  }

  return start.child(h_flex().w(markSlotWidth).justify_center().child(mark));
};

const detailBlock = (view: PullView, tokens: DirectionTokens): Element => {
  const extra = view.tray === 'section' ? selectionInset : 0;

  return v_flex()
    .flex_none()
    .min_w(0)
    .ml(sectionBodyInset(tokens) + extra)
    .mr(readingInset);
};

const logLines = (lines: string[], tokens: DirectionTokens): Element =>
  v_flex()
    .min_w(0)
    .pl(spacing.small)
    .py(spacing.xsmall)
    .border_l(1)
    .border_color(tokens.pane.border)
    .children(lines.map((line) => detailText(line, tokens).font_family(terminalFont)));

const failedCheck = (view: PullView, tokens: DirectionTokens): Element => {
  const stale = view.state === 'checks-failed';
  const nameInk = stale ? tokens.ink.dim : tokens.ink.text;
  const stateInk = stale ? tokens.ink.dim : tokens.marks.blocked;
  const age = stale ? checkFailure.staleAge : checkFailure.age;
  const titleRole = isBottomBarView(view) ? tokens.text.title : tokens.text.body;
  const details = detailBlock(view, tokens);
  const lines = logLines([checkFailure.path, checkFailure.message], tokens);

  if (isBottomBarView(view)) {
    details
      .child(
        h_flex()
          .gap(spacing.xsmall)
          .items_center()
          .child(detailText(`${age} ·`, tokens))
          .child(sourceLink('log on GitHub', tokens).text_color(tokens.ink.dim)),
      )
      .child(lines);
  } else {
    details.child(lines).child(detailText(age, tokens));
  }

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(
      row(
        {
          selected: false,
          start: itemMark(checkMark('failing', tokens), true, view, tokens),
          label: label('typecheck', titleRole, nameInk),
          end: [
            fixedLabel('failing', tokens.text.detail, stateInk),
            promptAction(true, view, tokens),
          ],
        },
        tokens,
      ),
    )
    .child(details);
};

const threadTitle = (thread: PullThread, view: PullView, tokens: DirectionTokens): Element => {
  if (!isBottomBarView(view)) {
    return label(thread.reference, tokens.text.title, tokens.ink.text);
  }

  const folder = thread.path.slice(0, thread.path.lastIndexOf('/') + 1);

  return h_flex()
    .min_w(0)
    .items_center()
    .tooltip(thread.path)
    .child(label(folder, tokens.text.body, tokens.ink.dim).flex_shrink(1))
    .child(fixedLabel(thread.reference, tokens.text.title, tokens.ink.text));
};

const threadRow = (thread: PullThread, view: PullView, tokens: DirectionTokens): Element => {
  const picked = thread === pullThreads[0];
  const padding = isBottomBarView(view) ? 0 : spacing.xxsmall;
  const snippet = isBottomBarView(view) ? thread.snippet : thread.snippet.slice(0, 2);

  return v_flex()
    .flex_none()
    .min_w(0)
    .pb(padding)
    .child(
      row(
        {
          selected: false,
          start: itemMark(workNeedMark('review', tokens), picked, view, tokens),
          label: threadTitle(thread, view, tokens),
          end: [
            fixedLabel('unresolved', tokens.text.detail, tokens.ink.dim),
            promptAction(picked, view, tokens),
          ],
        },
        tokens,
      ),
    )
    .child(
      detailBlock(view, tokens)
        .child(detailText(thread.author, tokens))
        .child(paragraph(thread.text, tokens))
        .child(logLines(snippet, tokens)),
    );
};

const requestedReview = (view: PullView, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(
      row(
        {
          selected: false,
          start: itemMark(
            icon('square-pen', 'small').text_color(tokens.marks.working),
            false,
            view,
            tokens,
          ),
          label: label('Changes requested', tokens.text.title, tokens.ink.text),
          end: [
            fixedLabel('changes requested', tokens.text.detail, tokens.ink.dim),
            promptAction(false, view, tokens),
          ],
        },
        tokens,
      ),
    )
    .child(detailBlock(view, tokens).child(detailText('jonas-l · 2h ago', tokens)));

export const needsYouSection = (view: PullView, tokens: DirectionTokens): Element => {
  const items = [failedCheck(view, tokens)];

  if (isBottomBarView(view)) {
    items.push(requestedReview(view, tokens));
  }

  items.push(...pullThreads.map((thread) => threadRow(thread, view, tokens)));
  const header = contentSectionHeader({ name: 'Needs you', count: items.length }, true, [], tokens);

  if (view.tray === 'section') {
    header.child(sectionSend(tokens));
  }

  const section = v_flex().flex_none().min_w(0).child(header);

  if (view.state === 'checks-failed') {
    section.child(
      errorLine('Could not sync checks · showing checks from 6m ago', 'Retry checks', tokens),
    );
  }

  const itemList = v_flex().flex_none().min_w(0).children(items);

  if (isBottomBarView(view)) {
    itemList.gap(spacing.small);
  }

  section.child(itemList);
  const summary = detailText('3 checks passed · 1 thread resolved', tokens);

  if (isBottomBarView(view)) {
    return section.child(sectionHeaderOf(summary, { open: false, detail: [], end: [] }, tokens));
  }

  return section.child(detailBlock(view, tokens).child(summary));
};
