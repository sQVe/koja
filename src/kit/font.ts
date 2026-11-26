import { settings } from 'herdr';

import { stringOf } from './fields.ts';

const defaultTerminalFont = 'JetBrains Mono';

// The terminal's font, which a document and a diff also draw in.
export const terminalFont = (): string =>
  stringOf(settings()['font_family']) ?? defaultTerminalFont;
