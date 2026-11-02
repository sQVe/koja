import type { Element } from 'gpui-kit';
import { image, svg } from 'gpui-kit';
import type { Program } from 'herdr';

import type { IconName } from './iconNames.ts';
import { modName } from './modName.ts';
import { iconSize, spinnerPeriod } from './size.ts';

export type IconSize = keyof typeof iconSize;

// Herdr loads an icon by its path under its home, and the build copies the kit's icons into
// every mod's folder.
export const icon = (name: IconName, size: IconSize = 'default'): Element =>
  svg(`mods/${modName}/icons/${name}.svg`).size(iconSize[size]).flex_none();

export const spinner = (size: IconSize = 'xsmall'): Element =>
  icon('loader-circle', size).spin(spinnerPeriod);

// A program's icon comes from Herdr's program table: a one-color glyph takes the text color,
// anything else keeps its own colors.
export const programIcon = (program: Program | null, size: IconSize = 'large'): Element => {
  const path = program?.icon ?? null;

  if (path === null) {
    return icon('terminal', size);
  }

  const drawn = program?.tint === true ? svg(path) : image(path);

  return drawn.size(iconSize[size]).flex_none();
};
