import { settings } from 'herdr';

import { stringOf } from './fields.ts';
import { perTurn } from './perTurn.ts';

const defaultTerminalFont = 'JetBrains Mono';

export const terminalFont = perTurn(
  (): string => stringOf(settings()['font_family']) ?? defaultTerminalFont,
);
