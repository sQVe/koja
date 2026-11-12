import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { rowHeight, sidebarSize, spacing } from './size.ts';
import { stackProgress } from './stackProgress.ts';
import { separator } from './text.ts';
import { roleText, withTextRole } from './textRole.ts';

export interface SpaceFooterOptions {
  title: string;
  progress?: { merged: number; total: number };
  links: Element[];
  end: Element;
}

const footerLine = (start: Element, end: Element[]): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .h(rowHeight.small)
    .px(sidebarSize.rowContentInset)
    .gap(spacing.small)
    .items_center()
    .child(start)
    .children(end);

const joinedLinks = (links: Element[]): Element => {
  const joined = h_flex().flex_1().min_w(0).gap(spacing.xsmall).items_center();

  links.forEach((link, index) => {
    if (index > 0) {
      joined.child(withTextRole(div().flex_none(), 'detail').child('·'));
    }

    joined.child(link);
  });

  return joined;
};

const progressOf = (options: SpaceFooterOptions): Element[] => {
  if (options.progress === undefined) {
    return [];
  }

  return [stackProgress({ ...options.progress, label: 'merged' })];
};

export const spaceFooter = (options: SpaceFooterOptions): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(div().mx(spacing.xsmall).child(separator()))
    .child(
      footerLine(
        roleText('title', options.title).flex_1().tooltip(options.title),
        progressOf(options),
      ),
    )
    .child(footerLine(joinedLinks(options.links), [options.end]));
