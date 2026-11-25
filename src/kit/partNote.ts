import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { controlSize, radius, spacing } from './size.ts';
import { stateLine } from './stateLine.ts';
import { detailText } from './text.ts';
import { colors } from './theme.ts';

export interface PartNoteOptions {
  part: string;
  age: string;
}

const retryAction = (): Element => {
  const palette = colors();

  return h_flex()
    .h(controlSize.button)
    .px(spacing.medium)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
    .border(spacing.hairline)
    .border_color(palette.border)
    .child(detailText('Retry', palette.muted));
};

// A part that fails to refresh keeps its last good rows, and its section says how old they are.
export const partNote = (options: PartNoteOptions): Element => {
  const note = `Could not sync ${options.part} · showing ${options.part} from ${options.age}`;

  return stateLine({ kind: 'error', text: note, action: retryAction() });
};
