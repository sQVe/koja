import type { ThemeToken } from './palette.ts';

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

const roleFallback: ThemeToken = 'muted';

/** @public */
export const roleToken = (role: string): ThemeToken => roleTokens.get(role) ?? roleFallback;

export const roleColorTokens = (): ThemeToken[] => [
  ...new Set([...roleTokens.values(), roleFallback]),
];
