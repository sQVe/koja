import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { image, svg } from 'gpui-kit';
import type { Program } from 'herdr';

import type { IconName } from './iconNames.ts';
import { modName } from './modName.ts';
import { iconSize, spinnerPeriod } from './size.ts';

export type IconSize = keyof typeof iconSize;

export const icon = (name: IconName, size: IconSize = 'default'): Element =>
  svg(`mods/${modName}/icons/${name}.svg`).size(iconSize[size]).flex_none();

export const spinner = (size: IconSize = 'xsmall'): Element =>
  icon('loader-circle', size).spin(spinnerPeriod);

export const programIcon = (program: Program | null, size: IconSize = 'large'): Element => {
  const path = program?.icon ?? null;

  if (path === null) {
    return icon('terminal', size);
  }

  const drawn = program?.tint === true ? svg(path) : image(path);

  return drawn.size(iconSize[size]).flex_none();
};

export const iconSlot = (content: Element): Element =>
  h_flex().size(iconSize.large).flex_none().items_center().justify_center().child(content);
