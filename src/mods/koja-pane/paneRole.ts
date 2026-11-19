import { terminalLabel, terminalRecordOf } from '../../data/terminalRecord.ts';

const recordFor = (
  terminalRecords: readonly unknown[],
  address: string,
): ReturnType<typeof terminalRecordOf> | null => {
  for (const record of terminalRecords) {
    const terminal = terminalRecordOf(record);

    if (terminal.address === address) {
      return terminal;
    }
  }

  return null;
};

export const paneRole = (
  terminalAddress: string,
  terminalRecords: readonly unknown[],
): string | null => {
  const terminal = recordFor(terminalRecords, terminalAddress);

  if (terminal === null) {
    return null;
  }

  return terminalLabel(terminal, 'tau.role') ?? terminalLabel(terminal, 'tau.profile');
};
