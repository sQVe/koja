import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import { controlSize, radius, sidebarSize, spacing } from './size.ts';
import { stateLine } from './stateLine.ts';
import { detailText } from './text.ts';
import { colors } from './theme.ts';

export interface PartNoteOptions {
  part: string;
  age: string;
  // Reads the part again from the note's Retry.
  onRetry?: (cx: Context) => void;
}

const retryAction = (onRetry: ((cx: Context) => void) | undefined): Element => {
  const palette = colors();

  const pill = h_flex()
    .h(controlSize.button)
    .px(spacing.medium)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
    .border(spacing.hairline)
    .border_color(palette.border)
    .child(detailText('Retry', palette.muted));

  if (onRetry === undefined) {
    return pill;
  }

  return pill
    .cursor_pointer()
    .hover((style) => style.bg(palette.hover))
    .on_click((_event, cx) => {
      onRetry(cx);
    });
};

// A part that fails to refresh keeps its last good rows, and its section says how old they are.
export const partNote = (options: PartNoteOptions): Element => {
  const note = `Could not sync ${options.part} · showing ${options.part} from ${options.age}`;

  const line = stateLine({
    kind: 'error',
    text: note,
    action: retryAction(options.onRetry),
    paddingStart: sidebarSize.rowContentInset,
  });

  return line;
};
