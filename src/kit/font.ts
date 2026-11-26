import type { Element } from 'gpui-kit';
import { settings } from 'herdr';

import { stringOf } from './fields.ts';

const defaultTerminalFont = 'JetBrains Mono';

const defaultTerminalFontSize = 14;

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

// The terminal's font size, which a document and a diff also draw at.
export const terminalFontSize = (): number => {
  const size = settings()['font_size'];

  return typeof size === 'number' && Number.isFinite(size) ? size : defaultTerminalFontSize;
};

// A document or a diff draws at the terminal's font, whose size the person sets.
export const terminalFontStyle = (element: Element, fontSize: number): Element =>
  element.font_family(terminalFont()).text_size(fontSize);
