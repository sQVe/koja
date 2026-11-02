import type { Element } from 'gpui-kit';

// The forced hover look, for the gallery: it draws the pointer's hover without a pointer.
export interface HoverOptions {
  hovered?: boolean;
}

// Draws `look` now for a forced hover, or while the pointer is over the element.
export const withHover = (
  element: Element,
  hovered: boolean,
  look: (element: Element) => Element,
): Element => (hovered ? look(element) : element.hover(look));
