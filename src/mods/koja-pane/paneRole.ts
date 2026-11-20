import { terminalMetadata } from '../../data/terminalRecord.ts';

export const paneRole = (
  terminalAddress: string,
  terminalRecords: readonly unknown[],
): string | null => terminalMetadata(terminalRecords).get(terminalAddress)?.role ?? null;
