import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { colors, controlSize, icon, iconButton, spacing, tab } from '../../kit/index.ts';

export const tabs = (): Element[] => [
  h_flex()
    .h(controlSize.tabBar)
    .items_center()
    .gap(spacing.xxsmall)
    .bg(colors().chrome)
    .child(
      tab({
        label: 'Active',
        active: true,
        icon: icon('terminal', 'small'),
        status: 'working',
        close: iconButton({ name: 'x', size: 'small' }),
      }),
    )
    .child(
      tab({
        label: 'Blocked',
        active: false,
        icon: icon('terminal', 'small'),
        status: 'blocked',
        close: null,
      }),
    )
    .child(
      tab({
        label: 'Hovered',
        active: false,
        icon: null,
        status: 'done',
        close: null,
        hovered: true,
      }),
    )
    .child(tab({ label: 'Idle', active: false, icon: null, status: 'idle', close: null }))
    .child(div().flex_1()),
];
