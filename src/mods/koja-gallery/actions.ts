import type { InputState } from 'gpui-base';
import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { actionButton, spacing, textField } from '../../kit/index.ts';
import { sample } from './sample.ts';

export const actions = (empty: InputState, focused: InputState, filled: InputState): Element[] => [
  sample(
    'Action buttons: enabled, hovered, disabled',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .child(actionButton({ label: 'Commit', enabled: true }))
      .child(actionButton({ label: 'Commit', enabled: true, hovered: true }))
      .child(actionButton({ label: 'Commit', enabled: false })),
  ),
  sample(
    'Text fields: empty, focused, filled',
    v_flex()
      .gap(spacing.medium)
      .child(textField(empty, false))
      .child(textField(focused, true))
      .child(textField(filled, false)),
  ),
];
