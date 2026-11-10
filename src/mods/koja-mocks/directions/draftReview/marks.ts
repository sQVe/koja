import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import type { DirectionTokens } from '../tokens.ts';

type CommentMark = 'single' | 'start' | 'middle' | 'end';

export const gutterMarkWidth = 3;

const tick = (tokens: DirectionTokens): Element =>
  div().absolute().left(0).w(spacing.small).h(2).bg(tokens.ink.muted);

export const commentMark = (kind: CommentMark, tokens: DirectionTokens): Element => {
  const mark = div().relative().w(gutterMarkWidth).flex_none();

  if (kind === 'single') {
    return mark.child(tick(tokens).top('50%'));
  }

  const line = div().absolute().left(0).w(2).top(0).bottom(0).bg(tokens.ink.muted);

  if (kind === 'start') {
    line.top('50%');
    mark.child(tick(tokens).top('50%'));
  }

  if (kind === 'end') {
    line.bottom('50%');
    mark.child(tick(tokens).top('50%'));
  }

  return mark.child(line);
};
