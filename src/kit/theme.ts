import { theme } from 'herdr';

import type { Color, Palette } from './palette.ts';
import { toPalette } from './palette.ts';

export const colors = (): Palette => toPalette(theme());

// The one fill a focused header draws. It resolves to the hover theme color, but it is the kit's
// own focus value, so a focus fill never reuses the hover style by name.
export const focusFill = (): Color => colors().hover;
