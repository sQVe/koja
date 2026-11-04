import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { highlightRuns } from './highlight.ts';
import { formatKeys } from './keys.ts';
import type { Color } from './palette.ts';
import { spacing, textSize } from './size.ts';
import { colors } from './theme.ts';
import { currentPlatform } from './window.ts';

export const separator = (): Element =>
  div().flex_none().my(spacing.xsmall).h(spacing.hairline).bg(colors().border);

export const emptyState = (text: string): Element =>
  div()
    .px(spacing.large)
    .py(spacing.medium)
    .text_size(textSize.small)
    .text_color(colors().dim)
    .child(text);

export const detailText = (text: string, color = colors().dim): Element =>
  div().flex_none().text_size(textSize.small).text_color(color).child(text);

const unbroken = (text: string): string => text.replaceAll(' ', '\u00a0');

const hiddenText = (text: string): Element => div().flex_none().invisible().child(unbroken(text));

// Draws text.slice(start, end) by drawing text.slice(0, end) as one string and clipping off its
// first `start` letters, so each letter keeps the position and kerning it has in the whole text.
const clippedRun = (text: string, start: number, end: number, color: Color): Element => {
  const shown = h_flex()
    .flex_1()
    .min_w(0)
    .overflow_hidden()
    .justify_end()
    .child(
      div()
        .flex_none()
        .text_color(color)
        .child(unbroken(text.slice(0, end))),
    );

  const window = h_flex()
    .absolute()
    .inset_0()
    .child(hiddenText(text.slice(0, start)))
    .child(shown);

  return div()
    .absolute()
    .top_0()
    .left_0()
    .child(hiddenText(text.slice(0, end)))
    .child(window);
};

// Text with the letters a search matched in the accent color. Herdr cannot color part of one text
// element, and separate elements per run lose kerning at each run edge, so every run is a clipped
// layer of the whole text. The text clips instead of ending in an ellipsis.
export const highlightedText = (
  text: string,
  positions: readonly number[],
  emphasized: boolean,
): Element => {
  const palette = colors();
  const plain = emphasized ? palette.foreground : palette.muted;

  let start = 0;

  const layers = highlightRuns(text, positions).map((run) => {
    const end = start + run.text.length;
    const color = run.highlighted ? palette.accent : plain;
    const layer = clippedRun(text, start, end, color);

    start = end;

    return layer;
  });

  return div().relative().min_w(0).overflow_hidden().child(hiddenText(text)).children(layers);
};

export const keyHint = (keysText: string): Element =>
  div()
    .flex_none()
    .text_size(textSize.default)
    .text_color(colors().dim)
    .child(formatKeys(keysText, currentPlatform()));
