import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { keyHint } from '../../../../kit/index.ts';
import { label } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeWorker } from './data.ts';

const fieldPadding = 8;
// The reply placeholder is dim ink faded further, so it never reads as typed text.
const placeholderOpacity = 0.6;

export const replyField = (
  placeholder: Element,
  end: Element[],
  tokens: DirectionTokens,
): Element =>
  h_flex()
    .h(tokens.controls.size)
    .flex_none()
    .px(fieldPadding)
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(placeholder.flex_1())
    .children(end);

export const sendHint = (): Element => keyHint('enter');

export const replyPlaceholder = (
  worker: FakeWorker,
  waiting: boolean,
  tokens: DirectionTokens,
): Element => {
  if (!waiting) {
    return label('Reply to the worker', tokens.text.body, tokens.ink.dim);
  }

  const text = `Reply to ${worker.task}`;

  return label(text, tokens.text.body, tokens.ink.dim).opacity(placeholderOpacity);
};
