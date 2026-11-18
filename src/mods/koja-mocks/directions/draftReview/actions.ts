import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { stateLine } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import { reviewActions } from '../content/layouts.ts';
import {
  itemHeading,
  paragraph,
  readingInset,
  reviewActionButton,
  saveFailure,
  saveRecoveryButton,
  scrollBody,
} from '../content/parts.ts';
import { label } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DraftState, DraftView } from './data.ts';
import { draftFolder, showsOpenComment } from './data.ts';

const changedAction = (tokens: DirectionTokens): Element => {
  const changedNote = paragraph('body.md changed outside this pane.', tokens).text_color(
    tokens.marks.blocked,
  );

  const chooseNote = paragraph(
    'Choose a version for line 6. Sending waits until you choose.',
    tokens,
  ).text_color(tokens.ink.dim);

  return v_flex()
    .gap(spacing.medium)
    .child(reviewActionButton('Go to line 6', tokens))
    .child(changedNote)
    .child(chooseNote);
};

export const draftActions = (state: DraftState, tokens: DirectionTokens): Element => {
  if (state === 'saving-failed') {
    return v_flex()
      .gap(spacing.medium)
      .child(reviewActionButton('Retry save', tokens))
      .child(
        saveFailure(tokens, {
          error: 'Could not save: the folder is read-only. Make it writable, then retry.',
          folder: draftFolder,
          unsaved: '1 line and 1 comment are unsaved. They stay in this pane.',
        }),
      );
  }

  if (state === 'changed-on-disk') {
    return changedAction(tokens);
  }

  const reviewState = state === 'sent' ? 'sent' : 'ready';
  const actions = reviewActions(reviewState, tokens);

  if (state === 'edit-line') {
    const lineEditNote = paragraph('Sending adds the open line edit.', tokens).text_color(
      tokens.ink.dim,
    );

    actions.child(lineEditNote);
  }

  if (showsOpenComment(state)) {
    const commentNote = paragraph('Sending adds the open comment.', tokens).text_color(
      tokens.ink.dim,
    );

    actions.child(commentNote);
  }

  return actions;
};

export const brokenBody = (view: DraftView, tokens: DirectionTokens): Element => {
  const errorLine = stateLine({
    kind: 'error',
    text: 'Could not open this review: request.json uses version 2. Update Koja to read it.',
  }).px(0);

  const copyPath = h_flex().child(saveRecoveryButton('Copy path', tokens));

  const details = v_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .py(spacing.medium)
    .gap(spacing.medium)
    .child(errorLine)
    .child(label(draftFolder, tokens.text.body, tokens.ink.text))
    .child(copyPath);

  return scrollBody('draft-broken')
    .child(itemHeading(view.item, [], 'badge', tokens))
    .child(details);
};
