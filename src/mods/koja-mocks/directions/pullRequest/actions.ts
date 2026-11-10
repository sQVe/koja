import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { controlSize, spacing } from '../../../../kit/size.ts';
import { reviewActionButton } from '../content/parts.ts';
import { overlayCard, overlayTokens } from '../overlays/parts.ts';
import { fixedLabel, label, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullTake } from './data.ts';
import { detailText } from './parts.ts';

const menuMarkWidth = 12;
const buttonInset = 12;
const splitSegmentWidth = 28;

const outlineAction = (text: string, tokens: DirectionTokens): Element =>
  h_flex()
    .h(controlSize.dialogButton)
    .px(buttonInset)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(fixedLabel(text, tokens.text.body, tokens.ink.text));

const splitAction = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(controlSize.dialogButton)
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

const mergeActions = (take: PullTake, tokens: DirectionTokens): Element => {
  if (take === 'split') {
    return splitAction(tokens);
  }

  const primary = take === 'merge' ? 'Squash and merge' : 'Ask agent to merge';
  const secondary = take === 'merge' ? 'Ask agent to merge' : 'Squash and merge';

  return v_flex()
    .gap(spacing.small)
    .child(reviewActionButton(primary, tokens))
    .child(outlineAction(secondary, tokens));
};

export const readyActions = (take: PullTake, tokens: DirectionTokens): Element =>
  v_flex()
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
    .child(mergeActions(take, tokens))
    .child(detailText('Into main · deletes the branch', tokens));

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
