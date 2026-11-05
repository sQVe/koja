import type { Element } from 'gpui-kit';

import { icon, iconButton, indicator, sectionHeader } from '../../kit/index.ts';

export const headers = (): Element[] => [
  sectionHeader({ label: 'Default header', size: 'default' }),
  sectionHeader({ label: 'Bar header', size: 'bar', end: [iconButton({ name: 'plus' })] }),
  sectionHeader({
    label: 'Interactive header',
    size: 'default',
    interactive: true,
    start: icon('monitor', 'small'),
    end: [indicator('ansi2'), icon('chevron-down', 'small')],
  }),
];
