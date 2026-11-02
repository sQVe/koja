import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import { keys } from 'herdr';

import { highlightRuns } from './highlight.ts';
import { formatKeys } from './keys.ts';
import { spacing, textSize } from './size.ts';
import { colors } from './theme.ts';
import { currentPlatform } from './window.ts';

export const separator = (): Element =>
  div().flex_none().my(spacing.xsmall).h(spacing.hairline).bg(colors().border);

// What a list says when it has nothing to show.
export const emptyState = (text: string): Element =>
  div()
    .px(spacing.large)
    .py(spacing.medium)
    .text_size(textSize.small)
    .text_color(colors().dim)
    .child(text);

// A detail beside a name, such as a count or a pull request number, in a theme color.
export const detailText = (text: string, color = colors().dim): Element =>
  div().flex_none().text_size(textSize.small).text_color(color).child(text);

// Text with the letters a search matched in the accent color. Matched letters are separate
// elements, so the text clips instead of ending in an ellipsis.
export const highlightedText = (
  text: string,
  positions: readonly number[],
  emphasized: boolean,
): Element => {
  const palette = colors();
  const plain = emphasized ? palette.foreground : palette.muted;

  const runs = highlightRuns(text, positions).map((run) =>
    div()
      .text_color(run.highlighted ? palette.accent : plain)
      .child(run.text.replaceAll(' ', '\u00a0')),
  );

  return h_flex().min_w(0).overflow_hidden().children(runs);
};

// The global key bound to the first of `actions` that has one, such as "pane.split:right".
export const shortcutFor = (...actions: string[]): string | null => {
  const binding = keys().find(
    (candidate) => candidate.section === 'global' && actions.includes(candidate.action),
  );

  return binding?.keys ?? null;
};

export const keyHint = (keysText: string): Element =>
  detailText(formatKeys(keysText, currentPlatform()));
