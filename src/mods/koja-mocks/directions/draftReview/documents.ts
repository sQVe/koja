import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { scrollBody } from '../content/parts.ts';
import { scrollRegion } from '../panels/splitParts.ts';
import { fixedLabel } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DraftFile, DraftView } from './data.ts';
import { isBodyFile } from './data.ts';
import { commentCard, commentComposer, fileHeading } from './parts.ts';
import { sourceLines, textInset } from './source.ts';

const bodyInset = 16;
const scrollShares = { review: 0.72, plan: 0.22, short: 1 };

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

  if (!editingFile) {
    body.children(
      file.comments
        .filter((comment) => comment.start === null)
        .map((comment) => commentCard(comment, false, tokens).ml(textInset).my(spacing.xxsmall)),
    );
  }

  const source = sourceLines(file, { state: view.state, inline: !editingFile }, tokens);

  if (editingFile) {
    source
      .p(spacing.small)
      .rounded(tokens.controls.radius)
      .border(1)
      .border_color(tokens.pane.focusedBorder);
  }

  return body.child(source);
};

const remainingFiles = (view: DraftView, tokens: DirectionTokens): Element[] => {
  const nextIndex = view.files.indexOf(view.selected) + 1;

  return view.files.slice(nextIndex).map((file) =>
    v_flex()
      .flex_none()
      .min_w(0)
      .mt(spacing.medium)
      .border_t(1)
      .border_color(tokens.pane.headerDivider)
      .child(fileHeading(file, view.state, tokens))
      .child(fileBody(file, view, tokens)),
  );
};

const pinnedHeader = (view: DraftView, tokens: DirectionTokens): Element => {
  const header = v_flex()
    .flex_none()
    .min_w(0)
    .px(bodyInset)
    .pb(spacing.xsmall)
    .bg(tokens.pane.fill)
    .border_b(1)
    .border_color(tokens.pane.headerDivider)
    .child(fileHeading(view.selected, view.state, tokens));

  if (view.state === 'edit-file') {
    const count = view.selected.comments.length;

    header.child(
      fixedLabel(
        `${count} comments show again when you finish editing.`,
        tokens.text.detail,
        tokens.ink.dim,
      ).py(spacing.xsmall),
    );
  }

  return header;
};

const visibleShare = (view: DraftView): number => {
  if (view.state === 'file-comment') {
    return scrollShares.short;
  }

  return view.state === 'plan' ? scrollShares.plan : scrollShares.review;
};

export const pinnedDocument = (view: DraftView, tokens: DirectionTokens): Element => {
  const reading = scrollBody('draft-files')
    .px(bodyInset)
    .pt(spacing.xsmall)
    .pb(bodyInset)
    .child(fileBody(view.selected, view, tokens))
    .children(remainingFiles(view, tokens));

  return v_flex()
    .flex_1()
    .min_w(0)
    .min_h(0)
    .child(pinnedHeader(view, tokens))
    .child(scrollRegion(reading, visibleShare(view), tokens).flex_1().min_w(0));
};
