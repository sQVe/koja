import { settings } from 'herdr';

import { stringOf } from './fields.ts';

const defaultTerminalFont = 'JetBrains Mono';

// settings() is a host call. The cache avoids one read per document line within a turn.
// The job below clears the cache on either outcome, and the host runs queued jobs between renders,
// so a font change still shows on the next render.
let turnFont: string | null = null;

const clearTurnFont = (): void => {
  turnFont = null;
};

// The terminal's font, which a document and a diff also draw in.
export const terminalFont = (): string => {
  if (turnFont === null) {
    turnFont = stringOf(settings()['font']) ?? defaultTerminalFont;

    Promise.resolve().then(clearTurnFont).catch(clearTurnFont);
  }

  return turnFont;
};
