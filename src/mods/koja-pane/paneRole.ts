import type { PaneInfo } from 'herdr';

import { recordOf, stringOf } from '../../kit/fields.ts';

const recordFor = (
  terminalRecords: readonly unknown[],
  address: string,
): Record<string, unknown> | null => {
  for (const record of terminalRecords) {
    const terminal = recordOf(record);

    if (terminal['address'] === address) {
      return terminal;
    }
  }

  return null;
};

const labelOf = (terminal: Record<string, unknown>, key: string): string | null => {
  const label = stringOf(recordOf(terminal['labels'])[key]);

  return label === '' ? null : label;
};

export const paneRole = (pane: PaneInfo, terminalRecords: readonly unknown[]): string | null => {
  if (pane.terminal === null) {
    return null;
  }

  const terminal = recordFor(terminalRecords, pane.terminal);

  if (terminal === null) {
    return null;
  }

  return labelOf(terminal, 'tau.role') ?? labelOf(terminal, 'tau.profile');
};
