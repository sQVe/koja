import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { controlSize, spacing } from '../../../../kit/size.ts';
import { dialogActionsFor } from '../dialogs/actions.ts';
import { wrappedText } from '../dialogs/parts.ts';
import { dialogFrame } from '../dialogs/scene.ts';
import { overlayCard, overlayTokens } from '../overlays/parts.ts';
import { fixedLabel, label, row } from '../parts.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullState } from './data.ts';
import { detailText } from './parts.ts';

const menuMarkWidth = 12;
const splitSegmentWidth = 28;

export const mergeActionWidth = 208;

const splitAction = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(controlSize.dialogButton)
    .w(mergeActionWidth)
    .flex_none()
    .items_stretch()
    .rounded(tokens.controls.radius)
    .bg(tokens.ink.text)
    .child(
      h_flex()
        .flex_1()
        .items_center()
        .justify_center()
        .child(fixedLabel('Squash and merge', tokens.text.body, tokens.pane.fill)),
    )
    .child(
      h_flex()
        .w(splitSegmentWidth)
        .flex_none()
        .items_center()
        .justify_center()
        .border_l(1)
        .border_color(tokens.ink.dim)
        .child(icon('chevron-down', 'small').text_color(tokens.pane.fill)),
    );

export const readyActions = (state: PullState, tokens: DirectionTokens): Element => {
  const block = v_flex()
    .flex_none()
    .min_w(0)
    .gap(spacing.small)
    .child(
      h_flex()
        .gap(spacing.small)
        .items_center()
        .child(icon('git-merge', 'small').text_color(tokens.marks.done))
        .child(fixedLabel('Ready to merge', tokens.text.title, tokens.ink.text)),
    )
    .child(detailText('4 checks passed · approved · no conflicts', tokens))
    .child(splitAction(tokens));

  if (state === 'merge-failed') {
    block.child(errorLine('Could not merge: main changed since the last sync', tokens).mx(0).px(0));
  }

  return block.child(detailText('Into main · deletes the branch', tokens));
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
  const title = wrappedText('Squash and merge #44?', tokens.text.title, tokens.ink.text);

  const body = v_flex()
    .child(wrappedText('Squashes 5 commits into main.', tokens.text.body, tokens.ink.muted))
    .child(
      wrappedText('Deletes the branch me-1091-stack-panel.', tokens.text.body, tokens.ink.muted),
    );

  return dialogFrame(title, body, dialogActionsFor('Merge', false, tokens), tokens);
};
