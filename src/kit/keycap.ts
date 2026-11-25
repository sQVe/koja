import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import { settings } from 'herdr';

import { stringOf } from './fields.ts';
import type { ThemeToken } from './palette.ts';
import { badgeSize, keycapSize, spacing } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

// A row carries the sequence of its own mode: the normal-mode one always, and the insert-mode
// binding when the row has one.
export interface OverlayHint {
  normal: string[];
  insert?: string[];
}

const defaultTerminalFont = 'JetBrains Mono';

// The font centers its line box, which puts letters without an ascender low in the cap. Raise those
// by one pixel, and those with a descender as well by one more.
const tallGlyphs = /[A-Z0-9bdfhijklt↵]/u;
const descendingGlyphs = /[gjpqy]/u;

// settings() is a host read, so one turn reads the font once, as theme.ts does for the palette.
let turnTerminalFont: string | null = null;

const clearTurnTerminalFont = (): void => {
  turnTerminalFont = null;
};

const terminalFont = (): string => {
  if (turnTerminalFont === null) {
    turnTerminalFont = stringOf(settings()['font_family']) ?? defaultTerminalFont;
    Promise.resolve().then(clearTurnTerminalFont).catch(clearTurnTerminalFont);
  }

  return turnTerminalFont;
};

const glyphRaise = (label: string): number => {
  const short = tallGlyphs.test(label) ? 0 : 1;
  const descending = descendingGlyphs.test(label) ? 1 : 0;

  return short + descending;
};

const keyLabel = (key: string): string => (/^[A-Z]$/u.test(key) ? `⇧${key}` : key);

const keycapFrame = (outline: ThemeToken): Element =>
  h_flex()
    .h(keycapSize.height)
    .min_w(keycapSize.minimumWidth)
    .pl(keycapSize.padding + keycapSize.opticalShift)
    .pr(keycapSize.padding)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(badgeSize.radius)
    .border(spacing.hairline)
    .border_color(colors()[outline])
    .bg(colors().popover);

const keycapGlyph = (label: string, ink: ThemeToken): Element => {
  const box = div().flex_none().relative().top(-glyphRaise(label));
  const glyph = withTextRole(box, 'detail', ink);

  return glyph.font_family(terminalFont()).child(label);
};

export const keycap = (key: string): Element =>
  keycapFrame('border').child(keycapGlyph(keyLabel(key), 'dim'));

// The mode pill's own look: its accent text and its outline, with the overlay surface as the fill.
export const pressedKeycap = (key: string): Element =>
  keycapFrame('selected').child(keycapGlyph(keyLabel(key), 'accent'));

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
