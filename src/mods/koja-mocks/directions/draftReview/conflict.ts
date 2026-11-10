import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { rowHeight, spacing } from '../../../../kit/size.ts';
import { fixedLabel, terminalFont } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { outlineAction } from './parts.ts';

const versionText = (yours: boolean, tokens: DirectionTokens): Element => {
  const changed = yours ? 'in view when' : 'visible while';
  const ink = yours ? tokens.marks.added : tokens.marks.removed;

  return h_flex()
    .h(rowHeight.small)
    .flex_none()
    .min_w(0)
    .items_center()
    .font_family(terminalFont)
    .child(fixedLabel('- Keep the selected space ', tokens.text.body, tokens.ink.text))
    .child(fixedLabel(changed, tokens.text.body, ink))
    .child(fixedLabel(' groups fold.', tokens.text.body, tokens.ink.text));
};

const versionLabel = (name: string, tokens: DirectionTokens): Element =>
  h_flex()
    .h(rowHeight.small)
    .flex_none()
    .items_center()
    .child(fixedLabel(name, tokens.text.detail, tokens.ink.dim));

export const conflictBlock = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .min_w(0)
    .p(spacing.medium)
    .gap(spacing.small)
    .rounded(tokens.pane.radius)
    .border(1)
    .border_color(tokens.pane.cardBorder)
    .child(
      h_flex()
        .gap(spacing.small)
        .child(
          v_flex()
            .flex_none()
            .gap(spacing.small)
            .child(versionText(true, tokens))
            .child(versionText(false, tokens)),
        )
        .child(
          v_flex()
            .flex_none()
            .gap(spacing.small)
            .child(versionLabel('Yours', tokens))
            .child(versionLabel('On disk', tokens)),
        ),
    )
    .child(
      h_flex()
        .gap(spacing.small)
        .justify_end()
        .child(outlineAction('Keep yours', tokens))
        .child(outlineAction('Use disk', tokens)),
    );
