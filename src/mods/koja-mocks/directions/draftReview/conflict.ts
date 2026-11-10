import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { rowHeight, spacing } from '../../../../kit/size.ts';
import { fixedLabel, terminalFont } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { outlineAction } from './parts.ts';

const versionLabelWidth = 52;

const versionRow = (yours: boolean, tokens: DirectionTokens): Element => {
  const name = yours ? 'Yours' : 'On disk';
  const changed = yours ? 'in view when' : 'visible while';
  const ink = yours ? tokens.marks.added : tokens.marks.removed;

  return h_flex()
    .h(rowHeight.small)
    .min_w(0)
    .gap(spacing.medium)
    .items_center()
    .child(fixedLabel(name, tokens.text.detail, tokens.ink.dim).w(versionLabelWidth))
    .child(
      h_flex()
        .min_w(0)
        .font_family(terminalFont)
        .child(fixedLabel('- Keep the selected space ', tokens.text.body, tokens.ink.text))
        .child(fixedLabel(changed, tokens.text.body, ink))
        .child(fixedLabel(' groups fold.', tokens.text.body, tokens.ink.text)),
    );
};

export const conflictBlock = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .min_w(0)
    .p(spacing.medium)
    .gap(spacing.small)
    .rounded(tokens.pane.radius)
    .border(1)
    .border_color(tokens.pane.cardBorder)
    .child(versionRow(true, tokens))
    .child(versionRow(false, tokens))
    .child(
      h_flex()
        .gap(spacing.small)
        .justify_end()
        .child(outlineAction('Keep yours', tokens))
        .child(outlineAction('Use disk', tokens)),
    );
