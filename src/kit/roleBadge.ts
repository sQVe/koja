import type { Element } from 'gpui-kit';

import type { ThemeToken } from './palette.ts';
import { tintedBadge } from './statusMark.ts';

const roleTokens = new Map<string, ThemeToken>([
  ['lead', 'ansi4'],
  ['architect', 'ansi4'],
  ['worker', 'ansi2'],
  ['scout', 'ansi3'],
  ['reviewer', 'ansi3'],
  ['checker', 'ansi3'],
  ['qa', 'ansi5'],
  ['browser', 'ansi5'],
]);

/** @public */
export const roleToken = (role: string): ThemeToken => roleTokens.get(role) ?? 'muted';

/** @public */
export const roleBadge = (role: string): Element => tintedBadge(role, roleToken(role));
