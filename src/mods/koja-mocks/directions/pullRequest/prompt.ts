import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import { readingInset, reviewActionButton, saveRecoveryButton } from '../content/parts.ts';
import { sectionDivider } from '../panels/frame.ts';
import { fixedLabel } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullView } from './data.ts';
import { isBottomBarView } from './data.ts';

const smallActionHeight = 20;

export const promptAction = (picked: boolean, view: PullView, tokens: DirectionTokens): Element => {
  if (picked && view.state === 'sent') {
    return fixedLabel('Sent to agent · just now', tokens.text.detail, tokens.ink.dim);
  }

  if (picked && view.queued) {
    const added = h_flex()
      .h(smallActionHeight)
      .px(spacing.small)
      .gap(spacing.xsmall)
      .items_center()
      .rounded(tokens.controls.radius)
      .border(1)
      .border_color(tokens.pane.border)
      .child(icon('check', 'xsmall').text_color(tokens.ink.muted))
      .child(fixedLabel('Added', tokens.text.detail, tokens.ink.muted));

    return isBottomBarView(view) ? added.bg(tokens.rows.selectedFill) : added;
  }

  const action = isBottomBarView(view) ? 'Add for agent' : 'Add to prompt';

  return saveRecoveryButton(action, tokens);
};

export const sectionSend = (tokens: DirectionTokens): Element =>
  reviewActionButton('Send 2 to agent', tokens).h(smallActionHeight);

export const promptBar = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .child(
      sectionDivider(tokens)
        .ml(readingInset)
        .mr(tokens.rows.inset + tokens.rows.paddingX + spacing.medium),
    )
    .child(
      h_flex()
        .pl(readingInset)
        .pr(tokens.rows.inset + tokens.rows.paddingX + spacing.medium)
        .py(spacing.medium)
        .gap(spacing.medium)
        .items_center()
        .child(
          fixedLabel(
            '2 added for Design the sidebar',
            tokens.text.detail,
            tokens.ink.text,
          ).flex_1(),
        )
        .child(saveRecoveryButton('Clear', tokens))
        .child(reviewActionButton('Send to agent', tokens)),
    );

export const promptHeader = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .px(readingInset)
    .py(spacing.small)
    .gap(spacing.small)
    .child(
      h_flex()
        .items_center()
        .gap(spacing.medium)
        .child(fixedLabel('Prompt for the agent', tokens.text.title, tokens.ink.text).flex_1())
        .child(reviewActionButton('Send to agent', tokens)),
    )
    .child(
      h_flex()
        .gap(spacing.small)
        .child(saveRecoveryButton('typecheck ×', tokens))
        .child(saveRecoveryButton('rows.ts:48 ×', tokens)),
    );
