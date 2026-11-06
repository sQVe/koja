import type { ThemeToken } from '../../kit/palette.ts';

export interface HeaderTone {
  tinted: boolean;
  title: ThemeToken;
  icon: ThemeToken;
}

const focusedTone: HeaderTone = { tinted: false, title: 'foreground', icon: 'muted' };

const unfocusedTone: HeaderTone = { tinted: false, title: 'muted', icon: 'dim' };

const normalFocusedTone: HeaderTone = { tinted: true, title: 'accent', icon: 'accent' };

export const headerTone = (focused: boolean, normalMode: boolean): HeaderTone => {
  if (!focused) {
    return unfocusedTone;
  }

  return normalMode ? normalFocusedTone : focusedTone;
};
