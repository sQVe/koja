import { theme } from 'herdr';

import type { Palette } from './palette.ts';
import { toPalette } from './palette.ts';

export const colors = (): Palette => toPalette(theme());
