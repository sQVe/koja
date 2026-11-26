import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { isUpperCaseLetter } from './keys.ts';
import type { OverlayHint } from './shortcutBinding.ts';
import type { Color } from './palette.ts';
import { keycapOutlineAlpha, withAlpha } from './palette.ts';
import { badgeSize, keycapSize, spacing } from './size.ts';
import { terminalFont } from './terminalFont.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

// The font centers its line box, which puts letters without an ascender low in the cap. Raise those
// by one pixel, and those with a descender as well by one more.
const tallGlyphs = /[A-Z0-9bdfhijklt↵]/u;
const descendingGlyphs = /[gjpqy]/u;

const glyphRaise = (label: string): number => {
  const short = tallGlyphs.test(label) ? 0 : 1;
  const descending = descendingGlyphs.test(label) ? 1 : 0;

  return short + descending;
};

const keyLabel = (key: string): string => (isUpperCaseLetter(key) ? `⇧${key}` : key);

const keycapFrame = (outline: Color, fill: Color | null): Element => {
  const frame = h_flex()
    .h(keycapSize.height)
    .min_w(keycapSize.minimumWidth)
    .pl(keycapSize.padding + keycapSize.opticalShift)
    .pr(keycapSize.padding)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(badgeSize.radius)
    .border(spacing.hairline)
    .border_color(outline);

  return fill === null ? frame : frame.bg(fill);
};

const keycapGlyph = (label: string, ink: Color): Element => {
  const box = div().flex_none().relative().top(-glyphRaise(label));
  const glyph = withTextRole(box, 'detail').text_color(ink);

  return glyph.font_family(terminalFont()).child(label);
};

export const keycap = (key: string): Element =>
  keycapFrame(colors().border, colors().popover).child(keycapGlyph(keyLabel(key), colors().dim));

// The mode pill's own look: its accent text and its outline, with the overlay surface as the fill.
export const pressedKeycap = (key: string): Element =>
  keycapFrame(colors().selected, colors().popover).child(
    keycapGlyph(keyLabel(key), colors().accent),
  );

// A keycap inside a filled button: the button's own ink, with a half-strength outline.
export const buttonKeycap = (key: string, ink: Color): Element =>
  keycapFrame(withAlpha(ink, keycapOutlineAlpha), null).child(keycapGlyph(keyLabel(key), ink));

export const keycaps = (keys: string[]): Element =>
  h_flex()
    .flex_none()
    .gap(keycapSize.gap)
    .items_center()
    .children(keys.map((key) => keycap(key)));

export const overlayHints = (hint: OverlayHint, normalMode: boolean): Element[] => {
  const keys = normalMode ? hint.normal : (hint.insert ?? []);

  return keys.length === 0 ? [] : [keycaps(keys)];
};
