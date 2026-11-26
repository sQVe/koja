import { theme } from 'herdr';

import type { Palette } from './palette.ts';
import { toPalette } from './palette.ts';
import { perTurn } from './perTurn.ts';

export const colors = perTurn((): Palette => toPalette(theme()));
