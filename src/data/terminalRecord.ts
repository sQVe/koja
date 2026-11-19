import { recordOf, stringOf } from '../kit/fields.ts';

export interface TerminalRecord {
  address: unknown;
  labels: Record<string, unknown>;
}

export const terminalRecordOf = (record: unknown): TerminalRecord => {
  const terminal = recordOf(record);

  return { address: terminal['address'], labels: recordOf(terminal['labels']) };
};

export const terminalLabel = (record: TerminalRecord, key: string): string | null => {
  const label = stringOf(record.labels[key]);

  return label === '' ? null : label;
};
