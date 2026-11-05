import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon, iconButton, spacing, statusMark, toggleButton } from '../../kit/index.ts';
import { sample } from './sample.ts';

export const buttons = (): Element[] => [
  sample(
    'Small 16 px button beside the 22 px button',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .child(iconButton({ name: 'plus' }))
      .child(iconButton({ name: 'plus', size: 'small' })),
  ),
  sample(
    'Icon buttons: normal, hovered, small, small hovered',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .child(iconButton({ name: 'plus' }))
      .child(iconButton({ name: 'plus', hovered: true }))
      .child(iconButton({ name: 'x', size: 'small' }))
      .child(iconButton({ name: 'x', size: 'small', hovered: true })),
  ),
  sample(
    'Toggle buttons: active, normal, hovered, quiet',
    h_flex()
      .gap(spacing.xxsmall)
      .child(toggleButton({ label: 'Active', active: true, start: icon('file', 'small') }))
      .child(
        toggleButton({ label: 'Normal', active: false, start: statusMark('blocked'), end: '2' }),
      )
      .child(toggleButton({ label: 'Hovered', active: false, hovered: true }))
      .child(toggleButton({ label: 'Quiet', active: false, quiet: true })),
  ),
];
