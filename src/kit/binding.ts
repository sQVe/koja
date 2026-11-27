import { commandIdentity } from './commandTitles.ts';
import { isRecord, recordOf, stringOf } from './fields.ts';

export const namesBinding = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number';

export const bindingAction = (command: string, args: Record<string, unknown>): string => {
  const value = Object.values(args)[0];

  return namesBinding(value) ? `${command}:${value}` : command;
};

export const actionIdentity = (action: string): string | null => {
  if (!action.trimStart().startsWith('{')) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(action);
    const record = recordOf(parsed);
    const command = stringOf(record['command']);
    const args = record['args'];

    if (command === null || !isRecord(args)) {
      return null;
    }

    return commandIdentity(command, args);
  } catch {
    return null;
  }
};
