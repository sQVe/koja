import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import { scrollBody } from '../content/parts.ts';
import { scrollRegion } from '../panels/splitParts.ts';
import { fixedLabel, label } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DraftComment, DraftFile, DraftState, DraftView } from './data.ts';
import { isBodyFile } from './data.ts';
import { commentCard, commentComposer, fileHeading } from './parts.ts';
import { sourceLines, textInset } from './source.ts';

const bodyInset = 16;
const scrollShares = { plan: 0.22, review: 0.64 };

// These shell-sized viewports end on whole rows before the next line or file header.
const viewportHeightByState: Partial<Record<DraftState, number>> = {
  comment: 546,
  'edit-line': 552,
  'edit-file': 546,
  'saving-failed': 540,
  'changed-on-disk': 552,
  plan: 510,
  sent: 540,
};

const commentSummary = (comment: DraftComment, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .items_center()
    .gap(spacing.medium)
    .child(icon('message-square', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel(comment.anchor, tokens.text.detail, tokens.ink.dim))
    .child(label(comment.text, tokens.text.body, tokens.ink.text));

const fileBody = (file: DraftFile, view: DraftView, tokens: DirectionTokens): Element => {
  const editingFile = isBodyFile(file) && view.state === 'edit-file';
  const body = v_flex().flex_none().min_w(0);

  if (view.state === 'file-comment' && file === view.selected) {
    body.child(
      commentComposer({ anchor: 'File', text: 'Add the koja-mocks change too.' }, tokens)
        .ml(textInset)
        .my(spacing.xxsmall),
    );
  }

  if (editingFile) {
    body.child(
      v_flex()
        .flex_none()
        .min_w(0)
        .py(spacing.xsmall)
        .children(file.comments.map((comment) => commentSummary(comment, tokens))),
    );
  } else {
    body.children(
      file.comments
        .filter((comment) => comment.start === null)
        .map((comment) => commentCard(comment, false, tokens).ml(textInset).my(spacing.xxsmall)),
    );
  }

  const source = sourceLines(file, { state: view.state, inline: !editingFile }, tokens);

  if (editingFile) {
    source
      .py(spacing.small)
      .mx(-1)
      .rounded(tokens.controls.radius)
      .border(1)
      .border_color(tokens.pane.cardBorder);
  }

  return body.child(source);
};

const fileSection = (file: DraftFile, view: DraftView, tokens: DirectionTokens): Element => {
  const section = v_flex().flex_none().min_w(0);

  if (file !== view.files[0]) {
    section.child(div().h(1).flex_none().mt(spacing.small).bg(tokens.pane.cardBorder));
  }

  return section.child(fileHeading(file, view, tokens)).child(fileBody(file, view, tokens));
};

const visibleShare = (view: DraftView): number => {
  if (view.state === 'file-comment') {
    return 1;
  }

  return view.state === 'plan' ? scrollShares.plan : scrollShares.review;
};

export const pinnedDocument = (view: DraftView, tokens: DirectionTokens): Element => {
  const reading = scrollBody('draft-files').px(bodyInset).pb(bodyInset);

  const document = v_flex()
    .flex_1()
    .min_w(0)
    .min_h(0)
    .pb(spacing.xsmall)
    .border_t(1)
    .border_color(tokens.pane.cardBorder);

  const pinned = view.state === 'plan' || view.state === 'range' || view.state === 'file-comment';

  if (pinned) {
    document.child(
      v_flex()
        .flex_none()
        .px(bodyInset)
        .border_b(1)
        .border_color(tokens.pane.headerDivider)
        .child(fileHeading(view.selected, view, tokens)),
    );

    reading.child(fileBody(view.selected, view, tokens));

    const nextIndex = view.files.indexOf(view.selected) + 1;

    reading.children(view.files.slice(nextIndex).map((file) => fileSection(file, view, tokens)));
  } else {
    reading.children(view.files.map((file) => fileSection(file, view, tokens)));
  }

  const region = scrollRegion(reading, visibleShare(view), tokens)
    .mr(spacing.small)
    .flex_1()
    .min_w(0);

  const height = viewportHeightByState[view.state];

  if (height !== undefined) {
    region.max_h(height);
  }

  return document.child(region);
};
