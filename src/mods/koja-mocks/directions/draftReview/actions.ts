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
import { draftFolder } from './data.ts';

const changedAction = (tokens: DirectionTokens): Element =>
  v_flex()
    .gap(spacing.medium)
    .child(reviewActionButton('Go to line 6', tokens))
    .child(paragraph('body.md changed outside this pane.', tokens).text_color(tokens.marks.blocked))
    .child(
      paragraph('Choose a version for line 6. Sending waits until you choose.', tokens).text_color(
        tokens.ink.dim,
      ),
    );

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

  const actions = reviewActions(state === 'sent' ? 'sent' : 'ready', tokens);
  const openComment = state === 'comment' || state === 'range' || state === 'file-comment';

  if (state === 'edit-line') {
    actions.child(paragraph('1 line edit is still open.', tokens).text_color(tokens.ink.dim));
  }

  if (openComment || state === 'normal') {
    actions.child(paragraph('1 comment is still open.', tokens).text_color(tokens.ink.dim));
  }

  return actions;
};

export const brokenBody = (view: DraftView, tokens: DirectionTokens): Element =>
  scrollBody('draft-broken')
    .child(itemHeading(view.item, tokens))
    .child(
      v_flex()
        .flex_none()
        .min_w(0)
        .px(readingInset)
        .py(spacing.medium)
        .gap(spacing.medium)
        .child(
          stateLine({
            kind: 'error',
            text: 'Could not open this review: request.json uses version 2. Update Koja to read it.',
          }).px(0),
        )
        .child(label(draftFolder, tokens.text.body, tokens.ink.text))
        .child(h_flex().child(saveRecoveryButton('Copy path', tokens))),
    );
