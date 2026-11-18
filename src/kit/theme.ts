import { theme } from 'herdr';

import type { Color, Palette } from './palette.ts';
import { toPalette } from './palette.ts';

// theme() is a host call. The cache avoids one host read per colors() call within a turn.
// The job below clears the cache on either outcome, and the host runs queued jobs between renders,
// so a theme change still shows on the next render.
let turnPalette: Palette | null = null;

const clearTurnPalette = (): void => {
  turnPalette = null;
};

export const colors = (): Palette => {
  if (turnPalette === null) {
    turnPalette = toPalette(theme());

    Promise.resolve().then(clearTurnPalette).catch(clearTurnPalette);
  }

  return turnPalette;
};

// The one fill a focused header draws. It resolves to the hover theme color, but it is the kit's
// own focus value, so a focus fill never reuses the hover style by name.
export const focusFill = (): Color => colors().hover;
