import { settings } from 'herdr';

import { stringOf } from './fields.ts';

const defaultTerminalFont = 'JetBrains Mono';

// settings() is a host read, so one turn reads the font once, as theme.ts does for the palette.
let turnFont: string | null = null;

const clearTurnFont = (): void => {
  turnFont = null;
};

export const terminalFont = (): string => {
  if (turnFont === null) {
    turnFont = stringOf(settings()['font_family']) ?? defaultTerminalFont;
    Promise.resolve().then(clearTurnFont).catch(clearTurnFont);
  }

  return turnFont;
};
