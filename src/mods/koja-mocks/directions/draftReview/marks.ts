import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { DirectionTokens } from '../tokens.ts';

type CommentMark = 'single' | 'start' | 'middle' | 'end' | 'range';

export const gutterMarkWidth = 3;

const tick = (tokens: DirectionTokens): Element =>
  div().absolute().left(0).w(gutterMarkWidth).h(1).bg(tokens.ink.dim);

export const commentMark = (kind: CommentMark, tokens: DirectionTokens): Element => {
  const mark = div().relative().w(gutterMarkWidth).flex_none();

  if (kind === 'single') {
    return mark.child(tick(tokens).top('50%'));
  }

  const line = div().absolute().left(0).w(1).top(0).bottom(0).bg(tokens.ink.dim);

  if (kind === 'start') {
    line.top('50%');
    mark.child(tick(tokens).top('50%'));
  }

  if (kind === 'end') {
    line.bottom('50%');
    mark.child(tick(tokens).top('50%'));
  }

  if (kind === 'range') {
    mark.child(tick(tokens).top(0)).child(tick(tokens).bottom(0));
  }

  return mark.child(line);
};
