import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { colors, splitButton, splitButtonOpenHeight, spacing } from '../../kit/index.ts';
import type { SplitButtonChoice } from '../../kit/index.ts';
import { sample } from './sample.ts';

const noop = (): void => undefined;

// The merge menu of the ready PR view: the current method first, then the other methods.
const mergeChoices = (): SplitButtonChoice[] => [
  { label: 'Squash and merge', current: true, action: noop },
  { label: 'Ask agent to merge', action: noop },
  { label: 'Merge commit', action: noop },
  { label: 'Rebase and merge', action: noop },
];

const button = (open: boolean, choices: SplitButtonChoice[]): Element =>
  splitButton({
    label: 'Squash and merge',
    open,
    onMainAction: noop,
    onToggleMenu: noop,
    choices,
  });

export const splitButtons = (): Element[] => {
  const choices = mergeChoices();

  const specimens = h_flex()
    .gap(spacing.xlarge)
    .items_start()
    .child(button(false, choices))
    .child(button(true, choices));

  const stage = h_flex()
    .p(spacing.medium)
    .min_h(splitButtonOpenHeight(choices) + 2 * spacing.medium)
    .bg(colors().chrome)
    .items_start()
    .child(specimens);

  return [sample('Closed, and open with its menu under the right edge', stage)];
};
