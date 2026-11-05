import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon, iconSlot } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { spacing } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

interface RepoLabelOptions {
  name: string;
  branch?: string;
  age?: string;
  folded: boolean;
  selected: boolean;
}

const nameToken = (options: RepoLabelOptions): ThemeToken => {
  if (options.folded) {
    return 'dim';
  }

  return options.selected ? 'foreground' : 'muted';
};

export const foldChevron = (folded: boolean): Element =>
  iconSlot(icon(folded ? 'chevron-right' : 'chevron-down', 'small')).text_color(colors().dim);

const branchElement = (branch: string): Element =>
  withTextRole(div().min_w(0).truncate().text_ellipsis_middle(), 'detail').child(branch);

const ageElement = (age: string): Element => withTextRole(div().flex_none(), 'detail').child(age);

const separatorElement = (): Element => withTextRole(div().flex_none(), 'detail').child(' · ');

const detailParts = (options: RepoLabelOptions): Element[] => {
  const parts: Element[] = [];

  if (options.branch !== undefined) {
    parts.push(branchElement(options.branch));
  }

  const hasBoth = options.branch !== undefined && options.age !== undefined;

  if (hasBoth) {
    parts.push(separatorElement());
  }

  if (options.age !== undefined) {
    parts.push(ageElement(options.age));
  }

  return parts;
};

export const repoLabel = (options: RepoLabelOptions): Element => {
  const name = withTextRole(
    div().flex_none().max_w_full().truncate(),
    'sectionHeading',
    nameToken(options),
  ).child(options.name);

  const label = h_flex().min_w(0).gap(spacing.small).items_center().child(name);
  const parts = detailParts(options);

  if (parts.length === 0) {
    return label;
  }

  return label.child(h_flex().min_w(0).items_center().children(parts));
};
