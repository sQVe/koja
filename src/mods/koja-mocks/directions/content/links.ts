import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import { label } from '../parts.ts';
import { sourceLink } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { SourceTarget } from './data.ts';

export const externalLink = (
  value: string,
  target: SourceTarget,
  tokens: DirectionTokens,
): Element => {
  const identity = target === 'GitHub' ? `koja ${value}` : value;
  const text = `${identity} · ${target}`;

  return h_flex()
    .min_w(0)
    .items_center()
    .tooltip(text)
    .child(sourceLink(text, tokens).text_ellipsis_middle().flex_shrink(1));
};

export const agentLink = (value: string, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.xsmall)
    .items_start()
    .tooltip(value)
    .child(icon('terminal', 'small').flex_none().mt(spacing.xxsmall).text_color(tokens.ink.dim))
    .child(label(value, tokens.text.detail, tokens.ink.text).flex_1().underline());
