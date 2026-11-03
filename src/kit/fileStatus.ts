import type { Color, Palette } from './palette.ts';

export type FileStatus = 'A' | 'M' | 'D' | 'U';

export const fileStatusColor = (status: FileStatus, palette: Palette): Color => {
  if (status === 'A') {
    return palette.ansi2;
  }

  if (status === 'D' || status === 'U') {
    return palette.ansi1;
  }

  return palette.blocked;
};
