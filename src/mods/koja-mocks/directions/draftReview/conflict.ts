import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { paragraph } from '../content/parts.ts';
import { fixedLabel, terminalFont } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { retypedLine } from './data.ts';
import { outlineAction } from './parts.ts';

const versionLabelWidth = 52;

const versionRow = (name: string, text: string, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.medium)
    .items_start()
    .child(fixedLabel(name, tokens.text.detail, tokens.ink.dim).w(versionLabelWidth))
    .child(paragraph(text, tokens).font_family(terminalFont).flex_1());

export const conflictBlock = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_1()
    .min_w(0)
    .p(spacing.medium)
    .gap(spacing.small)
    .rounded(tokens.pane.radius)
    .border(1)
    .border_color(tokens.pane.cardBorder)
    .child(versionRow('Yours', retypedLine, tokens))
    .child(versionRow('On disk', '- Keep the selected space visible while groups fold.', tokens))
    .child(
      h_flex()
        .gap(spacing.small)
        .justify_end()
        .child(outlineAction('Keep yours', tokens))
        .child(outlineAction('Use disk', tokens)),
    );
