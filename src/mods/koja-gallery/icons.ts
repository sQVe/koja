import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { IconName } from '../../kit/index.ts';
import { detailText, icon, iconNames, programIcon, spacing, spinner } from '../../kit/index.ts';
import { sample } from './sample.ts';

const iconSizes = ['xsmall', 'small', 'default', 'large'] as const;

const iconTile = (name: IconName): Element =>
  v_flex().gap(spacing.xsmall).items_center().child(icon(name, 'large')).child(detailText(name));

export const icons = (): Element[] => {
  const sizes = h_flex()
    .gap(spacing.medium)
    .items_center()
    .children(iconSizes.map((size) => icon('folder', size)));

  const withoutProgram = h_flex()
    .gap(spacing.medium)
    .items_center()
    .child(spinner())
    .child(programIcon(null));

  return [
    h_flex().flex_wrap().gap(spacing.medium).children(iconNames.map(iconTile)),
    sample('Sizes', sizes),
    sample('Spinner and program icon without a program', withoutProgram),
  ];
};
