import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { controlSize, spacing } from '../../../../kit/size.ts';
import { readingInset, reviewActionButton, sectionBodyInset } from '../content/parts.ts';
import { dialogActionsFor } from '../dialogs/actions.ts';
import { wrappedText } from '../dialogs/parts.ts';
import { dialogFrame } from '../dialogs/scene.ts';
import { overlayCard, overlayTokens } from '../overlays/parts.ts';
import { fixedLabel, label, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullState } from './data.ts';
import { detailText } from './parts.ts';

const menuMarkWidth = 12;
const splitSegmentWidth = 28;

export const mergeActionWidth = 208;

const splitAction = (tokens: DirectionTokens): Element => {
  const chevron = icon('chevron-down', 'small').text_color(tokens.pane.fill);

  const mergeSegment = h_flex()
    .flex_1()
    .items_center()
    .justify_center()
    .child(fixedLabel('Squash and merge', tokens.text.body, tokens.pane.fill));

  const menuSegment = h_flex()
    .w(splitSegmentWidth)
    .flex_none()
    .items_center()
    .justify_center()
    .border_l(1)
    .border_color(tokens.ink.dim)
    .child(chevron);

  return h_flex()
    .h(controlSize.dialogButton)
    .w(mergeActionWidth)
    .flex_none()
    .items_stretch()
    .rounded(tokens.controls.radius)
    .bg(tokens.ink.text)
    .child(mergeSegment)
    .child(menuSegment);
};

const mergeState = (title: string, mark: Element, tokens: DirectionTokens): Element => {
  const titleRow = h_flex()
    .ml(tokens.rows.inset + tokens.rows.paddingX - sectionBodyInset(tokens))
    .gap(spacing.small)
    .items_center()
    .child(mark)
    .child(fixedLabel(title, tokens.text.title, tokens.ink.text));

  return v_flex()
    .flex_none()
    .min_w(0)
    .gap(spacing.small)
    .pl(sectionBodyInset(tokens) - readingInset)
    .child(titleRow);
};

export const blockedMerge = (tokens: DirectionTokens): Element => {
  const failingMark = icon('circle-x', 'small').text_color(tokens.marks.blocked);

  return mergeState("Can't merge yet", failingMark, tokens).child(
    detailText('1 of 4 checks failing · 2 unresolved threads · changes requested', tokens),
  );
};

export const readyActions = (state: PullState, tokens: DirectionTokens): Element => {
  if (state === 'merge-failed') {
    const failingMark = icon('circle-x', 'small').text_color(tokens.marks.blocked);
    const retryRow = h_flex().child(reviewActionButton('Update branch and retry', tokens));

    return mergeState('Could not merge', failingMark, tokens)
      .child(
        fixedLabel('main changed since the branch was updated', tokens.text.body, tokens.ink.text),
      )
      .child(
        detailText('At the last sync: 4 checks passed · approved · 0 unresolved threads', tokens),
      )
      .child(retryRow)
      .child(
        detailText(
          'Waits for checks, then squash and merge into main · deletes the branch',
          tokens,
        ),
      );
  }

  const doneMark = icon('git-merge', 'small').text_color(tokens.marks.done);

  return mergeState('Ready to merge', doneMark, tokens)
    .child(detailText('approved by jonas-l · no conflicts', tokens))
    .child(splitAction(tokens))
    .child(detailText('Into main · deletes the branch', tokens));
};

export const mergeMenu = (tokens: DirectionTokens): Element => {
  const menuTokens = overlayTokens(tokens.rows.height, tokens);
  const choices = ['Squash and merge', 'Ask agent to merge', 'Merge commit', 'Rebase and merge'];

  return overlayCard(tokens).children(
    choices.map((choice, index) => {
      const current = index === 0;

      const mark = current
        ? icon('check', 'small').text_color(tokens.ink.muted)
        : div().w(menuMarkWidth);

      return row(
        {
          selected: current,
          start: mark,
          label: label(choice, tokens.text.body, tokens.ink.text),
          end: [],
        },
        menuTokens,
      );
    }),
  );
};

export const mergeConfirm = (tokens: DirectionTokens): Element => {
  const title = wrappedText('Squash and merge #41?', tokens.text.title, tokens.ink.text);

  const body = v_flex()
    .child(wrappedText('Squashes 5 commits into main.', tokens.text.body, tokens.ink.muted))
    .child(
      wrappedText(
        'Deletes the branch me-1090-design-the-sidebar.',
        tokens.text.body,
        tokens.ink.muted,
      ),
    );

  return dialogFrame(title, body, dialogActionsFor('Merge', false, tokens), tokens);
};
