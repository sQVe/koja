import type { Element } from 'gpui-kit';

export interface HoverOptions {
  hovered?: boolean;
}

export const withHover = (
  element: Element,
  hovered: boolean,
  look: (element: Element) => Element,
): Element => (hovered ? look(element) : element.hover(look));
