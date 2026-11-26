import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { controlSize, spacing } from '../../../../kit/size.ts';
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
    const checkIcon = icon('check', 'xsmall').text_color(tokens.ink.muted);

    const added = h_flex()
      .h(smallActionHeight)
      .px(spacing.small)
      .gap(spacing.xsmall)
      .items_center()
      .rounded(tokens.controls.radius)
      .border(1)
      .border_color(tokens.pane.border)
      .child(checkIcon)
      .child(fixedLabel('Added', tokens.text.detail, tokens.ink.muted));

    return isBottomBarView(view) ? added.bg(tokens.rows.selectedFill) : added;
  }

  const action = isBottomBarView(view) ? 'Add for agent' : 'Add to prompt';

  return saveRecoveryButton(action, tokens);
};

export const sectionSend = (tokens: DirectionTokens): Element =>
  reviewActionButton('Send 2 to agent', tokens).h(smallActionHeight);

export const promptBar = (tokens: DirectionTokens): Element => {
  const barInset = tokens.rows.inset + tokens.rows.paddingX + spacing.medium;
  const divider = sectionDivider(tokens).ml(readingInset).mr(barInset);

  const summary = fixedLabel(
    '2 added for Design the sidebar',
    tokens.text.detail,
    tokens.ink.text,
  ).flex_1();

  const clearButton = saveRecoveryButton('Clear', tokens).h(controlSize.sceneAction);

  const actions = h_flex()
    .pl(readingInset)
    .pr(barInset)
    .py(spacing.medium)
    .gap(spacing.medium)
    .items_center()
    .child(summary)
    .child(clearButton)
    .child(reviewActionButton('Send to agent', tokens));

  return v_flex().flex_none().child(divider).child(actions);
};

export const promptHeader = (tokens: DirectionTokens): Element => {
  const title = fixedLabel('Prompt for the agent', tokens.text.title, tokens.ink.text).flex_1();

  const titleRow = h_flex()
    .items_center()
    .gap(spacing.medium)
    .child(title)
    .child(reviewActionButton('Send to agent', tokens));

  const chips = h_flex()
    .gap(spacing.small)
    .child(saveRecoveryButton('typecheck ×', tokens))
    .child(saveRecoveryButton('rows.ts:48 ×', tokens));

  return v_flex()
    .flex_none()
    .px(readingInset)
    .py(spacing.small)
    .gap(spacing.small)
    .child(titleRow)
    .child(chips);
};
