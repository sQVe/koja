import { recordOf, stringOf } from '../kit/fields.ts';

export interface TerminalRecord {
  address: unknown;
  labels: Record<string, unknown>;
}

export interface TerminalMetadata {
  role: string | null;
  task: string | null;
}

export const terminalRecordOf = (record: unknown): TerminalRecord => {
  const terminal = recordOf(record);

  return { address: terminal['address'], labels: recordOf(terminal['labels']) };
};

export const terminalLabel = (record: TerminalRecord, key: string): string | null => {
  const label = stringOf(record.labels[key]);

  return label === '' ? null : label;
};

export const terminalMetadata = (records: readonly unknown[]): Map<unknown, TerminalMetadata> => {
  const metadata = new Map<unknown, TerminalMetadata>();

  for (const record of records) {
    const terminal = terminalRecordOf(record);
    const role = terminalLabel(terminal, 'tau.role') ?? terminalLabel(terminal, 'tau.profile');
    const task = terminalLabel(terminal, 'tau.task');
    const previous = metadata.get(terminal.address);
    const firstRole = previous === undefined ? role : previous.role;
    const lastTask = task ?? previous?.task ?? null;

    metadata.set(terminal.address, { role: firstRole, task: lastTask });
  }

  return metadata;
};
